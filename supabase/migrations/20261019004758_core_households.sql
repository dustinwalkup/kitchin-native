-- core_households: households and memberships, the shared trigger functions, provisioning, and
-- their grants, RLS and policies (design §4.3 first block, §4.4, §4.6; task 2.4).
-- Households and memberships are created only by private.provision_household, which only postgres
-- can run (R20.2, R20.3, R23.5).

-- Per-schema default privileges: nothing new in public is exposed unless granted explicitly.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Tables

create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  time_zone  text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_id_idx on public.household_members (user_id);

-- Functions (design §3.11)

-- Membership lookup for every policy. Definer, so the household_members policy doesn't recurse.
create function private.my_household_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select hm.household_id from public.household_members hm where hm.user_id = (select auth.uid())
$$;
revoke all on function private.my_household_ids() from public, anon;
grant execute on function private.my_household_ids() to authenticated;

create function private.handle_household_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid time zone' using errcode = '23514';             -- 20.5 → validation
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.updated_at := now();
  else
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'immutable column changed' using errcode = '42501';    -- 20.4
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function private.handle_household_write() from public, anon, authenticated;
create trigger households_10_write before insert or update on public.households
  for each row execute function private.handle_household_write();

-- For the household-data tables that later migrations add, starting with groceries_init.
create function private.handle_audit_fields()
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
       or (new.created_by is distinct from old.created_by and new.created_by is not null) then
      raise exception 'immutable column changed' using errcode = '42501';    -- 19.5
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function private.handle_audit_fields() from public, anon, authenticated;
-- (The `new.created_by is not null` clause lets ON DELETE SET NULL through when an auth user is deleted.)

-- Invoker, and executable only by postgres (DD17). One statement, so any exception rolls everything
-- back (23.3). groceries_init replaces it to add the household's grocery list.
create function private.provision_household(
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
  return v_household;
end $$;
revoke all on function private.provision_household(text, text, text[], text[]) from public, anon, authenticated;

-- Grants, RLS and policies (design §4.4). anon gets nothing (19.3).

-- Members read their household and change only its name and time zone; the trigger rejects the rest (20.4).
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;
grant select, update on public.households to authenticated;

create policy "households: members read"   on public.households for select to authenticated
  using (id in (select private.my_household_ids()));
create policy "households: members update" on public.households for update to authenticated
  using (id in (select private.my_household_ids()))
  with check (id in (select private.my_household_ids()));

-- Memberships are read-only to the app (20.1, 20.2).
alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;

create policy "household_members: members read" on public.household_members for select to authenticated
  using (household_id in (select private.my_household_ids()));
