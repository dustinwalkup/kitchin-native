-- Grocery lists and items, acting as the seeded users (4-test-plan §2.4, task 4.1).
-- A and B are in Household One (H1), C is in Household Two (H2).
-- These fail until migration groceries_init (task 4.2) lands.
-- DB-G-19 deletes B, so it runs last.
begin;
select plan(47);

-- Fixtures, as postgres. The file builds its own items, so it doesn't depend on what the seed holds.
-- With the triggers off they're backdated a day and attributed directly, so a test can tell an
-- unchanged timestamp from one the trigger reset to now().
delete from public.grocery_items;
alter table public.grocery_items disable trigger user;
insert into public.grocery_items
  (household_id, list_id, name, category, is_checked, checked_at, checked_by,
   created_at, updated_at, created_by, updated_by)
select l.household_id, l.id, f.name, f.category, f.checker is not null,
       case when f.checker is not null then now() - interval '1 day' end,
       case when f.checker is not null then tests.user_id(f.checker) end,
       now() - interval '1 day', now() - interval '1 day', tests.user_id(f.creator), tests.user_id(f.updater)
  from (values
    ('Household One', 'Bread',  'bakery',  null,                   'member-a@example.com', 'member-b@example.com'),
    ('Household One', 'Apples', 'produce', 'member-a@example.com', 'member-a@example.com', 'member-a@example.com'),
    ('Household Two', 'Rice',   'pantry',  null,                   'member-c@example.com', 'member-c@example.com'),
    ('Household Two', 'Cheese', 'dairy',   'member-c@example.com', 'member-c@example.com', 'member-c@example.com')
  ) as f(household, name, category, checker, creator, updater)
  join public.grocery_lists l on l.household_id = tests.household_id(f.household);
alter table public.grocery_items enable trigger user;

-- Item IDs by name, under any role. A lookup that RLS filtered would return null, and an isolation
-- check against null would pass for the wrong reason. Raises unless it finds exactly one row.
create function pg_temp.item_id(p_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select i.id into strict v_id from public.grocery_items i where i.name = p_name;
  return v_id;
end $$;

-- C, in H2

select tests.authenticate_as('member-c@example.com');

select is_empty($$ select 1 from public.grocery_items where household_id = tests.household_id('Household One') $$,
  'DB-G-02 C sees no Household One items');
select is_empty($$ select 1 from public.grocery_lists where household_id = tests.household_id('Household One') $$,
  'DB-G-02 C sees no Household One list');
select set_eq($$ select name from public.grocery_items $$, array['Rice', 'Cheese'],
  'DB-G-02 control: C sees exactly the Household Two items');

select throws_ok(
  $$ insert into public.grocery_items (household_id, list_id, name)
     values (tests.household_id('Household One'), tests.list_id('Household One'), 'Milk') $$,
  '42501', null, 'DB-G-04 C cannot insert into Household One');
select results_eq(
  $$ with u as (update public.grocery_items set quantity = '9' where id = pg_temp.item_id('Bread') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-G-05 C''s update to a Household One item affects 0 rows');
select results_eq(
  $$ with d as (delete from public.grocery_items where id = pg_temp.item_id('Bread') returning 1)
     select count(*)::int from d $$,
  array[0], 'DB-G-06 C''s delete of a Household One item affects 0 rows');

-- anon

reset role;
select tests.authenticate_as_anon();

select throws_ok($$ select 1 from public.grocery_items $$, '42501', null, 'DB-G-03 anon cannot read grocery_items');
select throws_ok($$ select 1 from public.grocery_lists $$, '42501', null, 'DB-G-03 anon cannot read grocery_lists');

-- postgres

reset role;

select ok(exists (select 1 from public.grocery_items where name = 'Bread' and quantity is null),
  'DB-G-05 DB-G-06 Bread still exists, and its quantity is unchanged');
select set_eq(
  $$ select h.name, count(l.id)::int from public.households h
       left join public.grocery_lists l on l.household_id = h.id group by h.name $$,
  $$ values ('Household One', 1), ('Household Two', 1) $$,
  'DB-G-10 each seeded household has exactly one grocery list');

-- A, in H1: isolation

select tests.authenticate_as('member-a@example.com');

select set_eq($$ select name from public.grocery_items $$, array['Bread', 'Apples'],
  'DB-G-01 A sees only the Household One items');
select set_eq($$ select id from public.grocery_lists $$, array[tests.list_id('Household One')],
  'DB-G-01 A sees only the Household One list');

select throws_ok(
  $$ update public.grocery_items set household_id = tests.household_id('Household Two')
      where id = pg_temp.item_id('Bread') $$,
  '42501', null, 'DB-G-07 A cannot move an item to Household Two');
select throws_ok(
  $$ insert into public.grocery_items (household_id, list_id, name)
     values (tests.household_id('Household One'), tests.list_id('Household Two'), 'Pears') $$,
  '23503', null, 'DB-G-08 A cannot insert a Household One item on the Household Two list');

select throws_ok(
  $$ insert into public.grocery_lists (household_id, name) values (tests.household_id('Household One'), 'Second list') $$,
  '42501', null, 'DB-G-09 A cannot insert a grocery list');
select throws_ok(
  $$ update public.grocery_lists set name = 'Renamed' where id = tests.list_id('Household One') $$,
  '42501', null, 'DB-G-09 A cannot update a grocery list');
select throws_ok(
  $$ delete from public.grocery_lists where id = tests.list_id('Household One') $$,
  '42501', null, 'DB-G-09 A cannot delete a grocery list');

-- A: attribution and timestamps. The fixtures were written a day ago, so now() (this transaction's
-- time) shows that a trigger set the value.

select results_eq(
  $$ with i as (insert into public.grocery_items (household_id, list_id, name, created_by, created_at)
                values (tests.household_id('Household One'), tests.list_id('Household One'), 'Eggs',
                        tests.user_id('member-b@example.com'), '2000-01-01')
                returning created_by, created_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-11 a spoofed created_by and created_at are overwritten with A and now()');

select throws_ok(
  $$ update public.grocery_items set created_by = tests.user_id('member-b@example.com')
      where id = pg_temp.item_id('Bread') $$,
  '42501', null, 'DB-G-12 A cannot change created_by');
-- Only ON DELETE SET NULL, which runs with no signed-in user, may clear it (owner review of 2.9).
select throws_ok(
  $$ update public.grocery_items set created_by = null where id = pg_temp.item_id('Bread') $$,
  '42501', null, 'DB-G-30 A cannot clear created_by');

-- Bread was last updated by B.
select results_eq(
  $$ with u as (update public.grocery_items set quantity = '2' where id = pg_temp.item_id('Bread')
                returning updated_by, updated_at = now() and updated_at > created_at)
     select * from u $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-13 an update sets updated_by to A and advances updated_at');

select results_eq(
  $$ with i as (insert into public.grocery_items (household_id, list_id, name, is_checked, checked_by)
                values (tests.household_id('Household One'), tests.list_id('Household One'), 'Bananas', true,
                        tests.user_id('member-b@example.com'))
                returning checked_by, checked_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-14 an item inserted checked records A as the checker, not the spoofed B');

-- A: checked trigger

select results_eq(
  $$ with u as (update public.grocery_items set is_checked = true where id = pg_temp.item_id('Bread')
                returning checked_by, checked_at = now())
     select * from u $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-15 checking an item records A and now()');
select results_eq(
  $$ with u as (update public.grocery_items set is_checked = false where id = pg_temp.item_id('Bread')
                returning checked_at is null and checked_by is null)
     select * from u $$,
  array[true], 'DB-G-16 unchecking an item clears checked_at and checked_by');

-- Apples was checked by A a day ago.
select results_eq(
  $$ with u as (update public.grocery_items
                   set quantity = '3', checked_at = '2000-01-01', checked_by = tests.user_id('member-b@example.com')
                 where id = pg_temp.item_id('Apples')
                returning checked_by, checked_at = now() - interval '1 day')
     select * from u $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-18 a client cannot rewrite checked_at or checked_by');

-- B, in H1

reset role;
select tests.authenticate_as('member-b@example.com');

select results_eq(
  $$ with u as (update public.grocery_items set is_checked = true where id = pg_temp.item_id('Apples')
                returning checked_by, checked_at = now() - interval '1 day')
     select * from u $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-G-17 checking an already checked item keeps the first checker and time');

-- A: duplicates and validation

reset role;
select tests.authenticate_as('member-a@example.com');

-- Adds a Household One item as the current user, so RLS and the triggers apply.
create function pg_temp.add_item(p_name text, p_quantity text default null, p_notes text default null,
                                 p_category text default 'other', p_id uuid default gen_random_uuid())
returns void language sql as $$
  insert into public.grocery_items (id, household_id, list_id, name, quantity, notes, category)
  values (p_id, tests.household_id('Household One'), tests.list_id('Household One'),
          p_name, p_quantity, p_notes, p_category)
$$;

select lives_ok($$ select pg_temp.add_item('Milk') $$, 'DB-G-20 A adds Milk');
select throws_ok($$ select pg_temp.add_item('MILK') $$,
  '23505', 'duplicate key value violates unique constraint "grocery_items_one_open_per_name"',
  'DB-G-20 a second open MILK is rejected by the open-name index');

update public.grocery_items set is_checked = true where id = pg_temp.item_id('Milk');
select lives_ok($$ select pg_temp.add_item('milk') $$, 'DB-G-21 once Milk is checked, A can add milk');
select throws_ok(
  $$ update public.grocery_items set is_checked = false where id = pg_temp.item_id('Milk') $$,
  '23505', 'duplicate key value violates unique constraint "grocery_items_one_open_per_name"',
  'DB-G-22 unchecking Milk while milk is open is rejected (edge case 22)');

select throws_ok($$ select pg_temp.add_item(' Milk') $$, '23514', null,
  'DB-G-23 a name with leading whitespace is rejected');
select throws_ok($$ select pg_temp.add_item('Milk ') $$, '23514', null,
  'DB-G-23 a name with trailing whitespace is rejected');

select throws_ok($$ select pg_temp.add_item('') $$, '23514', null, 'DB-G-24 an empty name is rejected');
select lives_ok($$ select pg_temp.add_item(repeat('x', 200)) $$, 'DB-G-24 a 200-character name is accepted');
select throws_ok($$ select pg_temp.add_item(repeat('y', 201)) $$, '23514', null,
  'DB-G-24 a 201-character name is rejected');
-- char_length counts code points, so each emoji is one character, as in the app's charLength.
select lives_ok($$ select pg_temp.add_item(repeat('🥕', 200)) $$, 'DB-G-24 a 200-emoji name is accepted');

select throws_ok($$ select pg_temp.add_item('Flour', p_quantity => repeat('1', 51)) $$, '23514', null,
  'DB-G-25 a 51-character quantity is rejected');
select throws_ok($$ select pg_temp.add_item('Sugar', p_quantity => '') $$, '23514', null,
  'DB-G-25 an empty quantity is rejected; the app sends null for none');
select throws_ok($$ select pg_temp.add_item('Tea', p_notes => repeat('x', 1001)) $$, '23514', null,
  'DB-G-26 1001-character notes are rejected');
select throws_ok($$ select pg_temp.add_item('Crisps', p_category => 'snacks') $$, '23514', null,
  'DB-G-27 an unknown category is rejected');

-- A retry resends the whole row, so the primary key must fail before the open-name index does. The
-- app treats that as success, which makes retries idempotent (R12.3).
select lives_ok($$ select pg_temp.add_item('Butter', p_id => '0b6f4c1e-5d2a-4f7b-9c3e-8a1d2e3f4a5b') $$,
  'DB-G-28 A adds Butter with a client-supplied id');
select throws_ok($$ select pg_temp.add_item('Butter', p_id => '0b6f4c1e-5d2a-4f7b-9c3e-8a1d2e3f4a5b') $$,
  '23505', 'duplicate key value violates unique constraint "grocery_items_pkey"',
  'DB-G-28 repeating the insert fails on the primary key');

-- A: clear checked. Apples, Bananas and Milk are the checked Household One items. The expected IDs
-- are arguments, so they're looked up before the delete runs.

select set_eq(
  $$ with d as (delete from public.grocery_items
                 where list_id = tests.list_id('Household One') and is_checked returning id)
     select id from d $$,
  array[pg_temp.item_id('Apples'), pg_temp.item_id('Bananas'), pg_temp.item_id('Milk')],
  'DB-G-29 clear checked removes exactly the checked Household One items');
select set_eq($$ select name from public.grocery_items $$,
  array['Bread', 'Eggs', 'milk', 'Butter', repeat('x', 200), repeat('🥕', 200)],
  'DB-G-29 the open Household One items remain');

reset role;
select set_eq($$ select name from public.grocery_items where household_id = tests.household_id('Household Two') $$,
  array['Rice', 'Cheese'], 'DB-G-29 the Household Two items are untouched');

-- Deleting an account (B adds and checks Coffee first)

select tests.authenticate_as('member-b@example.com');
insert into public.grocery_items (household_id, list_id, name, is_checked)
  values (tests.household_id('Household One'), tests.list_id('Household One'), 'Coffee', true);

-- GoTrue deletes an account with no signed-in user, so clear the claims and auth.uid() is null.
reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok($$ delete from auth.users where id = tests.user_id('member-b@example.com') $$,
  'DB-G-19 deleting an account that created and checked items succeeds');
select ok(
  (select created_by is null and updated_by is null and checked_by is null and is_checked
     from public.grocery_items where name = 'Coffee'),
  'DB-G-19 the item stays checked, and its created_by, updated_by and checked_by become null');

select * from finish();
rollback;
