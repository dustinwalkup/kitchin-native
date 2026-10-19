-- realtime_household_broadcast: every grocery write broadcasts on its household's private topic, and
-- only that household's members can join the topic (design §4.5, §5; task 5.2).
-- Clients only receive. Without an INSERT policy on realtime.messages, they can't publish (22.3).

-- Functions (design §3.11)

-- A security definer, because realtime.send inserts into realtime.messages, which members can't
-- write. Any failure becomes a warning, so a broadcast never rolls back the write (22.5, N7).
create function private.broadcast_household_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.broadcast_changes(
      'household:' || coalesce(new.household_id, old.household_id)::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  exception when others then
    raise warning 'household broadcast failed: %', sqlstate;   -- the code only, never row content
  end;
  return null;
end $$;
revoke all on function private.broadcast_household_change() from public, anon, authenticated;

-- Triggers. As after triggers, they broadcast the row as stored, deletes included (11.1, 11.2). The 90
-- prefix keeps them last if other after triggers are added.

create trigger grocery_lists_90_broadcast after insert or update or delete on public.grocery_lists
  for each row execute function private.broadcast_household_change();
create trigger grocery_items_90_broadcast after insert or update or delete on public.grocery_items
  for each row execute function private.broadcast_household_change();

-- Policy (22.1, 22.2). Realtime runs this check when a client joins a private channel, with
-- realtime.topic() set to the channel's topic.
-- realtime.messages already has RLS enabled; enabling it again fails with 42501.

create policy "household members receive household broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) in (select 'household:' || h::text from private.my_household_ids() as h)
  );
