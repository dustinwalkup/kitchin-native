-- Households and memberships, acting as the seeded users (4-test-plan §2.2, task 2.6).
-- A and B are in Household One (H1), C is in Household Two (H2), D has no membership.
-- DB-H-12 renames H1, so it runs after every other test that looks H1 up by name.
-- Meals task 22.1 added DB-H-19 to DB-H-23 for the start of the week (meals 4-test-plan §14.1), which
-- fail until migration household_week_start lands.
begin;
select plan(39);

-- Rows the current role can see across every public table, so tables added later are covered too.
create function pg_temp.visible_public_rows() returns bigint language plpgsql as $$
declare v_table text; v_count bigint; v_total bigint := 0;
begin
  for v_table in select c.relname from pg_catalog.pg_class c
                  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
                    and pg_catalog.has_table_privilege(current_user, c.oid, 'select') loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end $$;

-- Sets H1's start of the week to each day in turn, as the current role, and returns what each update
-- stored. It ends on Monday, the seed's value.
create function pg_temp.set_each_week_start() returns setof text language plpgsql as $$
declare v_day text; v_stored text;
begin
  foreach v_day in array array['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'monday'] loop
    update public.households set week_start = v_day where id = tests.household_id('Household One')
      returning week_start into v_stored;
    return next v_stored;
  end loop;
end $$;

-- postgres: every household starts on Monday (R48.3)

select set_eq(
  $$ select week_start from public.households
      where id in (tests.household_id('Household One'), tests.household_id('Household Two')) $$,
  array['monday'], 'DB-H-19 both seeded households start their week on Monday');
-- Provisioning inserts only the name and time zone, so the default is what a new household gets.
select results_eq(
  $$ with h as (insert into public.households (name, time_zone) values ('Household Week', 'UTC')
                returning week_start)
     select week_start from h $$,
  array['monday'], 'DB-H-19 a new household starts its week on Monday');

-- C, in H2

select tests.authenticate_as('member-c@example.com');

select results_eq(
  $$ with u as (update public.households set week_start = 'sunday'
                 where id = tests.household_id('Household One') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-H-22 C''s update to Household One''s start of the week affects 0 rows');

select is_empty($$ select 1 from public.households where id = tests.household_id('Household One') $$,
  'DB-H-03 C sees no Household One household row');
select is_empty(
  $$ select 1 from public.household_members where household_id = tests.household_id('Household One') $$,
  'DB-H-03 C sees no Household One memberships');

-- D, with no membership

reset role;
select tests.authenticate_as('member-d@example.com');

select is(pg_temp.visible_public_rows(), 0::bigint, 'DB-H-04 D sees no rows in any public table');

-- anon

reset role;
select tests.authenticate_as_anon();

select throws_ok($$ select 1 from public.households $$, '42501', null, 'DB-H-05 anon cannot read households');
select throws_ok($$ select 1 from public.household_members $$, '42501', null,
  'DB-H-05 anon cannot read household_members');

-- A, in H1

reset role;
select tests.authenticate_as('member-a@example.com');

select cmp_ok(pg_temp.visible_public_rows(), '>', 0::bigint,
  'DB-H-04 control: the same count sees A''s rows, so D''s zero is meaningful');

select set_eq($$ select id from public.households $$, array[tests.household_id('Household One')],
  'DB-H-01 A sees only Household One');
select set_eq($$ select household_id, user_id from public.household_members $$,
  $$ values (tests.household_id('Household One'), tests.user_id('member-a@example.com')),
            (tests.household_id('Household One'), tests.user_id('member-b@example.com')) $$,
  'DB-H-02 A sees exactly the two Household One memberships');

-- The start of the week (R48). These run before anything else updates H1, so updated_at still holds
-- the seed's time until DB-H-20 changes it.
select results_eq($$ select * from pg_temp.set_each_week_start() $$,
  $$ values ('tuesday'), ('wednesday'), ('thursday'), ('friday'), ('saturday'), ('sunday'), ('monday') $$,
  'DB-H-20 A can set Household One''s start of the week to each of the seven days');
select ok(
  (select updated_at = now() and updated_at > created_at
     from public.households where id = tests.household_id('Household One')),
  'DB-H-20 updated_at advances to the server time');
select throws_ok(
  $$ update public.households set week_start = 'Sunday' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-21 a capitalized day is rejected');
select throws_ok(
  $$ update public.households set week_start = 'sun' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-21 an abbreviated day is rejected');
select throws_ok(
  $$ update public.households set week_start = '' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-21 an empty start of the week is rejected');
select throws_ok(
  $$ update public.households set week_start = 'funday' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-21 an unknown day is rejected');
select throws_ok(
  $$ update public.households set week_start = null where id = tests.household_id('Household One') $$,
  '23502', null, 'DB-H-21 a null start of the week is rejected');
select results_eq(
  $$ with u as (update public.households set week_start = 'sunday'
                 where id = tests.household_id('Household Two') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-H-22 A''s update to Household Two''s start of the week affects 0 rows');

-- Entries are stored by date, so the start of the week never touches them (R48.6).
reset role;
create temp table h1_entries_before on commit drop as
  select * from public.meal_entries where household_id = tests.household_id('Household One');
grant select on h1_entries_before to authenticated;
select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ update public.households set week_start = 'sunday' where id = tests.household_id('Household One') $$,
  'DB-H-23 A moves Household One''s start of the week to Sunday');
select set_eq($$ select * from public.meal_entries where household_id = tests.household_id('Household One') $$,
  $$ select * from h1_entries_before $$,
  'DB-H-23 Household One''s meal entries are exactly as they were');

select throws_ok(
  $$ insert into public.household_members (household_id, user_id, display_name)
     values (tests.household_id('Household Two'), tests.user_id('member-a@example.com'), 'Member A') $$,
  '42501', null, 'DB-H-06 A cannot add themselves to Household Two');
select throws_ok(
  $$ insert into public.household_members (household_id, user_id, display_name)
     values (tests.household_id('Household One'), tests.user_id('member-d@example.com'), 'Member D') $$,
  '42501', null, 'DB-H-07 A cannot add another user to Household One');
select throws_ok(
  $$ update public.household_members set display_name = 'Renamed'
      where user_id = tests.user_id('member-a@example.com') $$,
  '42501', null, 'DB-H-08 A cannot change their own display name');
select throws_ok(
  $$ delete from public.household_members where user_id = tests.user_id('member-b@example.com') $$,
  '42501', null, 'DB-H-09 A cannot delete a membership');

select throws_ok($$ insert into public.households (name) values ('Household Three') $$,
  '42501', null, 'DB-H-10 A cannot create a household');
select throws_ok($$ delete from public.households where id = tests.household_id('Household One') $$,
  '42501', null, 'DB-H-11 A cannot delete Household One');

select results_eq(
  $$ with u as (update public.households set name = 'Taken over'
                 where id = tests.household_id('Household Two') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-H-13 A''s update to Household Two affects 0 rows');
-- With no WHERE clause nothing reads the rows first, so only the UPDATE policy limits them. The
-- postgres section checks that Household Two is unchanged.
select lives_ok($$ update public.households set time_zone = 'Asia/Tokyo' $$,
  'DB-H-13 A can run an update with no WHERE clause');

select throws_ok(
  $$ update public.households set id = gen_random_uuid() where id = tests.household_id('Household One') $$,
  '42501', null, 'DB-H-14 A cannot change Household One''s id');
select throws_ok(
  $$ update public.households set created_at = created_at - interval '1 day'
      where id = tests.household_id('Household One') $$,
  '42501', null, 'DB-H-14 A cannot change Household One''s created_at');
select throws_ok(
  $$ update public.households set time_zone = 'Mars/Olympus' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-15 an unknown time zone is rejected');
select throws_ok(
  $$ update public.households set name = '' where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-16 an empty name is rejected');
select throws_ok(
  $$ update public.households set name = repeat('x', 101) where id = tests.household_id('Household One') $$,
  '23514', null, 'DB-H-16 a 101-character name is rejected');

-- Claims that point at H2 change nothing: policies use only auth.uid() (R18.6, R19.12).
select set_config('request.jwt.claims', json_build_object(
  'sub', tests.user_id('member-a@example.com'), 'role', 'authenticated',
  'user_metadata', json_build_object('household_id', tests.household_id('Household Two')),
  'app_metadata', json_build_object('household_id', tests.household_id('Household Two')))::text, true);

select set_eq($$ select id from public.households $$, array[tests.household_id('Household One')],
  'DB-H-18 metadata claims for Household Two are ignored');

-- The seed's zone is America/Chicago, so the test moves it to another valid IANA zone.
select results_eq(
  $$ with u as (update public.households set name = 'Household One Renamed', time_zone = 'America/New_York'
                 where id = tests.household_id('Household One') returning name, time_zone)
     select name, time_zone from u $$,
  $$ values ('Household One Renamed', 'America/New_York') $$,
  'DB-H-12 A can rename Household One and change its time zone');
-- The seed ran in an earlier transaction, so now() (this transaction's time) is later than created_at.
select ok(
  (select updated_at = now() and updated_at > created_at
     from public.households where name = 'Household One Renamed'),
  'DB-H-12 updated_at advances to the server time');

-- postgres

reset role;

select ok(exists (select 1 from public.households where name = 'Household Two' and time_zone = 'Europe/London'),
  'DB-H-13 Household Two is unchanged');
select throws_ok(
  $$ insert into public.household_members (household_id, user_id, display_name)
     values (tests.household_id('Household Two'), tests.user_id('member-d@example.com'), repeat('x', 51)) $$,
  '23514', null, 'DB-H-17 a 51-character display name is rejected');

select * from finish();
rollback;
