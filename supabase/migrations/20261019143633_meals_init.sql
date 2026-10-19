-- meals_init: the household's meal entries, one per date and meal, with the slot trigger, the audit and
-- broadcast triggers, grants, RLS and policies (meals design §4.1–§4.3, task 9.2).
-- Additive (N24): no core table, policy or grocery object changes, and the installed build never reads
-- meal_entries, so this deploys ahead of the build with the Meals tab (§5).
-- No parent row and nothing to provision: a household starts with no entries (DD23, 38.7).

-- Tables

create table public.meal_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_date    date not null,                                                             -- 34.2, 38.4
  meal_type    text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),       -- 38.3
  body         text not null check (char_length(body) between 1 and 500
                                    and body !~ '^\s' and body !~ '\s$'),                 -- 38.3, as DD16
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint meal_entries_one_per_slot unique (household_id, meal_date, meal_type)        -- 38.2, DD24
);
-- The unique constraint's index leads with household_id, so it serves the RLS filter and the week
-- query and there's no separate household_id index. As on the grocery tables, attribution isn't indexed.

-- Functions (design §4.2)

-- An entry stays in its slot (38.6). The upsert's SET repeats the key with the same values, which passes.
create function private.handle_meal_entry_slot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.meal_date is distinct from old.meal_date or new.meal_type is distinct from old.meal_type then
    raise exception 'immutable column changed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.handle_meal_entry_slot() from public, anon, authenticated;

-- Triggers. Same-timing triggers fire in name order, so the numeric prefixes set the order. Both
-- shared functions are reused unchanged.

create trigger meal_entries_10_audit     before insert or update on public.meal_entries
  for each row execute function private.handle_audit_fields();                -- 19.5, 19.7, 19.8, 32.8
create trigger meal_entries_20_slot      before update on public.meal_entries
  for each row execute function private.handle_meal_entry_slot();               -- 38.6
create trigger meal_entries_90_broadcast after insert or update or delete on public.meal_entries
  for each row execute function private.broadcast_household_change();           -- 11, 22, 35.1

-- Grants, RLS and policies (design §4.3, MVP §4.4). anon gets nothing (19.3). An upsert's conflict path
-- runs under the update policy, so a member of another household can't write into the slot (finding 1).

alter table public.meal_entries enable row level security;
revoke all on public.meal_entries from anon, authenticated;
grant select, insert, update, delete on public.meal_entries to authenticated;

create policy "meal_entries: members read"   on public.meal_entries for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "meal_entries: members insert" on public.meal_entries for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy "meal_entries: members update" on public.meal_entries for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy "meal_entries: members delete" on public.meal_entries for delete to authenticated
  using (household_id in (select private.my_household_ids()));
