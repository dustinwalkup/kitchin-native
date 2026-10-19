-- groceries_init: the household's grocery list and its items, the checked trigger, their grants, RLS
-- and policies, and provisioning that now creates the list (design §4.3 second block, §4.4, §4.6;
-- task 4.2). Also tightens handle_audit_fields so members can't clear created_by (owner review of 2.9).
-- Lists are read-only to the app: provisioning creates exactly one per household (21.1, DD21).

-- Tables

create table public.grocery_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null default 'Groceries' check (char_length(name) between 1 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  unique (id, household_id)
);
create index grocery_lists_household_id_idx on public.grocery_lists (household_id);

create table public.grocery_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  list_id      uuid not null,
  name         text not null check (char_length(name) between 1 and 200 and name !~ '^\s' and name !~ '\s$'),  -- DD16
  category     text not null default 'other'
               check (category in ('produce','meat','dairy','pantry','frozen','bakery','other')),
  quantity     text check (quantity is null or (char_length(quantity) between 1 and 50
                                                 and quantity !~ '^\s' and quantity !~ '\s$')),
  notes        text check (notes is null or char_length(notes) <= 1000),
  is_checked   boolean not null default false,
  checked_at   timestamptz,
  checked_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  check (is_checked = (checked_at is not null)),
  foreign key (list_id, household_id)
    references public.grocery_lists (id, household_id) on delete cascade        -- 19.6, 21.5
);
create index grocery_items_household_id_idx on public.grocery_items (household_id);
create index grocery_items_list_id_idx      on public.grocery_items (list_id);
create unique index grocery_items_one_open_per_name
  on public.grocery_items (list_id, lower(name)) where not is_checked;          -- 21.3, K4

-- Functions (design §3.11)

-- Records who checked an item and when. A repeat check keeps the first checker (7.4).
create function private.handle_grocery_item_checked()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.is_checked is distinct from old.is_checked then
    if new.is_checked then new.checked_at := now(); new.checked_by := auth.uid();
    else new.checked_at := null; new.checked_by := null; end if;
  else
    new.checked_at := old.checked_at;                                           -- client can't rewrite the history
    if new.checked_by is not null then new.checked_by := old.checked_by; end if; -- but ON DELETE SET NULL works
  end if;
  return new;
end $$;
revoke all on function private.handle_grocery_item_checked() from public, anon, authenticated;

-- Replaces the core_households version. created_by may now become null only when no user is signed
-- in, which is the ON DELETE SET NULL from deleting an account, so members can't clear attribution.
create or replace function private.handle_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    if auth.uid() is not null then          -- app users always get auth.uid(); seeds (run as postgres) may set attribution
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
    end if;
  else
    if new.id is distinct from old.id
       or new.household_id is distinct from old.household_id
       or new.created_at is distinct from old.created_at
       or (new.created_by is distinct from old.created_by
           and (new.created_by is not null or auth.uid() is not null)) then
      raise exception 'immutable column changed' using errcode = '42501';    -- 19.5
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function private.handle_audit_fields() from public, anon, authenticated;

-- Same-timing triggers fire in name order, so the numeric prefixes set the order.
create trigger grocery_lists_10_audit   before insert or update on public.grocery_lists
  for each row execute function private.handle_audit_fields();
create trigger grocery_items_10_audit   before insert or update on public.grocery_items
  for each row execute function private.handle_audit_fields();
create trigger grocery_items_20_checked before insert or update on public.grocery_items
  for each row execute function private.handle_grocery_item_checked();

-- Replaces the core_households version to also create the household's one grocery list (21.1, DD17).
-- Still one statement, so any exception rolls everything back (23.3).
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
  return v_household;
end $$;
revoke all on function private.provision_household(text, text, text[], text[]) from public, anon, authenticated;

-- Grants, RLS and policies (design §4.4). anon gets nothing (19.3).

alter table public.grocery_lists enable row level security;
revoke all on public.grocery_lists from anon, authenticated;
grant select on public.grocery_lists to authenticated;

create policy "grocery_lists: members read" on public.grocery_lists for select to authenticated
  using (household_id in (select private.my_household_ids()));

alter table public.grocery_items enable row level security;
revoke all on public.grocery_items from anon, authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;

create policy "grocery_items: members read"   on public.grocery_items for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "grocery_items: members insert" on public.grocery_items for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy "grocery_items: members update" on public.grocery_items for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy "grocery_items: members delete" on public.grocery_items for delete to authenticated
  using (household_id in (select private.my_household_ids()));
