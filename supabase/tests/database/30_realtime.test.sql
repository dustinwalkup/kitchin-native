-- Realtime authorization and the broadcast triggers, acting as the seeded users (4-test-plan §2.5,
-- task 5.1). A and B are in Household One (H1), C is in Household Two (H2), D has no membership.
-- These fail until migrations groceries_init (task 4.2) and realtime_household_broadcast (task 5.2) land.
-- Meals task 9.1 added DB-R-11 to DB-R-13 (meals 4-test-plan §2.3), which fail until migration
-- meals_init (task 9.2) lands. Meal library task 15.1 added DB-R-14 to DB-R-18 (meal library
-- 4-test-plan §2.3), which fail until migration meal_library_init (task 15.2) lands.
--
-- realtime.messages is partitioned by UTC day. The test can't create a missing partition (OI-7):
-- postgres doesn't own the table and has no CREATE on schema realtime. The Realtime server creates
-- yesterday's through today+3's when it starts, and its janitor keeps them current, so the setup
-- insert fails only when Realtime isn't running.
--
-- realtime.send() sets realtime.topic for the rest of the transaction, so the topic checks run
-- before any broadcast, and each section sets the topic it needs.
begin;
select plan(46);

-- Fixtures, as postgres: a broadcast message on each household's topic, and a presence message on H1's.
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload, private)
     values ('household:' || tests.household_id('Household One'), 'broadcast', 'fixture', '{}', true),
            ('household:' || tests.household_id('Household Two'), 'broadcast', 'fixture', '{}', true),
            ('household:' || tests.household_id('Household One'), 'presence',  'fixture', '{}', true) $$,
  'setup: the fixture messages go into today''s partition (if not, restart the stack so Realtime creates it)');

-- Messages the current role can read under the current topic. A refusal (42501) counts as none, so
-- DB-R-05 holds whether or not anon keeps its grant on realtime.messages.
create function pg_temp.readable_messages() returns bigint language plpgsql as $$
begin
  return (select count(*) from realtime.messages);
exception when insufficient_privilege then
  return 0;
end $$;

-- Topic access (R22.1–R22.3). The policy authorizes the topic that realtime.topic() returns, not
-- each row's topic. Realtime's join check reads a message on the topic being joined, so DB-R-01
-- does too. The refusals read the whole table.

-- A, joining H1's topic

select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-a@example.com');

select results_eq(
  $$ select count(*)::int from realtime.messages
      where topic = 'household:' || tests.household_id('Household One')
        and extension = 'broadcast' and event = 'fixture' $$,
  array[1], 'DB-R-01 A can read the broadcast message on Household One''s topic');
select is_empty(
  $$ select 1 from realtime.messages
      where topic = 'household:' || tests.household_id('Household One') and extension = 'presence' $$,
  'DB-R-07 the policy doesn''t cover presence messages on Household One''s topic');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload, private)
     values ('household:' || tests.household_id('Household One'), 'broadcast', 'spoofed', '{}', true) $$,
  '42501', null, 'DB-R-06 A cannot publish on Household One''s topic');

-- A, joining H2's topic

reset role;
select tests.set_topic(tests.household_id('Household Two'));
select tests.authenticate_as('member-a@example.com');

select is(pg_temp.readable_messages(), 0::bigint, 'DB-R-02 A can read nothing on Household Two''s topic');

-- C, D and anon, joining H1's topic

reset role;
select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-c@example.com');

select is(pg_temp.readable_messages(), 0::bigint, 'DB-R-03 C can read nothing on Household One''s topic');

reset role;
select tests.authenticate_as('member-d@example.com');

select is(pg_temp.readable_messages(), 0::bigint, 'DB-R-04 D can read nothing on Household One''s topic');

reset role;
select tests.authenticate_as_anon();

select is(pg_temp.readable_messages(), 0::bigint, 'DB-R-05 anon can read nothing on Household One''s topic');

-- postgres

reset role;

select is_empty(
  $$ select p.policyname from pg_catalog.pg_policies p
      where p.schemaname = 'realtime' and p.tablename = 'messages' and p.cmd <> 'SELECT' $$,
  'DB-R-06 no policy on realtime.messages allows insert, update or delete');

-- Broadcast triggers (R11.1, R11.2). The items get fixed IDs, as the app's client-supplied IDs do
-- (R12.3), so that the messages about them can be told apart from anything else in the table.

-- Every broadcast this transaction sent about one row, oldest first. postgres bypasses RLS.
create function pg_temp.broadcasts_about(p_id uuid)
returns table (topic text, event text, table_name text, is_private boolean) language sql as $$
  select m.topic, m.event, m.payload->>'table', m.private from realtime.messages m
   where m.extension = 'broadcast'
     and m.inserted_at >= pg_catalog.timezone('utc', pg_catalog.now())
     and p_id::text in (m.payload->'record'->>'id', m.payload->'old_record'->>'id')
   order by m.inserted_at
$$;

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into public.grocery_items (id, household_id, list_id, name)
     values ('00000000-0000-4000-8000-000000000008', tests.household_id('Household One'),
             tests.list_id('Household One'), 'Realtime item') $$,
  'DB-R-08 A adds an item');
select lives_ok(
  $$ update public.grocery_items set quantity = '2' where id = '00000000-0000-4000-8000-000000000008' $$,
  'DB-R-08 A changes its quantity');
select lives_ok($$ delete from public.grocery_items where id = '00000000-0000-4000-8000-000000000008' $$,
  'DB-R-08 A deletes it');

reset role;

select results_eq(
  $$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000008') $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'grocery_items', true),
            ('household:' || tests.household_id('Household One'), 'UPDATE', 'grocery_items', true),
            ('household:' || tests.household_id('Household One'), 'DELETE', 'grocery_items', true) $$,
  'DB-R-08 the insert, update and delete each send a private broadcast on Household One''s topic');

select lives_ok(
  $$ update public.grocery_lists set name = 'Realtime list' where id = tests.list_id('Household One') $$,
  'DB-R-09 postgres renames Household One''s list');
select results_eq(
  $$ select * from pg_temp.broadcasts_about(tests.list_id('Household One')) $$,
  $$ values ('household:' || tests.household_id('Household One'), 'UPDATE', 'grocery_lists', true) $$,
  'DB-R-09 the list update sends a private broadcast on Household One''s topic');

-- Meal broadcasts (R11.2 as amended, R35.1, R38.1). Meal entries get their IDs from the server, so
-- the messages are told apart by slot: Household One's dinner on 2030-01-10, which the seed never
-- uses.

-- Every broadcast this transaction sent about the slot that the current role can read, oldest first.
create function pg_temp.broadcasts_about_meal_slot()
returns table (topic text, event text, table_name text, is_private boolean) language sql as $$
  select m.topic, m.event, m.payload->>'table', m.private from realtime.messages m
   where m.extension = 'broadcast'
     and m.inserted_at >= pg_catalog.timezone('utc', pg_catalog.now())
     and m.payload->>'table' = 'meal_entries'
     and exists (select 1 from (values (m.payload->'record'), (m.payload->'old_record')) as r(entry)
                  where r.entry->>'household_id' = tests.household_id('Household One')::text
                    and r.entry->>'meal_date' = '2030-01-10' and r.entry->>'meal_type' = 'dinner')
   order by m.inserted_at
$$;

-- Saves the slot as the current user, with PostgREST's merge-duplicates upsert (design finding 1).
-- PL/pgSQL doesn't check the body until it runs, so the grocery checks in this file still run before
-- meal_entries exists.
create function pg_temp.save_meal_slot(p_body text) returns void language plpgsql as $$
begin
  insert into public.meal_entries (household_id, meal_date, meal_type, body)
  values (tests.household_id('Household One'), '2030-01-10', 'dinner', p_body)
  on conflict (household_id, meal_date, meal_type) do update
  set household_id = excluded.household_id, meal_date = excluded.meal_date,
      meal_type = excluded.meal_type, body = excluded.body;
end $$;

select tests.authenticate_as('member-a@example.com');

select lives_ok($$ select pg_temp.save_meal_slot('Tacos') $$, 'DB-R-11 A saves an empty meal slot');
select lives_ok($$ select pg_temp.save_meal_slot('Enchiladas') $$,
  'DB-R-11 A saves the slot again, which updates it');

reset role;
select tests.authenticate_as('member-c@example.com');

select throws_ok($$ select pg_temp.save_meal_slot('From C') $$, '42501', null,
  'DB-R-13 C cannot save into the Household One slot');

reset role;
select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ delete from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2030-01-10' and meal_type = 'dinner' $$,
  'DB-R-11 A clears the slot');

reset role;

select results_eq(
  $$ select * from pg_temp.broadcasts_about_meal_slot() $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'meal_entries', true),
            ('household:' || tests.household_id('Household One'), 'UPDATE', 'meal_entries', true),
            ('household:' || tests.household_id('Household One'), 'DELETE', 'meal_entries', true) $$,
  'DB-R-11 the two saves and the clear each send a private broadcast on Household One''s topic');
select is_empty(
  $$ select 1 from realtime.messages m
      where m.inserted_at >= pg_catalog.timezone('utc', pg_catalog.now())
        and 'From C' in (m.payload->'record'->>'body', m.payload->'old_record'->>'body') $$,
  'DB-R-13 C''s refused save sent no broadcast');

-- Reading them on Household One's topic (R22.1, R22.2): A can, as the control, and C can't.

select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-a@example.com');

select results_eq($$ select count(*)::int from pg_temp.broadcasts_about_meal_slot() $$, array[3],
  'DB-R-12 control: A can read the three meal broadcasts on Household One''s topic');

reset role;
select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-c@example.com');

select is_empty($$ select * from pg_temp.broadcasts_about_meal_slot() $$,
  'DB-R-12 C can read none of the meal broadcasts on Household One''s topic');

reset role;

-- Library broadcasts (R46.1, R11.2 as amended). The rows get fixed IDs, as a new meal's phone-generated
-- ID does (DD46), so the messages about them can be told apart. Every library statement is a string
-- that pgTAP runs, so until meal_library_init lands these fail one by one and the checks after them
-- still run.
--
--   …0014  Fixture realtime meal         …0015  Fixture Realtime tag
--   …0161  link, added then removed      …0162  link, removed with its meal
--   …0181, …0182, …0183  C's refused meal, tag and link

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into public.library_meals (id, household_id, name)
     values ('00000000-0000-4000-8000-000000000014', tests.household_id('Household One'), 'Fixture realtime meal') $$,
  'DB-R-14 A adds a meal');
select lives_ok(
  $$ update public.library_meals set description = 'Fixture: changed'
      where id = '00000000-0000-4000-8000-000000000014' $$,
  'DB-R-14 A changes its description');
-- The second upsert takes the conflict path, which updates the existing tag (DD45).
select lives_ok(
  $$ insert into public.library_tags (id, household_id, name)
     values ('00000000-0000-4000-8000-000000000015', tests.household_id('Household One'), 'Fixture Realtime')
     on conflict (household_id, name_key) do update set household_id = excluded.household_id, name = excluded.name $$,
  'DB-R-15 A upserts a new tag');
select lives_ok(
  $$ insert into public.library_tags (household_id, name)
     values (tests.household_id('Household One'), 'fixture REALTIME')
     on conflict (household_id, name_key) do update set household_id = excluded.household_id, name = excluded.name $$,
  'DB-R-15 A upserts the same key again');
select lives_ok(
  $$ insert into public.library_meal_tags (id, household_id, meal_id, tag_id)
     values ('00000000-0000-4000-8000-000000000161', tests.household_id('Household One'),
             '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000015')
     on conflict (meal_id, tag_id) do nothing $$,
  'DB-R-16 A tags the meal');
select lives_ok(
  $$ delete from public.library_meal_tags
      where meal_id = '00000000-0000-4000-8000-000000000014' and tag_id = '00000000-0000-4000-8000-000000000015' $$,
  'DB-R-16 A removes the tag');
select lives_ok(
  $$ insert into public.library_meal_tags (id, household_id, meal_id, tag_id)
     values ('00000000-0000-4000-8000-000000000162', tests.household_id('Household One'),
             '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000015')
     on conflict (meal_id, tag_id) do nothing $$,
  'DB-R-16 A tags the meal again');

reset role;
select tests.authenticate_as('member-c@example.com');

select throws_ok(
  $$ insert into public.library_meals (id, household_id, name)
     values ('00000000-0000-4000-8000-000000000014', tests.household_id('Household Two'), 'From C')
     on conflict (id) do update set id = excluded.id, household_id = excluded.household_id, name = excluded.name $$,
  '42501', null, 'DB-R-18 C cannot upsert the Household One meal''s id');
select throws_ok(
  $$ insert into public.library_meals (id, household_id, name)
     values ('00000000-0000-4000-8000-000000000181', tests.household_id('Household One'), 'From C') $$,
  '42501', null, 'DB-R-18 C cannot insert a meal into Household One');
select throws_ok(
  $$ insert into public.library_tags (id, household_id, name)
     values ('00000000-0000-4000-8000-000000000182', tests.household_id('Household One'), 'From C') $$,
  '42501', null, 'DB-R-18 C cannot insert a tag into Household One');
select throws_ok(
  $$ insert into public.library_meal_tags (id, household_id, meal_id, tag_id)
     values ('00000000-0000-4000-8000-000000000183', tests.household_id('Household One'),
             '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000015') $$,
  '42501', null, 'DB-R-18 C cannot insert a link into Household One');

reset role;
select tests.authenticate_as('member-a@example.com');

select lives_ok($$ delete from public.library_meals where id = '00000000-0000-4000-8000-000000000014' $$,
  'DB-R-14 A deletes the meal, which removes its link');

reset role;

select results_eq(
  $$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000014') $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'library_meals', true),
            ('household:' || tests.household_id('Household One'), 'UPDATE', 'library_meals', true),
            ('household:' || tests.household_id('Household One'), 'DELETE', 'library_meals', true) $$,
  'DB-R-14 the meal''s insert, update and delete each send a private broadcast on Household One''s topic');
select results_eq(
  $$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000015') $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'library_tags', true),
            ('household:' || tests.household_id('Household One'), 'UPDATE', 'library_tags', true) $$,
  'DB-R-15 both tag upserts send a private broadcast on Household One''s topic');
select results_eq(
  $$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000161') $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'library_meal_tags', true),
            ('household:' || tests.household_id('Household One'), 'DELETE', 'library_meal_tags', true) $$,
  'DB-R-16 adding and removing a tag each send a private broadcast on Household One''s topic');
select results_eq(
  $$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000162') $$,
  $$ values ('household:' || tests.household_id('Household One'), 'INSERT', 'library_meal_tags', true),
            ('household:' || tests.household_id('Household One'), 'DELETE', 'library_meal_tags', true) $$,
  'DB-R-16 a link removed with its meal sends a delete broadcast too');
select is_empty(
  $$ select 1 from realtime.messages m
      where m.inserted_at >= pg_catalog.timezone('utc', pg_catalog.now())
        and ('From C' in (m.payload->'record'->>'name', m.payload->'old_record'->>'name')
             or m.payload->'record'->>'id' in ('00000000-0000-4000-8000-000000000181',
                                               '00000000-0000-4000-8000-000000000182',
                                               '00000000-0000-4000-8000-000000000183')) $$,
  'DB-R-18 C''s refused upsert and inserts sent no broadcast');

-- Reading them on Household One's topic (R22.1, R22.2): A can, as the control, and C can't.

-- Every library broadcast above that the current role can read.
create function pg_temp.library_broadcasts()
returns table (topic text, event text, table_name text, is_private boolean) language sql as $$
  select b.* from unnest(array['00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000015',
                               '00000000-0000-4000-8000-000000000161',
                               '00000000-0000-4000-8000-000000000162']::uuid[]) as r(id)
   cross join lateral pg_temp.broadcasts_about(r.id) as b
$$;

select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-a@example.com');

select results_eq($$ select count(*)::int from pg_temp.library_broadcasts() $$, array[9],
  'DB-R-17 control: A can read the nine library broadcasts on Household One''s topic');

reset role;
select tests.set_topic(tests.household_id('Household One'));
select tests.authenticate_as('member-c@example.com');

select is_empty($$ select * from pg_temp.library_broadcasts() $$,
  'DB-R-17 C can read none of the library broadcasts on Household One''s topic');

reset role;

-- A failed broadcast never blocks the write (R22.5, N7). realtime.broadcast_changes belongs to
-- supabase_realtime_admin, so postgres can't rename it (OI-7). Instead the trigger function moves to
-- a new role with no USAGE on schema realtime, so its call fails with 42501 inside the guard. The
-- trigger raises the guard's warning, which shows in the test output. ALTER ... OWNER needs postgres
-- to be able to SET ROLE to the new owner, and the new owner to have CREATE on the schema. DB-R-08
-- is the control: the same insert broadcasts when the call works. All of it rolls back.

set local createrole_self_grant = 'set';
create role tests_no_realtime nologin;
grant create on schema private to tests_no_realtime;
select lives_ok($$ alter function private.broadcast_household_change() owner to tests_no_realtime $$,
  'DB-R-10 setup: the broadcast trigger function now runs without access to schema realtime');

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into public.grocery_items (id, household_id, list_id, name)
     values ('00000000-0000-4000-8000-000000000010', tests.household_id('Household One'),
             tests.list_id('Household One'), 'Unbroadcast item') $$,
  'DB-R-10 A''s insert succeeds although its broadcast fails');

reset role;

select ok(exists (select 1 from public.grocery_items where id = '00000000-0000-4000-8000-000000000010'),
  'DB-R-10 the item is stored');
select is_empty($$ select * from pg_temp.broadcasts_about('00000000-0000-4000-8000-000000000010') $$,
  'DB-R-10 no broadcast was sent, so the trigger''s guard caught the failure');

select * from finish();
rollback;
