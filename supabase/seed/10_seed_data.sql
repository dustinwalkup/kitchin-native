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
--
-- Task 4.2 adds a few grocery items per household.

select tests.create_user('member-a@example.com', 'member-a-local-only');
select tests.create_user('member-b@example.com', 'member-b-local-only');
select tests.create_user('member-c@example.com', 'member-c-local-only');
select tests.create_user('member-d@example.com', 'member-d-local-only');

-- Through the provisioning function, as in production (DD17).
select private.provision_household('Household One', 'America/Chicago',
  array['member-a@example.com', 'member-b@example.com'], array['Member A', 'Member B']);
select private.provision_household('Household Two', 'Europe/London',
  array['member-c@example.com'], array['Member C']);
