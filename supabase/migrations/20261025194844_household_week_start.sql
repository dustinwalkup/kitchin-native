-- household_week_start: the household's start of the week, and a broadcast when a member changes the
-- household row (meals design §11.1, task 22.1).
-- Additive (28.5): the column has a default, the installed build selects named columns, and its channel
-- has no handler for a households event, so this deploys ahead of the update that uses it.
-- Grants and policies don't change. Members could already update households (MVP §4.4), and
-- handle_household_write still guards id and created_at (MVP 20.4 as amended).

-- Column (48.3, 48.12, DD62). Day names rather than numbers, which count from different days in
-- JavaScript and Postgres. Every existing household gets Monday, the start it had before.

alter table public.households
  add column week_start text not null default 'monday'
  constraint households_week_start_check check (week_start in
    ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));

-- Functions (design §3.11)

-- As private.broadcast_household_change, but households has id, not household_id (48.5, DD63). A
-- definer for the same reason: members can't write realtime.messages. Any failure becomes a warning,
-- so a broadcast never rolls back the write (22.5, N7).
create function private.broadcast_household_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.broadcast_changes(
      'household:' || new.id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  exception when others then
    raise warning 'household broadcast failed: %', sqlstate;   -- the code only, never row content
  end;
  return null;
end $$;
revoke all on function private.broadcast_household_row_change() from public, anon, authenticated;

-- Trigger. Updates only: only the owner creates and deletes households (R20.3), and no phone has
-- joined a household's topic before it exists.

create trigger households_90_broadcast after update on public.households
  for each row execute function private.broadcast_household_row_change();
