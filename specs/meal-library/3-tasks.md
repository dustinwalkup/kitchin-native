# Kitchin Meal Library — Implementation Tasks

> **Phase 3 of 4** in the EARS spec-driven process: 1-requirements → 2-design → **3-tasks** → 4-test-plan.
> **Status:** Draft for owner review, 2026-10-19. Implements [2-design.md](./2-design.md) and [1-requirements.md](./1-requirements.md), both approved 2026-10-19. Implementation waits until the owner approves this document and [4-test-plan.md](./4-test-plan.md), which cites every task by number.
> **Amended during test planning:** task 15.1 adds DB-L-33 and DB-R-18 (4-test-plan §12).

The tasks are ordered by dependency. Numbering continues from [`specs/meals/3-tasks.md`](../meals/3-tasks.md) (sections 9–13) and [`specs/app-deploy/spec.md`](../app-deploy/spec.md) (section 14): sections start at **15** and owner gates at **G14**, so "task 15.1" means one thing anywhere in the project. Each task fits in one focused session. Tests are written with the code, or before it where a task is marked **TDD**. A task is done when its tests pass locally and the CI `app` and `database` checks pass (CLAUDE.md, Commands).

Work happens on `main` in the shared working tree. Agents don't commit; the owner reviews and commits.

This list contains only coding work. Owner steps are in [`docs/TASKS.md` → Meal library](../../docs/TASKS.md#meal-library): the two-simulator check, the production deploy, the over-the-air update and the phone checks. Its 🤖 lines mirror these tasks under the same numbers, so tick both when a task is done.

**References:**

- `R45.3` is acceptance criterion 45.3, `K24` a key decision and `N25` a non-functional requirement, in [1-requirements.md](./1-requirements.md). R1–R29 and N1–N20 are in [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md), and R30–R38 and N21–N24 in [`specs/meals/1-requirements.md`](../meals/1-requirements.md).
- `§3.9`, `DD46`, `OI-20` and "finding 1" are a section, a design decision, an open item and a research finding in [2-design.md](./2-design.md). "Meals DD25" and "meals OI-16" are in [`specs/meals/2-design.md`](../meals/2-design.md).

**Sizes:**

| Size | Effort |
|---|---|
| S | Under half a session |
| M | About one session |
| L | A full session; split the task if it grows past that |

---

## Owner gates

| Gate | Owner step | Needed before |
|---|---|---|
| G14 | `docs/TASKS.md` ML.3: the production deploy of `meal_library_init` | The over-the-air update with the library (ML.4) |
| G15 | `docs/TASKS.md` ML.5: search and order on a physical iPhone (OI-22) | Meal library sign-off. If it fails, OI-22's fallback becomes a new task |

**Meals OI-16.** The meal form's field limits use the `maxLength` approach that meals OI-16 recommends (DD56). The owner hasn't yet settled OI-16's emoji trade-off. If the decision differs, task 18.3 follows it, and so does meals' own fallback task. It isn't a gate: 18.3 can start either way.

**Timing.** Requirements Assumption 1 expects meal planning to be in daily use first, and `docs/TASKS.md` P2.4, shipping Meals to both phones, isn't done yet. Sections 15–20 work only against the local stack, so the owner decides when they start. Nothing reaches production before G14. If ML.4 runs before P2.4, that one update ships Meals and the library together.

**Shared local stack.** Several agents use one local Supabase stack. Before running `npx supabase db reset`, make sure nobody is signed in: run it only if `select count(*) from auth.sessions` returns 0, or ask the owner. To check SQL without a reset, run it in a transaction and roll it back, as finding 1 did.

---

## 15. Library database (M15)

- [x] **15.1 Write the library database tests first** · L
  - Add the library grants to the expected-grants table in `00_structure.test.sql`: `library_meals` select, insert, update and delete; `library_tags` select, insert and update; `library_meal_tags` select, insert and delete. The existing structural checks then cover the new tables and functions without new cases: RLS, `household_id`, the household index, the audit and broadcast triggers, no `public` functions, and the private-function privileges.
  - `60_meal_library.test.sql`, acting as A–D and anon. Put fixtures in with the triggers off, backdated and attributed directly, as `50_meal_entries.test.sql` does:
    - **Isolation**, for each of the three tables:
      - A reads Household One's rows only.
      - C's insert, and C's upsert in the merge-duplicates shape, into H1 fail with `42501`.
      - C's updates and deletes of H1 rows affect 0 rows.
      - D reads nothing. anon can't read or write.
    - **Tags:**
      - The seeded households each have the seven starter tags, unattributed.
      - `add_starter_tags` run again adds nothing.
      - A plain insert of an existing tag's name in another case, or with other spacing inside it, fails with `23505` on `library_tags_one_per_name`: "DINNER", and "Taco   Night" after "Taco Night".
      - An upsert on `(household_id, name_key)`, as A and then B, returns the existing row's ID and first spelling, and leaves one row.
      - Two rows with the same key in one upsert fail with `21000`.
      - Changing a tag's key fails with `42501`. Changing only its case succeeds and leaves the name as it was.
      - These fail with `23514`: an empty name, a leading or trailing space, a line feed, U+2028, and 31 characters. 30 characters, and a non-ASCII name, succeed, and `name_key` lower-cases the non-ASCII letters.
    - **Meals:**
      - A upserts a meal on a given `id`, then B upserts the same `id` with other values. One row remains, with B's values, `created_by` A and `updated_by` B.
      - C's upsert of that `id` fails with `42501`, whether C names Household Two or Household One.
      - These fail with `23514`: an empty name, 101 characters, a CR or LF in the name, a leading or trailing space in any field, an empty description or ingredients, 301 characters of description and 2,001 of ingredients. A 100-character name of `é`, and line breaks in the description and ingredients, succeed.
      - An update of one field returns 1 row. An update of an unknown `id` returns 0.
      - Deleting a meal returns 1 row, and deleting it again returns 0 without an error.
    - **Links:**
      - Adding a link twice with `on conflict do nothing` leaves one.
      - A link from an H1 meal to an H2 tag fails with `23503`, even as `postgres`.
      - C's link from its own tag to an H1 meal, naming H2, fails with `23503`.
      - A can't update a link, and can't delete a tag (`42501`).
      - Deleting a tag, as `postgres`, removes its links and keeps the meal. Deleting a meal removes its links and keeps every tag.
      - With an entry whose body equals a meal's copied text, renaming and then deleting the meal leaves the entry unchanged, and `meal_entries` has no foreign key to a library table (R47.7). *(Added during test planning.)*
    - **Attribution:**
      - Spoofed `created_by` and `updated_by` values are overwritten on all three tables.
      - A can't set `created_by` to null (`42501`).
      - Deleting an auth user nulls both. Clear the test's signed-in identity first, as the other suites do.
    - **Privileges:** `authenticated` can't execute `private.add_starter_tags` or `private.handle_library_tag_name`.
  - `30_realtime.test.sql`: an insert, an update and a delete on each library table, as A, broadcast on H1's topic with that table's name. C can't read them. C's rejected writes broadcast nothing (N7). *(Added during test planning.)*
  - `40_provisioning.test.sql`: a newly provisioned household has exactly the seven starter tags, and a provisioning that fails leaves no tags behind (R23.3).
  - The new cases fail until 15.2 lands.
  - _Requirements: R19 and R22 through R47.1, R43.8, R46.4, R46.8, R47.2–R47.8, R23.2 (amended), R23.3_ — _Design: §4.1–§4.5, §7, §8, finding 1_

- [x] **15.2 Write the migration `meal_library_init`** · M
  - Create it with `npx supabase migration new meal_library_init`. Per §4.1–§4.4, it holds:
    - the three tables, with their named CHECK constraints, unique constraints, composite foreign keys and indexes
    - `private.handle_library_tag_name()` and `private.add_starter_tags(uuid)`, with execute revoked from `public`, `anon` and `authenticated`
    - the seven triggers
    - grants, RLS and the policies in the §4.3 table, and no others
    - `private.provision_household` replaced: the `groceries_init` version plus `perform private.add_starter_tags(v_household)` after the grocery list insert
    - the backfill, `select private.add_starter_tags(h.id) from public.households h`
  - Add the §4.6 meals and tags to `supabase/seed/10_seed_data.sql`, with member A's claims set.
  - In `scripts/provision-household.sql`, the comment adds "and its starter tags". The call doesn't change.
  - Regenerate `src/types/database.ts`.
  - Done when 15.1 passes and the structural tests stay green, `supabase db lint --local --schema public,private --fail-on error` is clean, and `supabase db advisors --local --type security --fail-on warn` is clean.
  - _Requirements: R43.8, R47, N30, N31, R23.2 (amended)_ — _Design: §4, §5, DD43–DD48_

## 16. Library data layer (M16)

- [x] **16.1 Write the library constants and the text, search and tag rules (TDD)** · M
  - Write `src/features/meal-library/constants.ts` per §3.1.
  - Write the tests first, then this part of `domain.ts` per §3.2:
    - `charLength`, `clampTo`, `maxLengthFor` and `charactersLeft`, with emoji and pasted text over each limit
    - `trimField`: everything `trim()` strips, plus U+0085 (meals finding 6)
    - `oneLine`: CR, LF, CR LF, U+0085, U+2028 and U+2029 each become one space
    - `cleanTagName` and `tagKey`: the SQL examples in finding 1 give the same keys, such as "quick  &  EASY" → "quick & easy"
    - `foldForSearch`: "Jalapeño" folds to "jalapeno", and "JALA" matches it. With `String.prototype.normalize` removed, it falls back to lower-casing alone
    - `filterMeals`: AND across tags, search alone, both together, no tags, and an empty search
    - `compareNames`: accents and case sort together, "Soup 2" comes before "Soup 10", and equal names fall back to exact text and then ID
    - `copiedText`: the name alone; the name, a line break and the description; and 401 characters at the limits
    - `buildLibrary`: a bad meal or tag row is left out and named in `reportKeys`; a link to an unknown tag is dropped; both lists come back sorted; each meal's `tagIds` follow its tags' order
  - Add `makeLibraryMeal`, `makeLibraryTag`, `makeMealRow` and `makeTagRow` to `src/test/factories.ts`.
  - The existing `./src/features/*/domain.ts` coverage group (95/90) and the `domain.ts` purity lint rule apply without changes.
  - _Requirements: R40.4, R41.1, R41.4–R41.6, R42.2–R42.4, R43.5, R45.4, R46.9, K20, K21, K23, K25, N25, N28_ — _Design: §3.1, §3.2, DD44, DD54, DD56, findings 1, 2 and 7_

- [x] **16.2 Write the form and save-plan rules (TDD)** · M
  - Needs 16.1.
  - Write the tests first, then the rest of `domain.ts` per §3.2:
    - `formValuesOf`: a new meal starts empty, or with the trimmed search text as its name; an edit starts from the meal, with its tags selected
    - `addTypedTag`: `added` for a new name; `selected-existing` for a household tag with the same key; `already-selected`; a second new tag with the same key as one added in this form; and `empty` for whitespace
    - `isDirty`: unchanged values, an edit to any field, and a tag added then removed again
    - `validateMeal`: trimming, an empty name, each field over its limit, and empty optional fields becoming `null`
    - `planSave`, every branch: a new meal (an `upsert` with every field and every tag); an edit of fields only; an edit of tags only (`check`); an unchanged edit (`null`); new tags whose keys repeat, sent once; and an edit that leaves alone a tag the other member added after the form opened
    - `constraintField` for each named CHECK constraint, and `null` for anything else
  - _Requirements: R42.4–R42.7, R42.11, R42.12, R43.4–R43.7, R46.4, R46.5_ — _Design: §3.2, DD46_

- [x] **16.3 Write the hand-offs** · S
  - Write `src/features/meal-library/handoff.ts` per §3.6, with `newMealName`, `lastSaved` and `mealPick`.
  - Tests: each `set` gets a new `id`; `read` doesn't consume; `clear` empties it; the three hand-offs are independent.
  - _Requirements: R42.6, R42.9, R44.3, R45.3_ — _Design: §3.6, DD51_

- [x] **16.4 Write the library API layer** · M
  - Needs 15.2's generated types and 16.2.
  - Write `src/features/meal-library/api.ts` per §3.3, including `runSavePlan`, with every failure wrapped by `toApiError`.
  - Tests with a stub client:
    - `fetchLibrary` requests pages of 1,000 ordered by `id` and stops on a short page, for meals and for tags
    - `upsertTags` sends only `household_id` and `name`, with `onConflict: 'household_id,name_key'`
    - `upsertMeal` sends `id`, `household_id`, `name`, `description` and `ingredients`, with `onConflict: 'id'`
    - no request carries attribution or timestamps
    - `updateMeal` returns `'missing'` when no row comes back
    - `addTagLinks` sets `ignoreDuplicates`; `removeTagLinks` filters on the meal and the tag IDs
    - `runSavePlan` runs tags, meal, added links, then removed links; stops at the first failure; turns `'missing'` and a failed `mealExists` into `not_found`; and throws `tag_key_mismatch` when a returned key doesn't match
    - raw PostgREST text never appears on a thrown error
  - Close OI-24: with the local stack running and signed in as member A, run a throwaway script (in a scratch folder, not committed) that calls `upsertTags` with an existing tag in other spelling and `fetchLibrary`. Check that the existing row comes back and that each meal's `library_meal_tags` is embedded. Record the result in design §10.
  - _Requirements: R40.3, R44.5, R46.4, R46.7, R26.4_ — _Design: §3.3, DD45, DD46, DD59, findings 1 and 5, OI-24_

- [x] **16.5 Write the library query and the save and delete mutations (TDD)** · L
  - Needs 16.4.
  - Write the tests first, with a real `QueryClient` and a mocked `api.ts`:
    - while `onlineManager` is offline, a save or delete returns `offline` and calls nothing
    - a failed request isn't retried
    - each error category maps to its outcome per the §3.4 table, including `invalid` with the field from `meta.constraint`
    - a successful save puts the meal and any new tags in the cached library, sorted, before the promise resolves; a successful delete removes the meal
    - mutations run in order in the `library:<hid>` scope
    - only the last library mutation to settle invalidates the library
    - the library stays cached (`gcTime: Infinity`)
    - a bad row is left out and reported once
    - the status values and `refreshFailedAt` behave as they do for `useMealWeek`
    - forbidden, validation and server errors are reported; network errors aren't
  - Implement `src/features/meal-library/hooks.ts` per §3.4.
  - In `jest.config.js`, put `src/features/meal-library/hooks.ts` in the 90/85 coverage group.
  - _Requirements: R40.8–R40.11, R42.8–R42.10, R44.3–R44.5, R45.11, R46.2–R46.7, R46.9, K24_ — _Design: §3.4, DD49, DD59_

- [x] **16.6 Handle library events** · S
  - Needs 16.5's `libraryKeys`.
  - Write `src/features/meal-library/realtime.ts` per §3.5, and merge `libraryTableHandlers` into `TABLE_HANDLERS` in `src/app/(app)/_layout.tsx`.
  - Tests:
    - an event during a pending library mutation doesn't invalidate
    - otherwise it invalidates `library` and leaves the grocery and meal queries alone
    - a burst touching all three library tables, and a meal table, runs each handler once
  - _Requirements: R46.1, R11.2 (amended), R11.4, R11.5_ — _Design: §3.5_

## 17. Shared UI and errors (M17)

- [x] **17.1 Add the terracotta tone, the tag-pill pair and CHECK constraint names** · S
  - `Chip` and `Button` gain `tone?: 'cactus' | 'accent'` per §3.12. The default stays cactus, so existing callers don't change. Tests: each tone's colours, bold white text on terracotta, and the default.
  - `TEXT_PAIRS` adds `ink` on `accentSoft`. `theme.test.ts` measures it (10.50, finding 6).
  - `classifyError` keeps a CHECK constraint's name in `meta.constraint` for `23514`. Tests: the name is kept; no other text from the message is; unique-constraint handling doesn't change.
  - _Requirements: R40.12, R42.10, R43.1, N13, R26.4_ — _Design: §3.12, DD57, DD58, finding 6_

## 18. Library screens (M18)

- [x] **18.1 Build the browser components** · L
  - Needs 16.1 and 17.1.
  - Build `SearchField`, `TagFilter`, `TagPill`, `TagChip`, `MealRow`, `LibraryStates` and `MealBrowser` per §3.7.
  - Component tests:
    - typing filters the list with no Search button; the search ignores case and accents
    - Filter by tags starts collapsed with no chips shown; opening it shows every tag; selecting tags filters with AND; the count and the selected names show while collapsed
    - Clear filters appears only while there's a search or a selected tag, and empties both
    - "No meals match" with Clear filters, distinct from the empty library
    - the Just saved row shows a given meal above the list whatever the filters, and goes when the search or tags change
    - rows show the name and tags in order, wrap rather than truncate, and read "Tacos. Tags: Dinner, Quick & Easy"
    - a selected `TagChip` shows ✓, and VoiceOver reads the name and "selected"
    - the filter reads "Filter by tags, 2 selected", with its expanded state
    - every touch target is at least 44 pt, and `testID`s hold no household text
  - _Requirements: R40.3–R40.5, R40.8–R40.10, R41, R42.9, R45.9, N25–N27, N29_ — _Design: §3.7, DD53–DD55, DD57_

- [x] **18.2 Build the Meal Library screen and the Library button** · M
  - Needs 16.3, 16.5 and 18.1.
  - Write `src/app/(app)/meal-library.tsx` per §3.8, and register it in `src/app/(app)/_layout.tsx` with `title: 'Meal Library'` and `headerBackTitle: 'Meals'`.
  - Build `LibraryButton`, and add it to the Meals tab's `headerLeft` in `src/app/(app)/(tabs)/_layout.tsx` (§3.11).
  - Route tests in `src/__tests__/meal-library.test.tsx`, with mocked hooks:
    - Library on the Meals header opens the Meal Library; Back returns to the same week
    - an open slot editor saves when the library opens
    - every state in the §3.8 table, and pull to refresh
    - Add meal sets `newMealName` from the search and opens `/meal-form`; a row opens `/meal-form?id=<id>`
    - on focus after a save, "Meal saved" shows with the Just saved row; after a delete, "Meal deleted"
    - the library opens with an empty search and no tags, and keeps them after returning from the form
  - Update `src/__tests__/routing.test.tsx` for the new route, and `meals.test.tsx` for the header button.
  - In the Simulator, with 300 meals of five tags each loaded by a local-only SQL snippet (not the seed), check that the list scrolls smoothly and searching keeps up with typing (N25).
  - _Requirements: R40, R41.9, R42.6, R42.9, R44.3, N25, N26_ — _Design: §3.8, §3.11, DD50, DD51, DD55, DD60_

- [ ] **18.3 Build the meal form components** · L
  - Needs 16.2 and 17.1.
  - Build `TagPicker`, `FormError` and `MealForm` per §3.7 and §3.9.
  - Component tests:
    - the four fields in order, with their labels; Name is one line and pasted line breaks become spaces
    - each field's `maxLength` follows `maxLengthFor`, and its counter appears below 20 (Name) or 50 characters left and reads "12 characters left"
    - Save with an empty name shows "Enter a meal name" at Name, focuses it and announces it
    - the tag chips are alphabetical; tapping toggles; New tag adds a selected chip, selects an existing tag with the same key without an error, and adds nothing when empty; a deselected new tag disappears
    - each `FormError` row in §3.9 shows its message and its action: Retry, Save as new meal, or none
    - Delete meal shows only when editing
  - Follow meals OI-16's outcome if the owner has settled it differently from DD56.
  - _Requirements: R42.1–R42.5, R42.7, R42.10, R43.1–R43.7, R43.10, R44.1, R46.7, N26, N27, N29_ — _Design: §3.7, §3.9, DD56, DD57_

- [ ] **18.4 Build the meal form screen** · M
  - Needs 16.3, 16.5, 18.2 and 18.3.
  - Write `src/app/(app)/meal-form.tsx` per §3.9, and register it in `src/app/(app)/_layout.tsx` with `presentation: 'fullScreenModal'`.
  - Route tests in `meal-library.test.tsx`:
    - "New meal" and "Edit meal" titles; the name starts from `newMealName`; an edit starts from the meal with its tags selected
    - a new meal's ID stays the same across a failed save and Retry
    - Save shows a spinner and disables Save and Cancel; success sets `lastSaved` and goes back
    - an unchanged edit closes without calling the save
    - each failure outcome keeps every value and shows its `FormError`; Save as new meal saves under a new ID with `base` null
    - Cancel with changes asks "Discard changes?"; Keep editing stays and Discard leaves; Cancel without changes leaves at once
    - Delete meal confirms with the meal's name and the plans message; success sets `lastSaved` to `deleted` and goes back; failure keeps the form open with Retry
    - a changed meal from the other phone doesn't change the open form's fields
    - an `id` that isn't in the library shows the missing-meal message with Close
  - _Requirements: R42, R44, R46.3, R46.7_ — _Design: §3.9, DD46, DD49–DD51, finding 3_

## 19. Choosing from the library (M19)

- [x] **19.1 Add Choose from Meal Library to the slot editor** · S
  - Add the optional `onChooseFromLibrary` prop to `SlotEditor` per §3.11: "Choose from Meal Library" in bold terracotta before Clear, at least 44 pt, `testID="slot-choose"`.
  - Tests: no button without the prop; with it, tapping calls the prop; the footer wraps at the largest standard text size; the existing slot-editor tests still pass unchanged.
  - _Requirements: R45.1, R45.13, N11, N12, N26_ — _Design: §3.11_

- [ ] **19.2 Build the picker** · M
  - Needs 16.3, 16.5, 18.1 and 18.4.
  - Write `src/app/(app)/meal-picker.tsx` per §3.10, and register it in `src/app/(app)/_layout.tsx` with `presentation: 'modal'` and `title: 'Choose a meal'`.
  - Route tests:
    - "For Thursday dinner" from the params; bad params close the picker and report `picker_bad_params` once
    - a cached library shows at once; the picker opens with an empty search and no tags
    - tapping a meal sets `mealPick` to the slot and `copiedText(meal)`, then goes back
    - Cancel goes back without setting `mealPick`
    - "+ Add new meal" sets `newMealName` from the search and opens `/meal-form`; after a save, the picker shows "Meal saved" and the Just saved row, even when the search hides the meal
    - the empty library offers "+ Add new meal"; no row offers edit or delete
  - _Requirements: R45.2–R45.4, R45.7–R45.12_ — _Design: §3.10, DD50, DD51, DD55, DD60_

- [ ] **19.3 Connect the picker to Meals** · M
  - Needs 19.1 and 19.2.
  - In `src/app/(app)/(tabs)/meals.tsx`, add `returning` and `appliedPick`, `chooseFromLibrary`, and the focus-effect setup per §3.11.
  - Route tests in `meals.test.tsx`, with the picker's hand-off set by the test:
    - Choose saves the slot's draft as the picker opens
    - returning with a pick calls `setMeal` with the copied text and reopens that slot's editor showing it; VoiceOver announces "Thursday dinner: Tacos"
    - a pick equal to the slot's text sends no write
    - returning without a pick reopens the editor with the slot's text
    - a pick for another slot, or one already applied, is ignored
    - a failed save of the chosen text shows Meals' Retry toast
    - typing in a slot works as before when the library is never opened
  - In the Simulator:
    - choose a meal from the picker; the editor reopens and the keyboard rises (OI-21)
    - add a meal from the picker; the form presents over the picker sheet, and both Save and Cancel return to the picker with its search, tags and scroll position (OI-20)
  - _Requirements: R45.1, R45.3, R45.5–R45.7, R45.13, R35.5, R32.3_ — _Design: §2.3, §3.11, DD52, OI-20, OI-21_

## 20. Meal library sign-off (M20)

- [ ] **20.1 Bring the docs up to date** · S
  - In `CLAUDE.md`, name `specs/meal-library/` alongside `specs/mvp/` and `specs/meals/` as authoritative for its feature, and note that its numbering continues from them (R40, N25, DD43, OI-20 and task 15 onwards). Leave the owner's Status line alone unless the owner asks.
  - Record how OI-20–OI-24 were resolved in `specs/meal-library/2-design.md` §10.
  - Check that every task here and its 🤖 line in `docs/TASKS.md` are ticked, and list any that weren't done.
  - _Requirements: none directly; it keeps the spec and the code in step_ — _Design: §10_

---

## Requirements coverage matrix

| Requirement | Tasks |
|---|---|
| R40 Library screen | 16.1, 16.5, 17.1, 18.1, 18.2 |
| R41 Search and filter by tags | 16.1, 18.1, 18.2 |
| R42 Add or edit a meal | 16.1, 16.2, 16.3, 16.5, 17.1, 18.3, 18.4 |
| R43 Tags | 15.1, 15.2, 16.1, 16.2, 17.1, 18.3 |
| R44 Delete a meal | 15.1, 16.4, 16.5, 18.3, 18.4 |
| R45 Choose from the Meal Library | 16.1, 16.3, 18.1, 19.1, 19.2, 19.3 |
| R46 Library sync, conflicts and offline | 15.1, 16.2, 16.4, 16.5, 16.6, 18.4; the two-device checks are owner step ML.1 |
| R47 Library data integrity | 15.1, 15.2 |
| Amendments: glossary | 15.1 |
| Amendments: R11.2 | 16.6 |
| Amendments: R13.2, R14.1 | 16.5 |
| Amendments: R23.2 | 15.1, 15.2 |
| Amendments: R26.4 | 16.4, 17.1 |
| Amendments: meals N24 and Out of Scope | 15.2, 18.2, 19.1 |
| N25 Performance | 16.1, 18.1, 18.2 |
| N26, N27 Labels and VoiceOver | 18.1, 18.2, 18.3, 19.1 |
| N28 Pure rules | 16.1, 16.2 |
| N29 One form, one browser | 18.1, 18.3 |
| N30 Additive | 15.2, 19.1; design §1.5 lists every existing file that changes |
| N31 Plain-text ingredients | 15.2, 16.1 |

## Parallelization opportunities

- **Four tracks can start at once:**
  - the database (15.1 → 15.2)
  - the domain rules (16.1 → 16.2)
  - the hand-offs (16.3) and the shared UI and errors (17.1)
  - the slot editor's Choose button (19.1)
- **The data layer:** 16.4 needs 15.2's types and 16.2. 16.5 needs 16.4. 16.6 needs 16.5's `libraryKeys`.
- **The screens:** 18.1 needs 16.1 and 17.1. 18.3 needs 16.2 and 17.1, so it can run alongside 18.1 and the data layer. 18.2 needs 16.3, 16.5 and 18.1. 18.4 needs 18.2 and 18.3.
- **Choosing:** 19.2 needs 18.1 and 18.4. 19.3 needs 19.1 and 19.2.
- **Files shared between tracks:** `src/app/(app)/_layout.tsx` (16.6, 18.2, 18.4, 19.2), `src/test/factories.ts` (16.1), `jest.config.js` (16.5), `src/__tests__/meals.test.tsx` (18.2, 19.3) and `meal-library.test.tsx` (18.2, 18.4). Edit only the lines a task owns, because agents share one working tree.
- **20.1** comes last.
