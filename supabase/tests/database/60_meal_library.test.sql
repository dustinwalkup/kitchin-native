-- The meal library's tables, acting as the seeded users (meal library 4-test-plan §2.2, task 15.1).
-- A and B are in Household One (H1), C is in Household Two (H2), D has no membership.
-- These fail until migration meal_library_init (task 15.2) lands.
-- Fixture meals and custom tags are named "Fixture …", so they never collide with the seed's library
-- (4-test-plan §1.2). DB-L-38 deletes B, so it runs last.
begin;
select plan(124);

-- Fixture IDs by key, under any role. A key keeps its ID after its row is deleted, and 'pad thai',
-- 'validation', 'spoofed …' and 'never saved' have no row yet. Raises unless the key exists, so a typo
-- can't turn an isolation check into a lookup of null.
create temporary table fixture_ids (key text primary key, id uuid not null) on commit drop;
insert into fixture_ids (key, id)
select k, gen_random_uuid()
  from unnest(array['tacos', 'stew', 'oats', 'chili', 'lasagna', 'curry', 'taco night', 'spicy', 'curry night',
                    'pad thai', 'validation', 'spoofed meal', 'spoofed tag', 'never saved']) as k;
-- Two of Household One's starter tags, which the seed's provisioning created.
insert into fixture_ids (key, id)
select lower(t.name), t.id from public.library_tags t
 where t.household_id = tests.household_id('Household One') and t.name in ('Dinner', 'Quick & Easy');

create function pg_temp.id_of(p_key text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select f.id into strict v_id from pg_temp.fixture_ids f where f.key = p_key;
  return v_id;
end $$;

-- STARTER_TAGS in src/features/meal-library/constants.ts (design §3.1, R43.8).
create temporary table starter_tags on commit drop as
  select unnest(array['Quick & Easy', 'Family Favorite', 'High Protein', 'Breakfast', 'Lunch', 'Dinner',
                      'Meal Prep']) as name;

-- Fixtures, as postgres. With the triggers off they're backdated a day and attributed directly, so a
-- test can tell an unchanged row from one a trigger touched.
--
--   Household One  Fixture Tacos    Dinner, Fixture Spicy        created by A, last changed by B
--                  Fixture Stew     Fixture Spicy
--                  Fixture Oats     no tags
--                  Fixture Chili    Dinner, Fixture Taco Night
--                  Fixture Lasagna  no tags; an entry holds its copied text (DB-L-33)
--   Household Two  Fixture Curry    Fixture Curry Night
--
-- B also created Fixture Taco Night and Fixture Tacos' Dinner link, for DB-L-38.
alter table public.library_meals disable trigger user;
alter table public.library_tags disable trigger user;
alter table public.library_meal_tags disable trigger user;
alter table public.meal_entries disable trigger user;

insert into public.library_meals
  (id, household_id, name, description, created_at, updated_at, created_by, updated_by)
select pg_temp.id_of(f.key), tests.household_id(f.household), f.name, f.description,
       now() - interval '1 day', now() - interval '1 day', tests.user_id(f.creator), tests.user_id(f.updater)
  from (values
    ('tacos',   'Household One', 'Fixture Tacos',   null,                         'member-a@example.com', 'member-b@example.com'),
    ('stew',    'Household One', 'Fixture Stew',    null,                         'member-a@example.com', 'member-a@example.com'),
    ('oats',    'Household One', 'Fixture Oats',    null,                         'member-a@example.com', 'member-a@example.com'),
    ('chili',   'Household One', 'Fixture Chili',   null,                         'member-a@example.com', 'member-a@example.com'),
    ('lasagna', 'Household One', 'Fixture Lasagna', 'Fixture: with garlic bread', 'member-a@example.com', 'member-a@example.com'),
    ('curry',   'Household Two', 'Fixture Curry',   null,                         'member-c@example.com', 'member-c@example.com')
  ) as f(key, household, name, description, creator, updater);

insert into public.library_tags (id, household_id, name, created_at, updated_at, created_by, updated_by)
select pg_temp.id_of(f.key), tests.household_id(f.household), f.name,
       now() - interval '1 day', now() - interval '1 day', tests.user_id(f.member), tests.user_id(f.member)
  from (values
    ('taco night',  'Household One', 'Fixture Taco Night',  'member-b@example.com'),
    ('spicy',       'Household One', 'Fixture Spicy',       'member-a@example.com'),
    ('curry night', 'Household Two', 'Fixture Curry Night', 'member-c@example.com')
  ) as f(key, household, name, member);

insert into public.library_meal_tags (household_id, meal_id, tag_id, created_at, updated_at, created_by, updated_by)
select tests.household_id(f.household), pg_temp.id_of(f.meal), pg_temp.id_of(f.tag),
       now() - interval '1 day', now() - interval '1 day', tests.user_id(f.member), tests.user_id(f.member)
  from (values
    ('Household One', 'tacos', 'dinner',      'member-b@example.com'),
    ('Household One', 'tacos', 'spicy',       'member-a@example.com'),
    ('Household One', 'stew',  'spicy',       'member-a@example.com'),
    ('Household One', 'chili', 'dinner',      'member-a@example.com'),
    ('Household One', 'chili', 'taco night',  'member-a@example.com'),
    ('Household Two', 'curry', 'curry night', 'member-c@example.com')
  ) as f(household, meal, tag, member);

-- Fixture Lasagna's copied text (K20), in the week of 2030-01-07 as the meals tests use (§8.1).
insert into public.meal_entries
  (household_id, meal_date, meal_type, body, created_at, updated_at, created_by, updated_by)
values (tests.household_id('Household One'), '2030-01-09', 'dinner', E'Fixture Lasagna\nFixture: with garlic bread',
        now() - interval '1 day', now() - interval '1 day',
        tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com'));

alter table public.library_meals enable trigger user;
alter table public.library_tags enable trigger user;
alter table public.library_meal_tags enable trigger user;
alter table public.meal_entries enable trigger user;

-- Writes as the current user, so RLS and the triggers apply. Each upsert is the statement PostgREST
-- builds for postgrest-js's upsert in api.ts (4-test-plan §1.2, design finding 1).

-- upsertTags: only household_id and name are sent, and the SET repeats both (DD45).
create function pg_temp.upsert_tags(p_household text, variadic p_names text[])
returns setof public.library_tags language sql as $$
  insert into public.library_tags (household_id, name)
  select tests.household_id(p_household), t.name from unnest(p_names) as t(name)
  on conflict (household_id, name_key) do update
  set household_id = excluded.household_id, name = excluded.name
  returning *
$$;

-- upsertMeal, for a new meal: every field is sent on the phone-generated id, and the SET repeats them (DD46).
create function pg_temp.upsert_meal(p_key text, p_household text, p_name text,
                                    p_description text default null, p_ingredients text default null)
returns setof public.library_meals language sql as $$
  insert into public.library_meals (id, household_id, name, description, ingredients)
  values (pg_temp.id_of(p_key), tests.household_id(p_household), p_name, p_description, p_ingredients)
  on conflict (id) do update
  set id = excluded.id, household_id = excluded.household_id, name = excluded.name,
      description = excluded.description, ingredients = excluded.ingredients
  returning *
$$;

-- addTagLinks: a link that exists already is left alone (DD48).
create function pg_temp.add_link(p_household text, p_meal text, p_tag text)
returns setof public.library_meal_tags language sql as $$
  insert into public.library_meal_tags (household_id, meal_id, tag_id)
  values (tests.household_id(p_household), pg_temp.id_of(p_meal), pg_temp.id_of(p_tag))
  on conflict (meal_id, tag_id) do nothing
  returning *
$$;

-- A plain insert of a tag into Household One, which the app never sends, for the checks behind the upsert.
create function pg_temp.insert_tag(p_name text)
returns setof public.library_tags language sql as $$
  insert into public.library_tags (household_id, name) values (tests.household_id('Household One'), p_name)
  returning *
$$;

-- Saves Household One's validation meal. Each accepted save replaces the last.
create function pg_temp.save_meal(p_name text, p_description text default null, p_ingredients text default null)
returns setof public.library_meals language sql as $$
  select * from pg_temp.upsert_meal('validation', 'Household One', p_name, p_description, p_ingredients)
$$;

-- The message of a failed CHECK on a library table. It names the constraint, which the app maps to a
-- field (DD58), so the names must match design §4.1.
create function pg_temp.violates(p_constraint text) returns text language sql immutable as $$
  select format('new row for relation "library_%s" violates check constraint "%s"',
                split_part(p_constraint, '_', 2), p_constraint)
$$;

-- Every library row in a household, for before-and-after comparisons. Read as postgres, which RLS doesn't
-- filter.
create function pg_temp.library_rows(p_household text)
returns table (table_name text, row_data jsonb) language sql stable as $$
  select 'library_meals'::text, to_jsonb(m) from public.library_meals m
   where m.household_id = tests.household_id(p_household)
  union all
  select 'library_tags', to_jsonb(t) from public.library_tags t
   where t.household_id = tests.household_id(p_household)
  union all
  select 'library_meal_tags', to_jsonb(l) from public.library_meal_tags l
   where l.household_id = tests.household_id(p_household)
$$;

create temporary table h1_library_before on commit drop as select * from pg_temp.library_rows('Household One');

-- C, in H2

select tests.authenticate_as('member-c@example.com');

select is_empty($$ select 1 from public.library_meals where household_id = tests.household_id('Household One') $$,
  'DB-L-02 C sees no Household One meals');
select is_empty($$ select 1 from public.library_tags where household_id = tests.household_id('Household One') $$,
  'DB-L-02 C sees no Household One tags');
select is_empty(
  $$ select 1 from public.library_meal_tags where household_id = tests.household_id('Household One') $$,
  'DB-L-02 C sees no Household One links');
select results_eq(
  $$ select (select count(*)::int from public.library_meals where name like 'Fixture %'),
            (select count(*)::int from public.library_tags where name like 'Fixture %'),
            (select count(*)::int from public.library_meal_tags where meal_id = pg_temp.id_of('curry')) $$,
  $$ values (1, 1, 1) $$,
  'DB-L-02 control: C sees Household Two''s fixture meal, tag and link');

select throws_ok(
  $$ insert into public.library_meals (household_id, name) values (tests.household_id('Household One'), 'From C') $$,
  '42501', null, 'DB-L-05 C cannot insert a meal into Household One');
select throws_ok(
  $$ insert into public.library_tags (household_id, name) values (tests.household_id('Household One'), 'From C') $$,
  '42501', null, 'DB-L-05 C cannot insert a tag into Household One');
select throws_ok(
  $$ insert into public.library_meal_tags (household_id, meal_id, tag_id)
     values (tests.household_id('Household One'), pg_temp.id_of('stew'), pg_temp.id_of('dinner')) $$,
  '42501', null, 'DB-L-05 C cannot insert a link into Household One');
-- The insert policy is checked before the conflict, so even a repeat that would do nothing is refused.
select throws_ok($$ select pg_temp.add_link('Household One', 'tacos', 'dinner') $$, '42501', null,
  'DB-L-05 C cannot upsert an existing Household One link');

-- On the conflict path, the existing row must pass the update policy's USING (finding 1).
select throws_ok($$ select pg_temp.upsert_meal('tacos', 'Household Two', 'From C') $$, '42501', null,
  'DB-L-06 C cannot upsert a Household One meal''s id, naming Household Two');
select throws_ok($$ select pg_temp.upsert_meal('tacos', 'Household One', 'From C') $$, '42501', null,
  'DB-L-06 C cannot upsert a Household One meal''s id, naming Household One');
select throws_ok($$ select pg_temp.upsert_tags('Household One', 'Dinner') $$, '42501', null,
  'DB-L-07 C cannot upsert the tag Dinner into Household One');

-- Tags have no delete grant (DB-L-18) and links no update grant (DB-L-30), so those aren't tried here.
select results_eq(
  $$ with u as (update public.library_meals set name = 'From C' where id = pg_temp.id_of('tacos') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-L-08 C''s update of a Household One meal affects 0 rows');
select results_eq(
  $$ with d as (delete from public.library_meals where id = pg_temp.id_of('tacos') returning 1)
     select count(*)::int from d $$,
  array[0], 'DB-L-08 C''s delete of a Household One meal affects 0 rows');
-- A change of case only, so that if RLS let it through, it would succeed and this would fail cleanly.
select results_eq(
  $$ with u as (update public.library_tags set name = 'fixture taco night'
                 where id = pg_temp.id_of('taco night') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-L-08 C''s update of a Household One tag affects 0 rows');
select results_eq(
  $$ with d as (delete from public.library_meal_tags
                 where meal_id = pg_temp.id_of('tacos') and tag_id = pg_temp.id_of('dinner') returning 1)
     select count(*)::int from d $$,
  array[0], 'DB-L-08 C''s delete of a Household One link affects 0 rows');

-- D, with no household

reset role;
select tests.authenticate_as('member-d@example.com');

select is_empty($$ select 1 from public.library_meals $$, 'DB-L-04 D sees no meals');
select is_empty($$ select 1 from public.library_tags $$, 'DB-L-04 D sees no tags');
select is_empty($$ select 1 from public.library_meal_tags $$, 'DB-L-04 D sees no links');
select throws_ok(
  $$ insert into public.library_meals (household_id, name) values (tests.household_id('Household One'), 'From D') $$,
  '42501', null, 'DB-L-04 D cannot insert a meal into Household One');

-- anon, which holds no grant on any of them (DB-S-05)

reset role;
select tests.authenticate_as_anon();

select throws_ok($$ select 1 from public.library_meals $$, '42501', null, 'DB-L-03 anon cannot read library_meals');
select throws_ok($$ select pg_temp.upsert_meal('pad thai', 'Household One', 'From anon') $$, '42501', null,
  'DB-L-03 anon cannot save a meal');
select throws_ok($$ update public.library_meals set name = 'From anon' $$, '42501', null,
  'DB-L-03 anon cannot update library_meals');
select throws_ok($$ delete from public.library_meals $$, '42501', null,
  'DB-L-03 anon cannot delete from library_meals');
select throws_ok($$ select 1 from public.library_tags $$, '42501', null, 'DB-L-03 anon cannot read library_tags');
select throws_ok($$ select pg_temp.upsert_tags('Household One', 'From anon') $$, '42501', null,
  'DB-L-03 anon cannot save a tag');
select throws_ok($$ update public.library_tags set name = 'From anon' $$, '42501', null,
  'DB-L-03 anon cannot update library_tags');
select throws_ok($$ select 1 from public.library_meal_tags $$, '42501', null,
  'DB-L-03 anon cannot read library_meal_tags');
select throws_ok($$ select pg_temp.add_link('Household One', 'stew', 'dinner') $$, '42501', null,
  'DB-L-03 anon cannot add a link');
select throws_ok($$ delete from public.library_meal_tags $$, '42501', null,
  'DB-L-03 anon cannot delete from library_meal_tags');

-- postgres

reset role;

select bag_eq($$ select * from pg_temp.library_rows('Household One') $$, $$ select * from h1_library_before $$,
  'DB-L-04 DB-L-05 DB-L-06 DB-L-07 DB-L-08 Household One''s library is unchanged');

-- Starter tags (R43.8, DD47). The seed provisions both households, so they have theirs with no creator
-- (R47.8). These run before any member writes to a starter tag.

select bag_eq(
  $$ select name from public.library_tags
      where household_id = tests.household_id('Household One') and created_by is null and updated_by is null $$,
  $$ select name from starter_tags $$,
  'DB-L-10 Household One''s unattributed tags are exactly the seven starter tags');
select bag_eq(
  $$ select name from public.library_tags
      where household_id = tests.household_id('Household Two') and created_by is null and updated_by is null $$,
  $$ select name from starter_tags $$,
  'DB-L-10 Household Two''s unattributed tags are exactly the seven starter tags');

create temporary table h1_tags_before on commit drop as
  select count(*)::int as tags from public.library_tags where household_id = tests.household_id('Household One');
select lives_ok($$ select private.add_starter_tags(tests.household_id('Household One')) $$,
  'DB-L-11 add_starter_tags runs again for Household One');
select results_eq(
  $$ select count(*)::int from public.library_tags where household_id = tests.household_id('Household One') $$,
  $$ select tags from h1_tags_before $$,
  'DB-L-11 running it again adds nothing');

-- A, in H1: isolation

select tests.authenticate_as('member-a@example.com');

select is_empty($$ select 1 from public.library_meals where household_id <> tests.household_id('Household One') $$,
  'DB-L-01 A sees no meals outside Household One');
select set_eq($$ select name from public.library_meals where name like 'Fixture %' $$,
  array['Fixture Tacos', 'Fixture Stew', 'Fixture Oats', 'Fixture Chili', 'Fixture Lasagna'],
  'DB-L-01 control: A sees Household One''s fixture meals');
select is_empty($$ select 1 from public.library_tags where household_id <> tests.household_id('Household One') $$,
  'DB-L-01 A sees no tags outside Household One');
select set_eq($$ select name from public.library_tags where name like 'Fixture %' $$,
  array['Fixture Taco Night', 'Fixture Spicy'], 'DB-L-01 control: A sees Household One''s fixture tags');
select is_empty(
  $$ select 1 from public.library_meal_tags where household_id <> tests.household_id('Household One') $$,
  'DB-L-01 A sees no links outside Household One');
select results_eq(
  $$ select count(*)::int from public.library_meal_tags
      where meal_id in (pg_temp.id_of('tacos'), pg_temp.id_of('stew'), pg_temp.id_of('chili')) $$,
  array[5], 'DB-L-01 control: A sees Household One''s fixture links');

select throws_ok(
  $$ update public.library_meals set household_id = tests.household_id('Household Two')
      where id = pg_temp.id_of('stew') $$,
  '42501', null, 'DB-L-09 A cannot move a meal to Household Two');

-- A and B: tags. A tag's key is its name in lower case, with each run of whitespace as one space (DD44).

select throws_ok($$ select pg_temp.insert_tag('DINNER') $$, '23505',
  'duplicate key value violates unique constraint "library_tags_one_per_name"',
  'DB-L-12 a plain insert of DINNER fails on library_tags_one_per_name');
select throws_ok($$ select pg_temp.insert_tag('Fixture  Taco   Night') $$, '23505',
  'duplicate key value violates unique constraint "library_tags_one_per_name"',
  'DB-L-12 a plain insert of "Fixture  Taco   Night" fails on library_tags_one_per_name');

-- The conflict path sets the name to a spelling with the same key, and the name trigger puts the first
-- spelling back, so both members get the existing tag (DD45, R46.8).
select results_eq($$ select id, name from pg_temp.upsert_tags('Household One', 'quick  &  EASY') $$,
  $$ values (pg_temp.id_of('quick & easy'), 'Quick & Easy') $$,
  'DB-L-13 A''s upsert of "quick  &  EASY" returns the starter tag, as first spelled');

reset role;
select tests.authenticate_as('member-b@example.com');

select results_eq($$ select id, name from pg_temp.upsert_tags('Household One', 'Quick & easy') $$,
  $$ values (pg_temp.id_of('quick & easy'), 'Quick & Easy') $$,
  'DB-L-13 B''s upsert of "Quick & easy" returns the same tag and spelling');
select results_eq(
  $$ select count(*)::int from public.library_tags
      where household_id = tests.household_id('Household One') and name_key = 'quick & easy' $$,
  array[1], 'DB-L-13 Household One still has one Quick & Easy');

reset role;
select tests.authenticate_as('member-a@example.com');

select throws_ok($$ select pg_temp.upsert_tags('Household One', 'Fixture Soup', 'fixture soup') $$, '21000', null,
  'DB-L-14 one upsert that repeats a key fails');
select is_empty($$ select 1 from public.library_tags where name_key = 'fixture soup' $$, 'DB-L-14 and creates nothing');

-- Renaming is out of scope (K22), so only a change that keeps the key gets through, and it changes nothing.
select throws_ok($$ update public.library_tags set name = 'Supper' where id = pg_temp.id_of('dinner') $$,
  '42501', null, 'DB-L-15 A cannot rename a tag');
select results_eq(
  $$ with u as (update public.library_tags set name = 'dinner' where id = pg_temp.id_of('dinner') returning name)
     select * from u $$,
  array['Dinner'], 'DB-L-15 a change of case only is accepted, and the tag keeps its first spelling');

-- Postgres's \s matches the spaces, and the CHECK lists the line breaks (R47.3).
select throws_ok($$ select pg_temp.insert_tag('') $$, '23514', pg_temp.violates('library_tags_name_check'),
  'DB-L-16 an empty tag name is rejected');
select throws_ok($$ select pg_temp.insert_tag(' Fixture lead') $$, '23514',
  pg_temp.violates('library_tags_name_check'), 'DB-L-16 a tag name with a leading space is rejected');
select throws_ok($$ select pg_temp.insert_tag('Fixture trail ') $$, '23514',
  pg_temp.violates('library_tags_name_check'), 'DB-L-16 a tag name with a trailing space is rejected');
select throws_ok($$ select pg_temp.insert_tag(E'Fixture\nlines') $$, '23514',
  pg_temp.violates('library_tags_name_check'), 'DB-L-16 a tag name with a line feed is rejected');
select throws_ok($$ select pg_temp.insert_tag(U&'Fixture\2028lines') $$, '23514',
  pg_temp.violates('library_tags_name_check'), 'DB-L-16 a tag name with a line separator (U+2028) is rejected');
select throws_ok($$ select pg_temp.insert_tag('Fixture ' || repeat('x', 23)) $$, '23514',
  pg_temp.violates('library_tags_name_check'), 'DB-L-16 a 31-character tag name is rejected');
select lives_ok($$ select pg_temp.insert_tag('Fixture ' || repeat('x', 22)) $$,
  'DB-L-16 a 30-character tag name is accepted');

select results_eq($$ select name_key from pg_temp.insert_tag(U&'Fixture \00C9CLAIR  Night') $$,
  array[U&'fixture \00E9clair night'],
  'DB-L-17 "Fixture ÉCLAIR  Night" is accepted, and its key lower-cases the É and joins the spaces');

select throws_ok($$ delete from public.library_tags where id = pg_temp.id_of('spicy') $$,
  '42501', 'permission denied for table library_tags', 'DB-L-18 A cannot delete a tag');

-- A and B: saving a meal. A new meal is upserted on a phone-generated id, so a retry after a lost reply
-- finds the row the first try made (DD46, R46.4).

select results_eq(
  $$ select created_by, updated_by
       from pg_temp.upsert_meal('pad thai', 'Household One', 'Fixture Pad thai', 'Fixture: with tofu') $$,
  $$ values (tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com')) $$,
  'DB-L-19 A saves a new meal on its id, as its creator and editor');
select lives_ok(
  $$ select pg_temp.upsert_meal('pad thai', 'Household One', 'Fixture Pad thai', 'Fixture: with tofu') $$,
  'DB-L-21 A''s retry of the same save succeeds');
select results_eq($$ select count(*)::int from public.library_meals where id = pg_temp.id_of('pad thai') $$,
  array[1], 'DB-L-19 DB-L-21 the meal is one row');

reset role;
select tests.authenticate_as('member-b@example.com');

select results_eq(
  $$ select name, description, ingredients, created_by, updated_by
       from pg_temp.upsert_meal('pad thai', 'Household One', 'Fixture Pad thai', 'Fixture: with chicken',
                                E'Rice noodles\nChicken') $$,
  $$ values ('Fixture Pad thai', 'Fixture: with chicken', E'Rice noodles\nChicken',
             tests.user_id('member-a@example.com'), tests.user_id('member-b@example.com')) $$,
  'DB-L-20 B''s upsert of the same id stores B''s values, keeps A as creator and records B as editor');
select results_eq($$ select count(*)::int from public.library_meals where id = pg_temp.id_of('pad thai') $$,
  array[1], 'DB-L-20 the meal is still one row');

reset role;
select tests.authenticate_as('member-a@example.com');

-- A: validation (R47.2). Postgres's \s matches the spaces, and the CHECK lists the line breaks.

select throws_ok($$ select pg_temp.save_meal('') $$, '23514', pg_temp.violates('library_meals_name_check'),
  'DB-L-22 an empty name is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture ' || repeat('x', 93)) $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a 101-character name is rejected');
-- char_length counts characters, as the app's charLength does, so a two-byte é counts once.
select lives_ok($$ select pg_temp.save_meal(repeat(U&'\00E9', 100)) $$,
  'DB-L-22 a name of 100 é characters is accepted');
select throws_ok($$ select pg_temp.save_meal(E'Fixture\r\nlasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with CR LF is rejected');
select throws_ok($$ select pg_temp.save_meal(E'Fixture\rlasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a carriage return is rejected');
select throws_ok($$ select pg_temp.save_meal(E'Fixture\nlasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a line feed is rejected');
select throws_ok($$ select pg_temp.save_meal(U&'Fixture\0085lasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a next line (U+0085) is rejected');
select throws_ok($$ select pg_temp.save_meal(U&'Fixture\2028lasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a line separator (U+2028) is rejected');
select throws_ok($$ select pg_temp.save_meal(U&'Fixture\2029lasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a paragraph separator (U+2029) is rejected');
select throws_ok($$ select pg_temp.save_meal(' Fixture lasagna') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a leading space is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna ') $$, '23514',
  pg_temp.violates('library_meals_name_check'), 'DB-L-22 a name with a trailing space is rejected');

select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', '') $$, '23514',
  pg_temp.violates('library_meals_description_check'), 'DB-L-23 an empty description is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', ' Fixture: baked') $$, '23514',
  pg_temp.violates('library_meals_description_check'), 'DB-L-23 a description with a leading space is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', 'Fixture: baked ') $$, '23514',
  pg_temp.violates('library_meals_description_check'), 'DB-L-23 a description with a trailing space is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', repeat('x', 301)) $$, '23514',
  pg_temp.violates('library_meals_description_check'), 'DB-L-23 a 301-character description is rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', null, '') $$, '23514',
  pg_temp.violates('library_meals_ingredients_check'), 'DB-L-23 empty ingredients are rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', null, ' Pasta') $$, '23514',
  pg_temp.violates('library_meals_ingredients_check'), 'DB-L-23 ingredients with a leading space are rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', null, 'Pasta ') $$, '23514',
  pg_temp.violates('library_meals_ingredients_check'), 'DB-L-23 ingredients with a trailing space are rejected');
select throws_ok($$ select pg_temp.save_meal('Fixture lasagna', null, repeat('x', 2001)) $$, '23514',
  pg_temp.violates('library_meals_ingredients_check'), 'DB-L-23 2,001 characters of ingredients are rejected');
select lives_ok($$ select pg_temp.save_meal('Fixture lasagna', repeat('x', 300), repeat('x', 2000)) $$,
  'DB-L-23 a 300-character description and 2,000 characters of ingredients are accepted');
select results_eq(
  $$ select description, ingredients
       from pg_temp.save_meal('Fixture lasagna', E'Fixture: layered\nand baked', E'Pasta\nSauce\nCheese') $$,
  $$ values (E'Fixture: layered\nand baked', E'Pasta\nSauce\nCheese') $$,
  'DB-L-23 line breaks inside a description and ingredients are accepted and kept');
select results_eq($$ select description, ingredients from pg_temp.save_meal('Fixture lasagna') $$,
  $$ values (null::text, null::text) $$, 'DB-L-23 a meal with no description or ingredients is accepted');

-- A: an edit sends only the changed fields and checks that a row came back (DD46). A delete is by id.

select results_eq(
  $$ with u as (update public.library_meals set description = 'Fixture: slow-cooked'
                 where id = pg_temp.id_of('stew') returning id)
     select count(*)::int from u $$,
  array[1], 'DB-L-24 an update of one field returns the row');
select results_eq(
  $$ with u as (update public.library_meals set description = 'Fixture: slow-cooked'
                 where id = pg_temp.id_of('never saved') returning id)
     select count(*)::int from u $$,
  array[0], 'DB-L-24 an update of an unknown id returns no row, which the app reads as deleted elsewhere (R46.7)');
select results_eq(
  $$ with d as (delete from public.library_meals where id = pg_temp.id_of('oats') returning id)
     select count(*)::int from d $$,
  array[1], 'DB-L-25 deleting a meal returns the row');
select results_eq(
  $$ with d as (delete from public.library_meals where id = pg_temp.id_of('oats') returning id)
     select count(*)::int from d $$,
  array[0], 'DB-L-25 deleting it again returns no row, without an error (R44.5)');

-- A: links. One per meal and tag, added with on conflict do nothing and never updated (DD48).

select results_eq($$ select count(*)::int from pg_temp.add_link('Household One', 'stew', 'dinner') $$,
  array[1], 'DB-L-26 A adds a link');
select is_empty($$ select * from pg_temp.add_link('Household One', 'stew', 'dinner') $$,
  'DB-L-26 adding it again does nothing, without an error');
select results_eq(
  $$ select count(*)::int from public.library_meal_tags
      where meal_id = pg_temp.id_of('stew') and tag_id = pg_temp.id_of('dinner') $$,
  array[1], 'DB-L-26 the meal and tag have one link');
select throws_ok(
  $$ insert into public.library_meal_tags (household_id, meal_id, tag_id)
     values (tests.household_id('Household One'), pg_temp.id_of('stew'), pg_temp.id_of('dinner')) $$,
  '23505', 'duplicate key value violates unique constraint "library_meal_tags_one_per_pair"',
  'DB-L-27 a plain duplicate insert fails on library_meal_tags_one_per_pair');
select throws_ok(
  $$ update public.library_meal_tags set tag_id = pg_temp.id_of('dinner') where meal_id = pg_temp.id_of('tacos') $$,
  '42501', 'permission denied for table library_meal_tags', 'DB-L-30 A cannot update a link');

select lives_ok($$ delete from public.library_meals where id = pg_temp.id_of('chili') $$,
  'DB-L-32 A deletes a meal with two tags');

-- postgres, which RLS doesn't filter. Only the composite foreign keys keep a link within one household
-- (R19.6).

reset role;

select is_empty($$ select 1 from public.library_meal_tags where meal_id = pg_temp.id_of('chili') $$,
  'DB-L-32 the deleted meal''s links are gone');
select results_eq(
  $$ select count(*)::int from public.library_tags where id in (pg_temp.id_of('dinner'), pg_temp.id_of('taco night')) $$,
  array[2], 'DB-L-32 both of its tags remain');

select throws_ok(
  $$ insert into public.library_meal_tags (household_id, meal_id, tag_id)
     values (tests.household_id('Household One'), pg_temp.id_of('tacos'), pg_temp.id_of('curry night')) $$,
  '23503', null, 'DB-L-28 even postgres cannot link a Household One meal to a Household Two tag');

select lives_ok($$ delete from public.library_tags where id = pg_temp.id_of('spicy') $$,
  'DB-L-31 postgres deletes a tag that two meals have');
select is_empty($$ select 1 from public.library_meal_tags where tag_id = pg_temp.id_of('spicy') $$,
  'DB-L-31 its two links are gone');
select results_eq(
  $$ select count(*)::int from public.library_meals where id in (pg_temp.id_of('tacos'), pg_temp.id_of('stew')) $$,
  array[2], 'DB-L-31 both meals remain');

-- C names its own household, which passes the insert policy, but the meal isn't in it.

select tests.authenticate_as('member-c@example.com');

select throws_ok(
  $$ insert into public.library_meal_tags (household_id, meal_id, tag_id)
     values (tests.household_id('Household Two'), pg_temp.id_of('tacos'), pg_temp.id_of('curry night')) $$,
  '23503', null, 'DB-L-29 C cannot link its own tag to a Household One meal, naming Household Two');

-- Entries never depend on the library (R47.7, K19). The fixture entry holds Fixture Lasagna's copied text.

reset role;
create temporary table entries_before on commit drop as select id, body, updated_at from public.meal_entries;

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ update public.library_meals set name = 'Fixture Veggie lasagna' where id = pg_temp.id_of('lasagna') $$,
  'DB-L-33 A renames a meal whose copied text is planned');
select lives_ok($$ delete from public.library_meals where id = pg_temp.id_of('lasagna') $$,
  'DB-L-33 A deletes that meal');

reset role;

select results_eq(
  $$ select body, updated_at = now() - interval '1 day' from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2030-01-09' and meal_type = 'dinner' $$,
  $$ values (E'Fixture Lasagna\nFixture: with garlic bread', true) $$,
  'DB-L-33 the entry with the copied text is unchanged');
select bag_eq($$ select id, body, updated_at from public.meal_entries $$, $$ select * from entries_before $$,
  'DB-L-33 no entry was created, changed or deleted');

select is_empty(
  $$ select c.conname from pg_catalog.pg_constraint c
       join pg_catalog.pg_class src on src.oid = c.conrelid
       join pg_catalog.pg_class dst on dst.oid = c.confrelid
      where c.contype = 'f'
        and src.relnamespace = 'public'::regnamespace and dst.relnamespace = 'public'::regnamespace
        and ((src.relname = 'meal_entries' and dst.relname like 'library\_%')
             or (dst.relname = 'meal_entries' and src.relname like 'library\_%')) $$,
  'DB-L-34 no foreign key joins meal_entries and a library table');
-- A copied meal is plain text in body, so nothing else in an entry could point at one.
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = 'public.meal_entries'::regclass and a.attnum > 0 and not a.attisdropped
        and a.atttypid = 'uuid'::regtype $$,
  array['id', 'household_id', 'created_by', 'updated_by'],
  'DB-L-34 meal_entries'' only uuid columns are its id, its household and its attribution');

-- A: attribution (R47.8, R19.7, R19.8). The audit trigger overwrites whatever is sent.

select tests.authenticate_as('member-a@example.com');

select results_eq(
  $$ with i as (insert into public.library_meals (id, household_id, name, created_by, updated_by, created_at)
                values (pg_temp.id_of('spoofed meal'), tests.household_id('Household One'), 'Fixture Spoofed',
                        tests.user_id('member-b@example.com'), tests.user_id('member-b@example.com'), '2000-01-01')
                returning created_by, updated_by, created_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com'), true) $$,
  'DB-L-35 a meal''s spoofed created_by, updated_by and created_at are overwritten with A and now()');
select results_eq(
  $$ with i as (insert into public.library_tags (id, household_id, name, created_by, updated_by, created_at)
                values (pg_temp.id_of('spoofed tag'), tests.household_id('Household One'), 'Fixture Spoofed',
                        tests.user_id('member-b@example.com'), tests.user_id('member-b@example.com'), '2000-01-01')
                returning created_by, updated_by, created_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com'), true) $$,
  'DB-L-35 a tag''s spoofed created_by, updated_by and created_at are overwritten with A and now()');
select results_eq(
  $$ with i as (insert into public.library_meal_tags (household_id, meal_id, tag_id, created_by, updated_by, created_at)
                values (tests.household_id('Household One'), pg_temp.id_of('spoofed meal'), pg_temp.id_of('spoofed tag'),
                        tests.user_id('member-b@example.com'), tests.user_id('member-b@example.com'), '2000-01-01')
                returning created_by, updated_by, created_at = now())
     select * from i $$,
  $$ values (tests.user_id('member-a@example.com'), tests.user_id('member-a@example.com'), true) $$,
  'DB-L-35 a link''s spoofed created_by, updated_by and created_at are overwritten with A and now()');
select results_eq(
  $$ with u as (update public.library_meals
                   set description = 'Fixture: spoofed', updated_by = tests.user_id('member-b@example.com')
                 where id = pg_temp.id_of('spoofed meal') returning updated_by)
     select * from u $$,
  array[tests.user_id('member-a@example.com')], 'DB-L-35 a spoofed updated_by on a meal''s update is overwritten with A');
select results_eq(
  $$ with u as (update public.library_tags set updated_by = tests.user_id('member-b@example.com')
                 where id = pg_temp.id_of('spoofed tag') returning updated_by)
     select * from u $$,
  array[tests.user_id('member-a@example.com')], 'DB-L-35 a spoofed updated_by on a tag''s update is overwritten with A');

select throws_ok(
  $$ update public.library_meals set created_by = tests.user_id('member-b@example.com')
      where id = pg_temp.id_of('stew') $$,
  '42501', null, 'DB-L-36 A cannot change a meal''s created_by');
-- Only ON DELETE SET NULL, which runs with no signed-in user, may clear it (DB-L-38).
select throws_ok($$ update public.library_meals set created_by = null where id = pg_temp.id_of('stew') $$,
  '42501', null, 'DB-L-36 A cannot clear a meal''s created_by');
select throws_ok($$ update public.library_tags set created_by = null where id = pg_temp.id_of('spoofed tag') $$,
  '42501', null, 'DB-L-36 A cannot clear a tag''s created_by');

-- postgres: privileges. DB-S-09 covers both functions, but would pass if they were missing, so these
-- name them.

reset role;

select function_privs_are('private', 'add_starter_tags', array['uuid'], 'authenticated', array[]::text[],
  'DB-L-37 authenticated cannot execute private.add_starter_tags');
select function_privs_are('private', 'handle_library_tag_name', array[]::text[], 'authenticated', array[]::text[],
  'DB-L-37 authenticated cannot execute private.handle_library_tag_name');

-- Deleting an account (MVP design §4.3). B created Fixture Taco Night and Fixture Tacos' Dinner link,
-- and last changed Fixture Tacos. GoTrue deletes an account with no signed-in user, so clear the claims
-- and auth.uid() is null.

select set_config('request.jwt.claims', '', true);
create temporary table member_b on commit drop as select tests.user_id('member-b@example.com') as id;

select lives_ok($$ delete from auth.users where id = (select id from member_b) $$,
  'DB-L-38 deleting an account that created and changed library rows succeeds');
select results_eq($$ select created_by, updated_by from public.library_meals where id = pg_temp.id_of('tacos') $$,
  $$ values (tests.user_id('member-a@example.com'), null::uuid) $$,
  'DB-L-38 the meal B last changed keeps A as its creator, and its updated_by becomes null');
select results_eq($$ select created_by, updated_by from public.library_tags where id = pg_temp.id_of('taco night') $$,
  $$ values (null::uuid, null::uuid) $$,
  'DB-L-38 the tag B created stays, and its created_by and updated_by become null');
select results_eq(
  $$ select created_by, updated_by from public.library_meal_tags
      where meal_id = pg_temp.id_of('tacos') and tag_id = pg_temp.id_of('dinner') $$,
  $$ values (null::uuid, null::uuid) $$,
  'DB-L-38 the link B created stays, and its created_by and updated_by become null');
select is_empty(
  $$ select 1 from public.library_meals where (select id from member_b) in (created_by, updated_by)
     union all
     select 1 from public.library_tags where (select id from member_b) in (created_by, updated_by)
     union all
     select 1 from public.library_meal_tags where (select id from member_b) in (created_by, updated_by) $$,
  'DB-L-38 no library row names B any more');

select * from finish();
rollback;
