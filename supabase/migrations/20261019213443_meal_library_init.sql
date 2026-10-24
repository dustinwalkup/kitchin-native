-- meal_library_init: the household's meal library (saved meals, tags and the links between them), the
-- tag-name and starter-tag functions, the audit and broadcast triggers, grants, RLS and policies,
-- provisioning that now adds the starter tags, and a backfill for existing households (meal library
-- design §4.1–§4.4, task 15.2).
-- Additive (N30, R28.5): no core table, policy or grocery or meal object changes, the installed build
-- never reads these tables, and provision_household keeps its signature, so this deploys ahead of the
-- update that adds the library (§5).
-- Nothing here references meal_entries, and meal_entries references nothing here (47.7, K19).

-- Tables

-- The app sends a phone-generated id for a new meal, so a retried save finds the row it made (DD46).
-- Only the name is one line; the description and ingredients may hold line breaks (42.2).
create table public.library_meals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null constraint library_meals_name_check
                 check (char_length(name) between 1 and 100 and name !~ '^\s' and name !~ '\s$'
                        and name !~ '[\n\r\u0085  ]'),                            -- 47.2
  description  text constraint library_meals_description_check
                 check (description is null or (char_length(description) between 1 and 300
                        and description !~ '^\s' and description !~ '\s$')),               -- 47.2
  ingredients  text constraint library_meals_ingredients_check
                 check (ingredients is null or (char_length(ingredients) between 1 and 2000
                        and ingredients !~ '^\s' and ingredients !~ '\s$')),               -- 47.2, 47.9
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  unique (id, household_id)                                                             -- the links' key (19.6)
);
create index library_meals_household_id_idx on public.library_meals (household_id);

-- name_key is the name in lower case with each run of whitespace as one space, so the database keeps
-- one tag per normalized name for any caller (DD44). The app's tagKey mirrors it.
create table public.library_tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null constraint library_tags_name_check
                 check (char_length(name) between 1 and 30 and name !~ '^\s' and name !~ '\s$'
                        and name !~ '[\n\r\u0085  ]'),                            -- 47.3
  name_key     text not null generated always as (lower(regexp_replace(name, '\s+', ' ', 'g'))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint library_tags_one_per_name unique (household_id, name_key),                -- 47.4, DD44
  unique (id, household_id)                                                             -- the links' key (19.6)
);
-- library_tags_one_per_name leads with household_id, so it serves the RLS filter and there's no separate
-- household_id index.

-- The composite foreign keys keep both ends of a link in the link's household, even for postgres (19.6).
create table public.library_meal_tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_id      uuid not null,
  tag_id       uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint library_meal_tags_one_per_pair unique (meal_id, tag_id),                  -- 47.5
  foreign key (meal_id, household_id)
    references public.library_meals (id, household_id) on delete cascade,              -- 19.6, 47.6
  foreign key (tag_id, household_id)
    references public.library_tags (id, household_id) on delete cascade                -- 19.6, 47.6
);
-- library_meal_tags_one_per_pair serves the cascade from a meal, and the tag_id index the cascade from a
-- tag. As on the other tables, attribution isn't indexed.
create index library_meal_tags_household_id_idx on public.library_meal_tags (household_id);
create index library_meal_tags_tag_id_idx       on public.library_meal_tags (tag_id);

-- Functions (design §4.2). Both are invokers that only postgres can run.

-- A tag keeps its first spelling (DD45). The upsert's conflict path sets the name to a spelling with the
-- same key, which this quietly undoes, so both members get the existing tag back (46.8). A change to the
-- key is a rename, which is out of scope (K22, 43.11).
create function private.handle_library_tag_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(regexp_replace(new.name, '\s+', ' ', 'g'))
     is distinct from lower(regexp_replace(old.name, '\s+', ' ', 'g')) then
    raise exception 'immutable column changed' using errcode = '42501';
  end if;
  new.name := old.name;
  return new;
end $$;
revoke all on function private.handle_library_tag_name() from public, anon, authenticated;

-- The starter tags (43.8, DD47), the same list as STARTER_TAGS in the app. Skips any that exist, so it's
-- safe to run again. No member created them, so they're unattributed (47.8).
create function private.add_starter_tags(p_household uuid)
returns void language sql set search_path = '' as $$
  insert into public.library_tags (household_id, name)
  select p_household, t.name
    from unnest(array['Quick & Easy', 'Family Favorite', 'High Protein', 'Breakfast', 'Lunch',
                      'Dinner', 'Meal Prep']) as t(name)
  on conflict (household_id, name_key) do nothing
$$;
revoke all on function private.add_starter_tags(uuid) from public, anon, authenticated;

-- Triggers. Same-timing triggers fire in name order, so the numeric prefixes set the order. Both shared
-- functions are reused unchanged.

create trigger library_meals_10_audit         before insert or update on public.library_meals
  for each row execute function private.handle_audit_fields();               -- 19.5, 19.7, 19.8, 47.8
create trigger library_meals_90_broadcast     after insert or update or delete on public.library_meals
  for each row execute function private.broadcast_household_change();        -- 11, 22, 46.1
create trigger library_tags_10_audit          before insert or update on public.library_tags
  for each row execute function private.handle_audit_fields();
create trigger library_tags_20_name           before update on public.library_tags
  for each row execute function private.handle_library_tag_name();          -- DD45
create trigger library_tags_90_broadcast      after insert or update or delete on public.library_tags
  for each row execute function private.broadcast_household_change();
create trigger library_meal_tags_10_audit     before insert or update on public.library_meal_tags
  for each row execute function private.handle_audit_fields();
create trigger library_meal_tags_90_broadcast after insert or update or delete on public.library_meal_tags
  for each row execute function private.broadcast_household_change();

-- Grants, RLS and policies (design §4.3, MVP §4.4). anon gets nothing (19.3). An upsert's conflict path
-- runs under the update policy, so a member of another household can't write into a meal or tag
-- (finding 1).

-- Meals: the app adds, edits and deletes them.
alter table public.library_meals enable row level security;
revoke all on public.library_meals from anon, authenticated;
grant select, insert, update, delete on public.library_meals to authenticated;

create policy "library_meals: members read"   on public.library_meals for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "library_meals: members insert" on public.library_meals for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy "library_meals: members update" on public.library_meals for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy "library_meals: members delete" on public.library_meals for delete to authenticated
  using (household_id in (select private.my_household_ids()));

-- Tags: never deleted (43.11). UPDATE is only for the upsert's conflict path (DD45, DD48).
alter table public.library_tags enable row level security;
revoke all on public.library_tags from anon, authenticated;
grant select, insert, update on public.library_tags to authenticated;

create policy "library_tags: members read"   on public.library_tags for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "library_tags: members insert" on public.library_tags for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy "library_tags: members update" on public.library_tags for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- Links: added with on conflict do nothing and removed by pair, never changed (DD48).
alter table public.library_meal_tags enable row level security;
revoke all on public.library_meal_tags from anon, authenticated;
grant select, insert, delete on public.library_meal_tags to authenticated;

create policy "library_meal_tags: members read"   on public.library_meal_tags for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "library_meal_tags: members insert" on public.library_meal_tags for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy "library_meal_tags: members delete" on public.library_meal_tags for delete to authenticated
  using (household_id in (select private.my_household_ids()));

-- Provisioning (design §4.4)

-- Replaces the groceries_init version to also add the starter tags (43.8, DD47, R23.2 as amended). The
-- signature and permissions don't change, and it's still one statement, so any exception rolls
-- everything back (23.3).
create or replace function private.provision_household(
  p_name text, p_time_zone text, p_member_emails text[], p_display_names text[]
) returns uuid language plpgsql set search_path = '' as $$
declare v_household uuid; v_user uuid;
begin
  if coalesce(array_length(p_member_emails, 1), 0) = 0
     or array_length(p_member_emails, 1) is distinct from array_length(p_display_names, 1) then
    raise exception 'emails and display names must be non-empty and the same length';
  end if;
  insert into public.households (name, time_zone) values (p_name, p_time_zone) returning id into v_household;
  for i in 1 .. array_length(p_member_emails, 1) loop
    select u.id into v_user from auth.users u where lower(u.email) = lower(p_member_emails[i]);
    if v_user is null then raise exception 'no auth user for member %', i; end if;
    insert into public.household_members (household_id, user_id, display_name)
      values (v_household, v_user, p_display_names[i]);
  end loop;
  insert into public.grocery_lists (household_id) values (v_household);
  perform private.add_starter_tags(v_household);                               -- 43.8, DD47
  return v_household;
end $$;
revoke all on function private.provision_household(text, text, text[], text[]) from public, anon, authenticated;

-- Households that exist already get the starter tags too, with no step by anyone (43.8).
select private.add_starter_tags(h.id) from public.households h;
