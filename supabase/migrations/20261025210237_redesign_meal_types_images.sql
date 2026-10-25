-- redesign_meal_types_images: the data behind the redesign (specs/redesign/design.md §6, task R3).
--   1. A Beverages grocery category.
--   2. A meal type and an optional photo on library meals, with the type backfilled from the starter
--      Breakfast, Lunch and Dinner tags where a meal has exactly one of them.
--   3. Starter tags for new households without those three, now that the type has its own field.
--   4. A link from a planned meal to the library meal it was chosen from, cleared if that meal goes.
--   5. A private Storage bucket for meal photos, readable and writable only by the household.
-- Expand only (R28.5): every new column is nullable or has a default, nothing is renamed or dropped,
-- and the installed build selects named columns, so this deploys ahead of the update that uses it. That
-- build files a Beverages item under Other, as it does any category it doesn't know (R14.7).

-- 1. Groceries (design §6.1). The key list grows; no existing value changes.

alter table public.grocery_items drop constraint grocery_items_category_check;
alter table public.grocery_items add constraint grocery_items_category_check
  check (category in ('produce','meat','dairy','pantry','frozen','bakery','beverages','other'));

-- 2. Library meals (design §6.2). A meal's type is one of the three slots, or none: a meal from before
-- the redesign has none unless its tags say which, and any meal can still be planned in any slot.

alter table public.library_meals
  add column meal_type text constraint library_meals_meal_type_check
    check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner')),
  -- A Storage object key in the meal-images bucket, under the household's own folder. Never a URL:
  -- the app signs a short-lived one to show it.
  add column image_path text constraint library_meals_image_path_check
    check (image_path is null or (
      char_length(image_path) <= 120
      and image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
      and split_part(image_path, '/', 1) = household_id::text));

-- The backfill's rule: a meal linked to exactly one of the starter tags Breakfast, Lunch or Dinner gets
-- that type. A meal with two of them is ambiguous and keeps none. The tags and links stay, so nothing
-- the members entered is lost; the app no longer lists those three as tags (design DD-R7).
update public.library_meals m
   set meal_type = t.meal_type
  from (select l.meal_id, min(tg.name_key) as meal_type
          from public.library_meal_tags l
          join public.library_tags tg on tg.id = l.tag_id
         where tg.name_key in ('breakfast', 'lunch', 'dinner')
         group by l.meal_id
        having count(*) = 1) t
 where m.id = t.meal_id
   and m.meal_type is null;

-- 3. Starter tags (design §6.2). Replaces meal_library_init's list for households provisioned from now
-- on. Existing households keep the tags they have.

create or replace function private.add_starter_tags(p_household uuid)
returns void language sql set search_path = '' as $$
  insert into public.library_tags (household_id, name)
  select p_household, t.name
    from unnest(array['Quick & Easy', 'Family Favorite', 'High Protein', 'Meal Prep']) as t(name)
  on conflict (household_id, name_key) do nothing
$$;
revoke all on function private.add_starter_tags(uuid) from public, anon, authenticated;

-- 4. Planned meals (design §6.3, superseding meal library R47.7). The entry still holds its own copy of
-- the text, so editing or deleting the library meal never changes a plan (K19); the link only says
-- where the text came from, for the photo and Recently used. The composite key keeps it inside the
-- household, and deleting the meal clears just the link.

alter table public.meal_entries
  add column library_meal_id uuid,
  add constraint meal_entries_library_meal_fkey
    foreign key (library_meal_id, household_id)
    references public.library_meals (id, household_id)
    on delete set null (library_meal_id);
create index meal_entries_library_meal_id_idx
  on public.meal_entries (library_meal_id) where library_meal_id is not null;

-- 5. Meal photos (design §6.4). Private: objects are read through signed URLs, and only members of the
-- household named by an object's first folder can read, add or remove it. JPEGs from the app are well
-- under 1 MB; the limit leaves room for a large PNG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The folder is compared as text, so a malformed name can't make the cast fail for everyone.
create policy "meal-images: members read" on storage.objects for select to authenticated
  using (bucket_id = 'meal-images'
         and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));
create policy "meal-images: members insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-images'
              and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));
create policy "meal-images: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-images'
         and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h));
