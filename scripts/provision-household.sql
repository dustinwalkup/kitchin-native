-- Run once in the production SQL editor, after creating both users (Auth → Users → Add user, Auto Confirm).
-- Replace the placeholders here, in the editor. Never commit the filled-in version.
--
-- One statement creates the household, both memberships and, from M4, its grocery list. If any part
-- fails, nothing is created (R23.3). The time zone is an IANA name such as America/Chicago.
-- Design §4.6; only postgres can run private.provision_household (R23.5).
select private.provision_household('<HOUSEHOLD_NAME>', '<IANA_TIME_ZONE>',
  array['<EMAIL_1>', '<EMAIL_2>'], array['<DISPLAY_NAME_1>', '<DISPLAY_NAME_2>']);
