-- Local seed data (design §4.9, 4-test-plan §8.1). Local stack and CI only: seeds never reach
-- production, because `db push` doesn't run them. Runs as postgres, after 00_test_helpers.sql.
--
-- Throwaway accounts for signing in to the local stack. The passwords aren't secret, and the
-- accounts never exist in production. Placeholders only, so no real names or emails (R25.6).
--
--   member-a@example.com   member-a-local-only   Household One
--   member-b@example.com   member-b-local-only   Household One
--   member-c@example.com   member-c-local-only   Household Two
--   member-d@example.com   member-d-local-only   no household (R19.9)

select tests.create_user('member-a@example.com', 'member-a-local-only');
select tests.create_user('member-b@example.com', 'member-b-local-only');
select tests.create_user('member-c@example.com', 'member-c-local-only');
select tests.create_user('member-d@example.com', 'member-d-local-only');

-- Through the provisioning function, as in production (DD17).
select private.provision_household('Household One', 'America/Chicago',
  array['member-a@example.com', 'member-b@example.com'], array['Member A', 'Member B']);
select private.provision_household('Household Two', 'Europe/London',
  array['member-c@example.com'], array['Member C']);

-- A few items per household, some checked (4-test-plan §8.1). Each member's claims are set while
-- their items go in, so the triggers attribute them as they would for the app. Milk, Eggs and Bananas
-- are left off, because the M4 manual tests add them.
do $$
declare
  v_h1 uuid := tests.household_id('Household One');
  v_l1 uuid := tests.list_id('Household One');
  v_h2 uuid := tests.household_id('Household Two');
  v_l2 uuid := tests.list_id('Household Two');
  v_week date := date_trunc('week', current_date)::date;   -- this week's (ISO) Monday
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.user_id('member-a@example.com'))::text, true);
  insert into public.grocery_items (household_id, list_id, name, category, quantity) values
    (v_h1, v_l1, 'Bread',          'bakery',  '1 loaf'),
    (v_h1, v_l1, 'Apples',         'produce', '6'),
    (v_h1, v_l1, 'Chicken thighs', 'meat',    null),
    (v_h1, v_l1, 'Cheddar',        'dairy',   null);

  perform set_config('request.jwt.claims', json_build_object('sub', tests.user_id('member-b@example.com'))::text, true);
  insert into public.grocery_items (household_id, list_id, name, category, is_checked) values
    (v_h1, v_l1, 'Olive oil',   'pantry', true),
    (v_h1, v_l1, 'Frozen peas', 'frozen', true);

  perform set_config('request.jwt.claims', json_build_object('sub', tests.user_id('member-c@example.com'))::text, true);
  insert into public.grocery_items (household_id, list_id, name, category, quantity, is_checked) values
    (v_h2, v_l2, 'Rice',     'pantry',  '2 kg', false),
    (v_h2, v_l2, 'Tomatoes', 'produce', null,   false),
    (v_h2, v_l2, 'Yogurt',   'dairy',   null,   true);

  -- Meals (meals design §4.5), relative to the reset date so local development opens on a week with
  -- data. Household One's are A's: Monday dinner, Wednesday lunch and Thursday dinner, and last Friday.
  perform set_config('request.jwt.claims', json_build_object('sub', tests.user_id('member-a@example.com'))::text, true);
  insert into public.meal_entries (household_id, meal_date, meal_type, body) values
    (v_h1, v_week,     'dinner', 'Chicken tacos'),
    (v_h1, v_week + 2, 'lunch',  'Leftover chili'),
    (v_h1, v_week + 3, 'dinner', 'Sheet-pan salmon'),
    (v_h1, v_week - 3, 'dinner', 'Spaghetti');

  perform set_config('request.jwt.claims', json_build_object('sub', tests.user_id('member-c@example.com'))::text, true);
  insert into public.meal_entries (household_id, meal_date, meal_type, body) values
    (v_h2, v_week + 1, 'dinner', 'Fish and chips');

  -- In case the seed runs in one transaction: anything after this runs as plain postgres again.
  perform set_config('request.jwt.claims', '', true);
end $$;
