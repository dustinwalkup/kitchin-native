-- Meal entries, acting as the seeded users (meals 4-test-plan §2.2, task 9.1).
-- A and B are in Household One (H1), C is in Household Two (H2), D has no membership.
-- These fail until migration meals_init (task 9.2) lands.
-- Every entry is in the week of 2030-01-07, so nothing here depends on the seed's entries (§8.1).
-- DB-M-29 deletes B, so it runs last.
begin;
select plan(61);

-- Fixtures, as postgres. With the triggers off they're backdated a day and attributed directly, so a
-- test can tell an unchanged timestamp from one the trigger reset to now(). Monday dinner is planned
-- in both households.
alter table public.meal_entries disable trigger user;
insert into public.meal_entries
  (household_id, meal_date, meal_type, body, created_at, updated_at, created_by, updated_by)
select tests.household_id(f.household), f.meal_date, f.meal_type, f.body,
       now() - interval '1 day', now() - interval '1 day', tests.user_id(f.creator), tests.user_id(f.updater)
  from (values
    ('Household One', date '2030-01-07', 'dinner',    'Spaghetti', 'member-a@example.com', 'member-b@example.com'),
    ('Household One', date '2030-01-08', 'lunch',     'Soup',      'member-b@example.com', 'member-b@example.com'),
    ('Household Two', date '2030-01-07', 'dinner',    'Curry',     'member-c@example.com', 'member-c@example.com'),
    ('Household Two', date '2030-01-08', 'breakfast', 'Porridge',  'member-c@example.com', 'member-c@example.com')
  ) as f(household, meal_date, meal_type, body, creator, updater);
alter table public.meal_entries enable trigger user;

-- Entry IDs by slot, under any role. A lookup that RLS filtered would return null, and an isolation
-- check against null would pass for the wrong reason. Raises unless it finds exactly one row.
create function pg_temp.entry_id(p_household text, p_date date, p_type text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select e.id into strict v_id from public.meal_entries e
   where e.household_id = tests.household_id(p_household) and e.meal_date = p_date and e.meal_type = p_type;
  return v_id;
end $$;

-- Saves a slot as the current user, so RLS and the triggers apply. This is PostgREST's merge-duplicates
-- upsert as postgrest-js sends it for api.ts (design finding 1): no id, and the SET repeats the slot key.
create function pg_temp.save_meal(p_household text, p_date date, p_type text, p_body text)
returns setof public.meal_entries language sql as $$
  insert into public.meal_entries (household_id, meal_date, meal_type, body)
  values (tests.household_id(p_household), p_date, p_type, p_body)
  on conflict (household_id, meal_date, meal_type) do update
  set household_id = excluded.household_id, meal_date = excluded.meal_date,
      meal_type = excluded.meal_type, body = excluded.body
  returning *
$$;

-- Clears a slot as the current user, as api.ts does: a delete by the slot key. Returns the deleted IDs.
create function pg_temp.clear_meal(p_household text, p_date date, p_type text)
returns setof uuid language sql as $$
  delete from public.meal_entries
   where household_id = tests.household_id(p_household) and meal_date = p_date and meal_type = p_type
  returning id
$$;

-- C, in H2

select tests.authenticate_as('member-c@example.com');

select is_empty($$ select 1 from public.meal_entries where household_id = tests.household_id('Household One') $$,
  'DB-M-02 C sees no Household One entries');
select set_eq($$ select body from public.meal_entries where meal_date between '2030-01-07' and '2030-01-13' $$,
  array['Curry', 'Porridge'], 'DB-M-02 control: C sees the Household Two entries');

select throws_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body)
     values (tests.household_id('Household One'), '2030-01-09', 'dinner', 'Pizza') $$,
  '42501', null, 'DB-M-04 C cannot insert into Household One');
select throws_ok($$ select pg_temp.save_meal('Household One', '2030-01-07', 'dinner', 'Pizza') $$,
  '42501', null, 'DB-M-05 C cannot upsert into an occupied Household One slot');
select results_eq(
  $$ with u as (update public.meal_entries set body = 'Pizza'
                 where id = pg_temp.entry_id('Household One', '2030-01-07', 'dinner') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-M-06 C''s update of a Household One entry affects 0 rows');
select is_empty($$ select pg_temp.clear_meal('Household One', '2030-01-07', 'dinner') $$,
  'DB-M-07 C''s delete of a Household One slot affects 0 rows');

-- D, with no household

reset role;
select tests.authenticate_as('member-d@example.com');

select is_empty($$ select 1 from public.meal_entries $$, 'DB-M-08 D sees no entries');
select throws_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body)
     values (tests.household_id('Household One'), '2030-01-09', 'dinner', 'Pizza') $$,
  '42501', null, 'DB-M-08 D cannot insert into Household One');

-- anon

reset role;
select tests.authenticate_as_anon();

select throws_ok($$ select 1 from public.meal_entries $$, '42501', null, 'DB-M-03 anon cannot read meal_entries');
select throws_ok($$ select pg_temp.save_meal('Household One', '2030-01-09', 'dinner', 'Pizza') $$,
  '42501', null, 'DB-M-03 anon cannot save a meal');
select throws_ok($$ update public.meal_entries set body = 'Pizza' where meal_date = '2030-01-07' $$,
  '42501', null, 'DB-M-03 anon cannot update meal_entries');
select throws_ok($$ select pg_temp.clear_meal('Household One', '2030-01-07', 'dinner') $$,
  '42501', null, 'DB-M-03 anon cannot delete from meal_entries');

-- postgres

reset role;

select results_eq(
  $$ select body, updated_by from public.meal_entries
      where id = pg_temp.entry_id('Household One', '2030-01-07', 'dinner') $$,
  $$ values ('Spaghetti', tests.user_id('member-b@example.com')) $$,
  'DB-M-05 DB-M-06 DB-M-07 Household One''s Monday dinner is unchanged');
select is_empty($$ select 1 from public.meal_entries where meal_date = '2030-01-09' $$,
  'DB-M-04 DB-M-08 nothing was saved to Wednesday');
select col_type_is('public', 'meal_entries', 'meal_date', 'date', 'DB-M-23 meal_date is a date, with no time or zone');

-- A, in H1: isolation

select tests.authenticate_as('member-a@example.com');

select is_empty($$ select 1 from public.meal_entries where household_id <> tests.household_id('Household One') $$,
  'DB-M-01 A sees no entries outside Household One');
select set_eq($$ select body from public.meal_entries where meal_date between '2030-01-07' and '2030-01-13' $$,
  array['Spaghetti', 'Soup'], 'DB-M-01 control: A sees the Household One entries');

select throws_ok(
  $$ update public.meal_entries set household_id = tests.household_id('Household Two')
      where id = pg_temp.entry_id('Household One', '2030-01-08', 'lunch') $$,
  '42501', null, 'DB-M-09 A cannot move an entry to Household Two');

-- A and B: one entry per slot (R38.2, R35.3)

select results_eq(
  $$ select body, created_by, updated_by from pg_temp.save_meal('Household One', '2030-01-10', 'dinner', 'Tacos') $$,
  $$ values ('Tacos', tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com')) $$,
  'DB-M-10 A saves an empty slot, as its creator and editor');

-- Remember Thursday dinner and backdate it a day, so DB-M-11 can show that B's save keeps the row
-- and advances updated_at.
reset role;
create temporary table thursday_dinner on commit drop as
  select pg_temp.entry_id('Household One', '2030-01-10', 'dinner') as id;
alter table public.meal_entries disable trigger user;
update public.meal_entries set created_at = now() - interval '1 day', updated_at = now() - interval '1 day'
 where id = (select id from thursday_dinner);
alter table public.meal_entries enable trigger user;

select tests.authenticate_as('member-b@example.com');

-- The SET repeats the slot's own date and meal type, so the slot trigger lets it through (R38.6).
select results_eq(
  $$ select body, created_by, updated_by, updated_at = now() and updated_at > created_at
       from pg_temp.save_meal('Household One', '2030-01-10', 'dinner', 'Enchiladas') $$,
  $$ values ('Enchiladas', tests.user_id('member-a@example.com'), tests.user_id('member-b@example.com'), true) $$,
  'DB-M-11 B''s save to the same slot replaces the text, keeps A as creator and records B as editor');

reset role;

select results_eq(
  $$ select id from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2030-01-10' and meal_type = 'dinner' $$,
  $$ select id from thursday_dinner $$,
  'DB-M-11 the slot still holds one row, with the same id');

select tests.authenticate_as('member-a@example.com');

select lives_ok($$ select pg_temp.save_meal('Household One', '2030-01-11', 'breakfast', 'Pancakes') $$,
  'DB-M-12 A saves Friday breakfast');
select lives_ok($$ select pg_temp.save_meal('Household One', '2030-01-11', 'breakfast', 'Pancakes') $$,
  'DB-M-12 a retry of the same save succeeds');
select results_eq(
  $$ select count(*)::int from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2030-01-11' $$,
  array[1], 'DB-M-12 Friday holds one entry');

select throws_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body)
     values (tests.household_id('Household One'), '2030-01-07', 'dinner', 'Lasagne') $$,
  '23505', 'duplicate key value violates unique constraint "meal_entries_one_per_slot"',
  'DB-M-13 a plain insert into an occupied slot fails on meal_entries_one_per_slot');

select lives_ok($$ select pg_temp.save_meal('Household One', '2030-01-12', 'lunch', 'Salad') $$,
  'DB-M-14 A saves Saturday lunch in Household One');

reset role;

select lives_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body)
     values (tests.household_id('Household Two'), '2030-01-12', 'lunch', 'Salad') $$,
  'DB-M-14 postgres saves Saturday lunch in Household Two');
select set_eq($$ select household_id from public.meal_entries where meal_date = '2030-01-12' and meal_type = 'lunch' $$,
  array[tests.household_id('Household One'), tests.household_id('Household Two')],
  'DB-M-14 each household''s Saturday lunch is a separate row');

select tests.authenticate_as('member-a@example.com');

-- With an id, the upsert's SET would change it, and the audit trigger rejects that. That's why
-- api.ts never sends one (finding 1, DD24).
select throws_ok(
  $$ insert into public.meal_entries (id, household_id, meal_date, meal_type, body)
     values (gen_random_uuid(), tests.household_id('Household One'), '2030-01-07', 'dinner', 'Lasagne')
     on conflict (household_id, meal_date, meal_type) do update
     set id = excluded.id, household_id = excluded.household_id, meal_date = excluded.meal_date,
         meal_type = excluded.meal_type, body = excluded.body $$,
  '42501', null, 'DB-M-15 an upsert into an occupied slot that also sends a new id is rejected');

-- A: validation (R38.3). Every save goes to Sunday dinner, which starts empty, and each accepted one
-- replaces the last.

create function pg_temp.save_sunday(p_body text)
returns setof public.meal_entries language sql as $$
  select * from pg_temp.save_meal('Household One', '2030-01-13', 'dinner', p_body)
$$;

select throws_ok($$ select pg_temp.save_sunday('') $$, '23514', null, 'DB-M-16 an empty body is rejected');

-- Postgres's \s matches all of these, so the app trims them before sending (finding 6, OI-18).
select throws_ok($$ select pg_temp.save_sunday(' Tacos') $$, '23514', null,
  'DB-M-17 a leading space is rejected');
select throws_ok($$ select pg_temp.save_sunday('Tacos ') $$, '23514', null,
  'DB-M-17 a trailing space is rejected');
select throws_ok($$ select pg_temp.save_sunday(E'\tTacos') $$, '23514', null,
  'DB-M-17 a leading tab is rejected');
select throws_ok($$ select pg_temp.save_sunday(E'Tacos\t') $$, '23514', null,
  'DB-M-17 a trailing tab is rejected');
select throws_ok($$ select pg_temp.save_sunday(E'\nTacos') $$, '23514', null,
  'DB-M-17 a leading newline is rejected');
select throws_ok($$ select pg_temp.save_sunday(E'Tacos\n') $$, '23514', null,
  'DB-M-17 a trailing newline is rejected');
select throws_ok($$ select pg_temp.save_sunday(U&'\00A0Tacos') $$, '23514', null,
  'DB-M-17 a leading no-break space (U+00A0) is rejected');
select throws_ok($$ select pg_temp.save_sunday(U&'Tacos\00A0') $$, '23514', null,
  'DB-M-17 a trailing no-break space (U+00A0) is rejected');
select throws_ok($$ select pg_temp.save_sunday(U&'\0085Tacos') $$, '23514', null,
  'DB-M-17 a leading next line (U+0085) is rejected');
select throws_ok($$ select pg_temp.save_sunday(U&'Tacos\0085') $$, '23514', null,
  'DB-M-17 a trailing next line (U+0085) is rejected');
-- \s doesn't match U+FEFF. The app strips it anyway, because trim() does (finding 6).
select lives_ok($$ select pg_temp.save_sunday(U&'Tacos\FEFF') $$,
  'DB-M-18 a trailing zero-width no-break space (U+FEFF) is accepted');

-- char_length counts code points, so each emoji is one character, as in the app's charLength.
select lives_ok($$ select pg_temp.save_sunday(repeat('x', 500)) $$, 'DB-M-19 a 500-character body is accepted');
select throws_ok($$ select pg_temp.save_sunday(repeat('x', 501)) $$, '23514', null,
  'DB-M-19 a 501-character body is rejected');
select lives_ok($$ select pg_temp.save_sunday(repeat('🌮', 500)) $$, 'DB-M-20 a 500-emoji body is accepted');
select throws_ok($$ select pg_temp.save_sunday(repeat('🌮', 501)) $$, '23514', null,
  'DB-M-20 a 501-emoji body is rejected');
select results_eq($$ select body from pg_temp.save_sunday(E'Chili\nCornbread') $$, array[E'Chili\nCornbread'],
  'DB-M-21 a body with an inner line break is accepted and kept');

select throws_ok($$ select pg_temp.save_meal('Household One', '2030-01-13', 'snack', 'Crisps') $$,
  '23514', null, 'DB-M-22 an unknown meal type is rejected');
select throws_ok($$ select pg_temp.save_meal('Household One', '2030-01-13', 'Dinner', 'Crisps') $$,
  '23514', null, 'DB-M-22 meal types are lower case, so Dinner is rejected');

-- A: slot and attribution. Tuesday lunch was created and last updated by B, a day ago.

select throws_ok(
  $$ update public.meal_entries set meal_date = '2030-01-09'
      where id = pg_temp.entry_id('Household One', '2030-01-08', 'lunch') $$,
  '42501', null, 'DB-M-24 A cannot move an entry to another date');
select throws_ok(
  $$ update public.meal_entries set meal_type = 'dinner'
      where id = pg_temp.entry_id('Household One', '2030-01-08', 'lunch') $$,
  '42501', null, 'DB-M-25 A cannot move an entry to another meal');
select results_eq(
  $$ with u as (update public.meal_entries set body = 'Leek soup'
                 where id = pg_temp.entry_id('Household One', '2030-01-08', 'lunch')
                returning updated_by, updated_at = now() and updated_at > created_at)
     select * from u $$,
  $$ values (tests.user_id('member-a@example.com'), true) $$,
  'DB-M-26 changing the text records A as editor and advances updated_at');

select results_eq(
  $$ with i as (insert into public.meal_entries
                  (household_id, meal_date, meal_type, body, created_by, updated_by, created_at)
                values (tests.household_id('Household One'), '2030-01-09', 'breakfast', 'Toast',
                        tests.user_id('member-b@example.com'), tests.user_id('member-b@example.com'), '2000-01-01')
                returning created_by, updated_by, created_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com'), true) $$,
  'DB-M-27 a spoofed created_by, updated_by and created_at are overwritten with A and now()');
select results_eq(
  $$ with u as (update public.meal_entries set body = 'Toast and jam', updated_by = tests.user_id('member-b@example.com')
                 where id = pg_temp.entry_id('Household One', '2030-01-09', 'breakfast')
                returning updated_by)
     select * from u $$,
  array[tests.user_id('member-a@example.com')],
  'DB-M-27 a spoofed updated_by on an update is overwritten with A');

select throws_ok(
  $$ update public.meal_entries set created_by = tests.user_id('member-b@example.com')
      where id = pg_temp.entry_id('Household One', '2030-01-09', 'breakfast') $$,
  '42501', null, 'DB-M-28 A cannot change created_by');
-- Only ON DELETE SET NULL, which runs with no signed-in user, may clear it (DB-M-29).
select throws_ok(
  $$ update public.meal_entries set created_by = null
      where id = pg_temp.entry_id('Household One', '2030-01-09', 'breakfast') $$,
  '42501', null, 'DB-M-28 A cannot clear created_by');

-- A: clearing (R33). The expected ID is an argument, so it's looked up before the delete runs.

select is_empty($$ select pg_temp.clear_meal('Household One', '2030-01-13', 'lunch') $$,
  'DB-M-30 clearing an empty slot deletes nothing and succeeds');
select set_eq($$ select pg_temp.clear_meal('Household One', '2030-01-07', 'dinner') $$,
  array[pg_temp.entry_id('Household One', '2030-01-07', 'dinner')],
  'DB-M-31 clearing Monday dinner deletes exactly the Household One entry');

reset role;

select set_eq($$ select household_id from public.meal_entries where meal_date = '2030-01-07' and meal_type = 'dinner' $$,
  array[tests.household_id('Household Two')], 'DB-M-31 Household Two''s Monday dinner remains');

-- Deleting an account. B saves Saturday dinner first, and was the last to update Thursday dinner.

select tests.authenticate_as('member-b@example.com');
insert into public.meal_entries (household_id, meal_date, meal_type, body)
  values (tests.household_id('Household One'), '2030-01-12', 'dinner', 'Stir fry');

-- GoTrue deletes an account with no signed-in user, so clear the claims and auth.uid() is null.
reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok($$ delete from auth.users where id = tests.user_id('member-b@example.com') $$,
  'DB-M-29 deleting an account that created and updated entries succeeds');
select results_eq(
  $$ select created_by, updated_by from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2030-01-12' and meal_type = 'dinner' $$,
  $$ values (null::uuid, null::uuid) $$,
  'DB-M-29 the entry B created stays, and its created_by and updated_by become null');
select results_eq(
  $$ select created_by, updated_by from public.meal_entries where id = (select id from thursday_dinner) $$,
  $$ values (tests.user_id('member-a@example.com'), null::uuid) $$,
  'DB-M-29 the entry B last updated keeps A as its creator, and its updated_by becomes null');

select * from finish();
rollback;
