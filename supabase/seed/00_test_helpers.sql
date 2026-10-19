-- pgTAP test helpers (design §4.9, 4-test-plan §8.1). Local stack and CI only: seeds never reach
-- production, because `db push` doesn't run them. The `tests` schema isn't in `[api] schemas`, so
-- the Data API never exposes it.
--
-- Invoker helpers (create_user, authenticate_as, authenticate_as_anon, set_topic) run as postgres
-- only. To switch user or topic in the middle of a test, `reset role` first.
-- Security definer lookups (user_id, household_id, list_id) work under any role, so a test can look
-- up IDs while acting as a user that RLS would block. Each raises if it doesn't find exactly one row,
-- so a typo can't turn an isolation check into a lookup of null.

create schema if not exists tests;
revoke all on schema tests from public;
-- Only so anon and authenticated can call the three lookups. Nothing else in `tests` is granted.
grant usage on schema tests to anon, authenticated;

-- Lookups (security definer)

create or replace function tests.user_id(p_email text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select u.id into strict v_id from auth.users u where lower(u.email) = lower(p_email);
  return v_id;
end $$;

-- public.households arrives with migration core_households (task 2.4).
create or replace function tests.household_id(p_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select h.id into strict v_id from public.households h where h.name = p_name;
  return v_id;
end $$;

-- public.grocery_lists arrives with migration groceries_init (task 4.2). One list per household (DD17).
create or replace function tests.list_id(p_household_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select l.id into strict v_id from public.grocery_lists l
    where l.household_id = tests.household_id(p_household_name);
  return v_id;
end $$;

-- Invoker helpers (postgres only)

-- A confirmed email user that can sign in through the local Auth API. GoTrue fails to read a user
-- whose token columns are null, so they're set to empty strings.
create or replace function tests.create_user(p_email text, p_password text)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
  return v_id;
end $$;

-- Acts as the user for the rest of the transaction: role authenticated, and JWT claims {sub, role}
-- so that auth.uid() returns their ID. Looks the user up first, while still postgres.
create or replace function tests.authenticate_as(p_email text)
returns void language plpgsql set search_path = '' as $$
declare v_id uuid := tests.user_id(p_email);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.authenticate_as_anon()
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- The topic that realtime.topic() returns, as the Realtime server sets it for a channel join (§4.5).
create or replace function tests.set_topic(p_household_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('realtime.topic', 'household:' || p_household_id::text, true);
end $$;

revoke all on function tests.user_id(text) from public, anon, authenticated;
revoke all on function tests.household_id(text) from public, anon, authenticated;
revoke all on function tests.list_id(text) from public, anon, authenticated;
revoke all on function tests.create_user(text, text) from public, anon, authenticated;
revoke all on function tests.authenticate_as(text) from public, anon, authenticated;
revoke all on function tests.authenticate_as_anon() from public, anon, authenticated;
revoke all on function tests.set_topic(uuid) from public, anon, authenticated;

grant execute on function tests.user_id(text) to anon, authenticated;
grant execute on function tests.household_id(text) to anon, authenticated;
grant execute on function tests.list_id(text) to anon, authenticated;
