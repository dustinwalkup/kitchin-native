-- private.provision_household, as postgres unless stated (4-test-plan §2.3, task 2.6).
-- From task 4.2, DB-P-01 and the "nothing created" checks include the household's grocery list.
begin;
select plan(14);

select tests.create_user('provision-x@example.com', 'provision-x-password');
select tests.create_user('provision-y@example.com', 'provision-y-password');
select tests.create_user('provision-z@example.com', 'provision-z-password');

-- Success

select lives_ok(
  $$ select private.provision_household('Household Three', 'America/Denver',
       array['provision-x@example.com', 'provision-y@example.com'], array['Member X', 'Member Y']) $$,
  'DB-P-01 provisioning with two existing emails succeeds');
select is((select count(*)::int from public.households where name = 'Household Three' and time_zone = 'America/Denver'),
  1, 'DB-P-01 creates one household');
-- Joins by name rather than tests.household_id, so a failed provisioning fails one test, not the file.
select set_eq(
  $$ select m.user_id, m.display_name from public.household_members m
       join public.households h on h.id = m.household_id where h.name = 'Household Three' $$,
  $$ values (tests.user_id('provision-x@example.com'), 'Member X'),
            (tests.user_id('provision-y@example.com'), 'Member Y') $$,
  'DB-P-01 creates the two memberships');
select is(
  (select count(*)::int from public.grocery_lists l
     join public.households h on h.id = l.household_id where h.name = 'Household Three'),
  1, 'DB-P-01 creates the household''s one grocery list');

select lives_ok(
  $$ select private.provision_household('Household Four', 'UTC', array['Provision-Z@EXAMPLE.com'], array['Member Z']) $$,
  'DB-P-05 emails match auth.users whatever their case');
select set_eq(
  $$ select m.user_id from public.household_members m
       join public.households h on h.id = m.household_id where h.name = 'Household Four' $$,
  array[tests.user_id('provision-z@example.com')],
  'DB-P-05 the membership belongs to the matching user');

-- Failure rolls everything back (R23.3)

create temporary table counts_before on commit drop as
  select (select count(*) from public.households) as households,
         (select count(*) from public.household_members) as memberships,
         (select count(*) from public.grocery_lists) as lists;

-- The first member exists, so the household and one membership are inserted before the exception.
select throws_ok(
  $$ select private.provision_household('Household Five', 'UTC',
       array['provision-x@example.com', 'nobody@example.com'], array['Member X', 'Nobody']) $$,
  'P0001', 'no auth user for member 2', 'DB-P-02 an unknown second email raises');
select results_eq(
  $$ select (select count(*) from public.households), (select count(*) from public.household_members),
            (select count(*) from public.grocery_lists) $$,
  $$ select households, memberships, lists from counts_before $$,
  'DB-P-02 nothing is created');

select throws_ok(
  $$ select private.provision_household('Household Six', 'UTC',
       array['provision-x@example.com', 'provision-y@example.com'], array['Member X']) $$,
  'P0001', 'emails and display names must be non-empty and the same length',
  'DB-P-03 arrays of different lengths raise');
select results_eq(
  $$ select (select count(*) from public.households), (select count(*) from public.household_members),
            (select count(*) from public.grocery_lists) $$,
  $$ select households, memberships, lists from counts_before $$,
  'DB-P-03 nothing is created');

select throws_ok(
  $$ select private.provision_household('Household Seven', 'UTC', array[]::text[], array[]::text[]) $$,
  'P0001', 'emails and display names must be non-empty and the same length',
  'DB-P-04 empty arrays raise');
select results_eq(
  $$ select (select count(*) from public.households), (select count(*) from public.household_members),
            (select count(*) from public.grocery_lists) $$,
  $$ select households, memberships, lists from counts_before $$,
  'DB-P-04 nothing is created');

-- Only postgres can run it (R23.5). The messages matter: if the function were executable, its insert
-- into households would still fail with 42501, and the errcode alone wouldn't notice.

select tests.authenticate_as('member-a@example.com');
select throws_ok(
  $$ select private.provision_household('Household Eight', 'UTC', array['member-a@example.com'], array['Member A']) $$,
  '42501', 'permission denied for function provision_household',
  'DB-P-06 authenticated cannot execute provision_household');

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select private.provision_household('Household Nine', 'UTC', array['member-a@example.com'], array['Member A']) $$,
  '42501', 'permission denied for schema private',
  'DB-P-07 anon cannot reach provision_household');

reset role;
select * from finish();
rollback;
