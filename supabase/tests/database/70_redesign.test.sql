-- The redesign's data (specs/redesign/design.md §6, task R3): the Beverages category, a library meal's
-- type and photo, the starter tags, a planned meal's link to the library meal it came from, and the
-- meal-images bucket's policies. Acting as the seeded users: A and B are in Household One (H1), C is
-- in Household Two (H2). Fixtures are named "Redesign …" so they never collide with the seed.
begin;
select plan(34);

create temporary table fixture_ids (key text primary key, id uuid not null) on commit drop;
insert into fixture_ids (key, id)
select k, gen_random_uuid() from unnest(array['h1 meal', 'h2 meal', 'photo', 'h2 photo']) as k;
grant select on fixture_ids to authenticated;

create function pg_temp.id_of(p_key text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select f.id into strict v_id from pg_temp.fixture_ids f where f.key = p_key;
  return v_id;
end $$;

-- A photo key in a household's folder, as the app makes them.
create function pg_temp.photo_key(p_household text, p_key text)
returns text language sql stable as $$
  select tests.household_id(p_household)::text || '/' || pg_temp.id_of(p_key)::text || '.jpg'
$$;

insert into public.library_meals (id, household_id, name)
values (pg_temp.id_of('h1 meal'), tests.household_id('Household One'), 'Redesign Tacos'),
       (pg_temp.id_of('h2 meal'), tests.household_id('Household Two'), 'Redesign Curry');

-- 1. Groceries (design §6.1)

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into public.grocery_items (household_id, list_id, name, category)
     values (tests.household_id('Household One'), tests.list_id('Household One'), 'Redesign Sparkling Water', 'beverages') $$,
  'DB-R-01 an item can go under Beverages');
select throws_ok(
  $$ insert into public.grocery_items (household_id, list_id, name, category)
     values (tests.household_id('Household One'), tests.list_id('Household One'), 'Redesign Crisps', 'snacks') $$,
  '23514', null, 'DB-R-01 a category outside the list is rejected');

-- 2. A meal's type and photo (design §6.2)

select results_eq(
  $$ update public.library_meals set meal_type = 'dinner' where id = pg_temp.id_of('h1 meal') returning meal_type $$,
  array['dinner'], 'DB-R-02 a member sets a meal''s type');
select results_eq(
  $$ update public.library_meals set meal_type = null where id = pg_temp.id_of('h1 meal') returning meal_type $$,
  array[null::text], 'DB-R-02 and clears it');
select throws_ok(
  $$ update public.library_meals set meal_type = 'brunch' where id = pg_temp.id_of('h1 meal') $$,
  '23514', 'new row for relation "library_meals" violates check constraint "library_meals_meal_type_check"',
  'DB-R-02 a type outside breakfast, lunch and dinner is rejected, naming its CHECK');
select throws_ok(
  $$ update public.library_meals set meal_type = 'Dinner' where id = pg_temp.id_of('h1 meal') $$,
  '23514', null, 'DB-R-02 the type is lower case, as the app sends it');

select lives_ok(
  $$ update public.library_meals set image_path = pg_temp.photo_key('Household One', 'photo')
      where id = pg_temp.id_of('h1 meal') $$,
  'DB-R-03 a meal takes a photo key in its household''s folder');
select results_eq(
  $$ select image_path from public.library_meals where id = pg_temp.id_of('h1 meal') $$,
  $$ select pg_temp.photo_key('Household One', 'photo') $$,
  'DB-R-03 and keeps it');
select throws_ok(
  $$ update public.library_meals set image_path = pg_temp.photo_key('Household Two', 'photo')
      where id = pg_temp.id_of('h1 meal') $$,
  '23514', 'new row for relation "library_meals" violates check constraint "library_meals_image_path_check"',
  'DB-R-03 a key in another household''s folder is rejected');
select throws_ok(
  $$ update public.library_meals set image_path = 'https://example.com/tacos.jpg' where id = pg_temp.id_of('h1 meal') $$,
  '23514', null, 'DB-R-03 a URL is rejected: only a Storage key is stored');
select throws_ok(
  $$ update public.library_meals
        set image_path = tests.household_id('Household One')::text || '/' || pg_temp.id_of('photo')::text || '.gif'
      where id = pg_temp.id_of('h1 meal') $$,
  '23514', null, 'DB-R-03 a file type the bucket doesn''t take is rejected');
select lives_ok(
  $$ update public.library_meals set image_path = null where id = pg_temp.id_of('h1 meal') $$,
  'DB-R-03 a photo can be removed');

-- 3. Starter tags (design §6.2): new households get four, without the meal types.

reset role;

select lives_ok(
  $$ select private.provision_household('Redesign Household', 'UTC', array['member-d@example.com'], array['Member D']) $$,
  'DB-R-04 provisioning still runs');
select bag_eq(
  $$ select t.name from public.library_tags t join public.households h on h.id = t.household_id
      where h.name = 'Redesign Household' $$,
  $$ values ('Quick & Easy'), ('Family Favorite'), ('High Protein'), ('Meal Prep') $$,
  'DB-R-04 a new household gets the four starter tags, and no Breakfast, Lunch or Dinner');

-- 4. A planned meal's link (design §6.3)

reset role;
select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body, library_meal_id)
     values (tests.household_id('Household One'), '2031-02-03', 'dinner', 'Redesign Tacos', pg_temp.id_of('h1 meal')) $$,
  'DB-R-05 a member plans a library meal with its link');
select results_eq(
  $$ select library_meal_id from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2031-02-03' and meal_type = 'dinner' $$,
  $$ select pg_temp.id_of('h1 meal') $$,
  'DB-R-05 the entry keeps the link');
select throws_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body, library_meal_id)
     values (tests.household_id('Household One'), '2031-02-03', 'lunch', 'Redesign Curry', pg_temp.id_of('h2 meal')) $$,
  '23503', null, 'DB-R-05 an entry can''t link to another household''s meal');
select lives_ok(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body)
     values (tests.household_id('Household One'), '2031-02-03', 'breakfast', 'Redesign Porridge') $$,
  'DB-R-05 typed text needs no link');

-- The upsert the app sends for typed text over a chosen meal: the link goes with the text (DD-R10).
select results_eq(
  $$ insert into public.meal_entries (household_id, meal_date, meal_type, body, library_meal_id)
     values (tests.household_id('Household One'), '2031-02-03', 'dinner', 'Redesign Leftovers', null)
     on conflict (household_id, meal_date, meal_type) do update
     set household_id = excluded.household_id, meal_date = excluded.meal_date,
         meal_type = excluded.meal_type, body = excluded.body, library_meal_id = excluded.library_meal_id
     returning body, library_meal_id $$,
  $$ values ('Redesign Leftovers', null::uuid) $$,
  'DB-R-06 saving typed text over a chosen meal clears the link');
select lives_ok(
  $$ update public.meal_entries set body = 'Redesign Tacos', library_meal_id = pg_temp.id_of('h1 meal')
      where household_id = tests.household_id('Household One') and meal_date = '2031-02-03' and meal_type = 'dinner' $$,
  'DB-R-06 choosing the meal again links it again');

-- Deleting the library meal clears the link and keeps the plan's own text (K19).
select lives_ok($$ delete from public.library_meals where id = pg_temp.id_of('h1 meal') $$,
  'DB-R-07 A deletes the library meal');
select results_eq(
  $$ select body, library_meal_id from public.meal_entries
      where household_id = tests.household_id('Household One') and meal_date = '2031-02-03' and meal_type = 'dinner' $$,
  $$ values ('Redesign Tacos', null::uuid) $$,
  'DB-R-07 the planned meal keeps its text and loses only the link');

-- 5. The meal-images bucket (design §6.4)

reset role;

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'meal-images' $$,
  $$ values (false, 5242880::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$,
  'DB-R-08 the bucket is private, with a size limit and image types only');

select tests.authenticate_as('member-a@example.com');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('meal-images', pg_temp.photo_key('Household One', 'photo')) $$,
  'DB-R-09 A uploads a photo into Household One''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('meal-images', pg_temp.photo_key('Household Two', 'photo')) $$,
  '42501', null, 'DB-R-09 A cannot upload into Household Two''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('meal-images', 'redesign/' || pg_temp.id_of('photo')::text || '.jpg') $$,
  '42501', null, 'DB-R-09 A cannot upload outside any household''s folder');
select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'meal-images' and name = pg_temp.photo_key('Household One', 'photo') $$,
  array[1], 'DB-R-10 A sees Household One''s photo');

reset role;
select tests.authenticate_as('member-b@example.com');
select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'meal-images' and name = pg_temp.photo_key('Household One', 'photo') $$,
  array[1], 'DB-R-10 B, in the same household, sees it too');

reset role;
select tests.authenticate_as('member-c@example.com');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'meal-images' and name = pg_temp.photo_key('Household One', 'photo') $$,
  'DB-R-10 C, in Household Two, doesn''t see it');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('meal-images', pg_temp.photo_key('Household Two', 'h2 photo')) $$,
  'DB-R-10 control: C uploads into Household Two''s folder');
-- The Storage API sets this before it deletes; the bucket's policy still decides which rows go.
set local storage.allow_delete_query = 'true';
select is_empty(
  $$ delete from storage.objects where bucket_id = 'meal-images' and name = pg_temp.photo_key('Household One', 'photo')
     returning 1 $$,
  'DB-R-11 C cannot delete Household One''s photo');

reset role;
select tests.authenticate_as('member-a@example.com');
select results_eq(
  $$ delete from storage.objects where bucket_id = 'meal-images' and name = pg_temp.photo_key('Household One', 'photo')
     returning 1 $$,
  array[1], 'DB-R-11 A deletes Household One''s photo');

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('meal-images', pg_temp.photo_key('Household One', 'h2 photo')) $$,
  '42501', null, 'DB-R-12 anon cannot upload a photo');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'meal-images' $$,
  'DB-R-12 anon sees no photos');

reset role;
select * from finish();
rollback;
