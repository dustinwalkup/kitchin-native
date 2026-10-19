-- Smoke test for supabase/seed/00_test_helpers.sql (task 2.2).
-- household_id and list_id are exercised by the behavioural tests, once their tables exist.
begin;
select plan(18);

create temporary table smoke_user on commit drop as
  select tests.create_user('helper-smoke@example.com', 'helper-smoke-password') as id;

-- create_user, as postgres

select is(tests.user_id('helper-smoke@example.com'), (select id from smoke_user),
  'HELPER-01 create_user returns the ID that user_id finds');

select ok(
  (select u.email_confirmed_at is not null
      and u.encrypted_password like '$2%'
      and u.encrypted_password = extensions.crypt('helper-smoke-password', u.encrypted_password)
     from auth.users u where u.id = (select id from smoke_user)),
  'HELPER-02 the user is confirmed, with a bcrypt password');

select ok(
  (select array[u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change,
                u.email_change_token_current, u.phone_change, u.phone_change_token,
                u.reauthentication_token]::text[] = array_fill(''::text, array[8])
     from auth.users u where u.id = (select id from smoke_user)),
  'HELPER-03 the token columns GoTrue reads are empty strings, not null');

select ok(
  exists (select 1 from auth.identities i
           where i.user_id = (select id from smoke_user) and i.provider = 'email'
             and i.provider_id = (select id from smoke_user)::text
             and i.identity_data ->> 'sub' = (select id from smoke_user)::text),
  'HELPER-04 the user has an email identity');

select throws_ok($$ select tests.user_id('nobody@example.com') $$, 'P0002', null,
  'HELPER-05 user_id raises for an unknown email instead of returning null');

-- Grants: only the security definer lookups are callable by anon and authenticated

select schema_privs_are('tests', 'anon', array['USAGE'], 'HELPER-06 anon has only USAGE on tests');
select schema_privs_are('tests', 'authenticated', array['USAGE'],
  'HELPER-07 authenticated has only USAGE on tests');

select set_eq(
  $$ select p.proname::text from pg_catalog.pg_proc p
      where p.pronamespace = 'tests'::regnamespace and has_function_privilege('anon', p.oid, 'execute') $$,
  array['household_id', 'list_id', 'user_id'],
  'HELPER-08 anon can execute only the lookups');

select set_eq(
  $$ select p.proname::text from pg_catalog.pg_proc p
      where p.pronamespace = 'tests'::regnamespace
        and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['household_id', 'list_id', 'user_id'],
  'HELPER-09 authenticated can execute only the lookups');

select is_empty(
  $$ select p.proname from pg_catalog.pg_proc p
      where p.pronamespace = 'tests'::regnamespace
        and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'HELPER-10 every helper has a fixed, empty search_path');

-- authenticate_as

select tests.authenticate_as('helper-smoke@example.com');

select is(current_user::text, 'authenticated', 'HELPER-11 authenticate_as switches to the authenticated role');
select is(auth.uid(), tests.user_id('helper-smoke@example.com'),
  'HELPER-12 auth.uid() returns the user''s ID, and user_id works while acting as them');
select is(auth.role(), 'authenticated', 'HELPER-13 the JWT role claim is authenticated');
select throws_ok($$ select tests.create_user('intruder@example.com', 'intruder-password') $$, '42501', null,
  'HELPER-14 authenticated cannot call create_user');

-- authenticate_as_anon

reset role;
select tests.authenticate_as_anon();

select is(current_user::text, 'anon', 'HELPER-15 authenticate_as_anon switches to the anon role');
select is(auth.uid(), null, 'HELPER-16 anon has no auth.uid()');
select throws_ok($$ select tests.authenticate_as('helper-smoke@example.com') $$, '42501', null,
  'HELPER-17 anon cannot call authenticate_as');

-- set_topic

reset role;
select tests.set_topic('00000000-0000-0000-0000-0000000000a1');

select is(realtime.topic(), 'household:00000000-0000-0000-0000-0000000000a1',
  'HELPER-18 set_topic sets the topic realtime.topic() returns');

select * from finish();
rollback;
