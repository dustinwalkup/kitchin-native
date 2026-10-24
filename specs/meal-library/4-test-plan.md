# Kitchin Meal Library — Test Plan

> **Phase 4 of 4** in the EARS spec-driven process: 1-requirements → 2-design → 3-tasks → **4-test-plan**.
> **Status:** Draft for owner review, 2026-10-19, to be approved together with [3-tasks.md](./3-tasks.md). Requirements and design were approved 2026-10-19.
> **Amended at the owner's request, 2026-10-24** (the Library tab, task 21.1): C-LIB-01–03, C-LIB-09, C-RTE-11 and MT-18-01 changed; C-LIB-11–14, C-RTE-06 (amended again), C-RTE-12 and MT-18-14 added.

## 1. Requirements Traceability

This plan verifies the Meal Library from the database up to the two phones. These are the behaviours it has to prove, in order of risk:

1. **The library stays inside the household.** No account outside it can read, write, upsert into, link across or receive events for its meals, tags and links (R47.1, R19, R22).
2. **Plans never depend on the library.** Editing or deleting a meal never changes an entry, and choosing a meal copies its text and nothing else (R44.6, R45.6, R47.7, K19).
3. **A save never loses what the member typed and never duplicates anything.** That covers the form's failure handling, the idempotent save plan, Retry, the tag race and the "deleted elsewhere" path (R42.10, R46.2–R46.8, DD46).
4. **Tags stay unique.** One tag per normalized name per household, enforced by the database for any caller (R47.4, DD44, DD45).
5. **Library text never leaves the phone** except to the database (R26.4 as amended).
6. **The library is usable.** Search, the tag filter, the picker flow, VoiceOver, large text and contrast (R40, R41, R45, N25–N27).

**References:**
- `R45.3`, `K24` and `N25` point to [1-requirements.md](./1-requirements.md); R1–R29 and N1–N20 to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md); R30–R38 and N21–N24 to [`specs/meals/1-requirements.md`](../meals/1-requirements.md). `SC1`–`SC13` are the requirements' Success Criteria.
- `§3.9`, `DD46`, `OI-20` and "finding 1" point to [2-design.md](./2-design.md).
- Task numbers (15.1–20.1) point to [3-tasks.md](./3-tasks.md).

**Test IDs.** These continue the MVP and meals schemes. New prefixes start at 01, and existing prefixes continue past their highest number so far.

| Prefix | Kind | Runs in | Section |
|---|---|---|---|
| `DB-S-06` (amended) | pgTAP, structural | CI `database` | §2.1 |
| `DB-L` | pgTAP, library tables | CI `database` | §2.2 |
| `DB-R-14` on, `DB-P-08` on | pgTAP, realtime and provisioning | CI `database` | §2.3, §2.4 |
| `U-LDOM`, `U-LHOF`, `U-LAPI`, `U-LMUT`, `U-LRT` | Jest: library domain, hand-offs, API, query and mutations, live updates | CI `app` | §3.1–§3.5 |
| `U-THM-10`, `U-ERR-13` | Jest: theme and error additions | CI `app` | §3.6 |
| `C-UI-09` on | RNTL: `Chip` and `Button` tones | CI `app` | §3.6 |
| `C-LBR`, `C-LIB`, `C-LFM`, `C-LFS`, `C-PICK` | RNTL component and route tests for the library | CI `app` | §4.1–§4.4, §4.6 |
| `C-SLOT-16` on, `C-MEAL-15` on, `C-RTE-11` | RNTL additions to the meals and routing tests | CI `app` | §4.5, §4.7 |
| `MT-18-*`, `MT-19-*`, `MT-20-*` | Manual checks by milestone | Simulator or phones | §6 |

### 1.1 Test Coverage Summary

| Layer | Tool | What it proves |
|---|---|---|
| Database, structural | pgTAP | The three tables follow every convention. The existing generic checks cover them once DB-S-06 lists their grants |
| Database, behavioural | pgTAP, acting as users A–D and anon | Isolation, validation, the tag key and its upsert, immutable tag names, the meal upsert on `id`, link integrity across households, cascades, attribution, starter tags, entries untouched, broadcasts |
| Unit | Jest | Text, search, order, tag and save-plan rules; hand-offs; the API's payloads and plan order; mutation outcomes, cache patches and sync; theme contrast; error classification |
| Component and route | RNTL 14 + `renderRouter` | The browser, library screen, form, picker and the Meals changes, with `api.ts` or the hooks mocked |
| Manual | Owner, on the Simulator and phones | Hermes search and order on a device, stacked modals, the keyboard after choosing, two-device sync and races, offline, VoiceOver, large text, production |

### 1.2 Frameworks and Conventions

The MVP and meals conventions apply unchanged:
- RNTL 14's async API
- `renderRouter` for route tests
- pgTAP files that begin, plan and roll back
- `api.ts` mocked in hook and component tests, and `domain.ts` never mocked
- test files beside their modules, with IDs in the `it` names

Additions:

- **"Upsert" in pgTAP** means the statement PostgREST builds for `postgrest-js`'s `upsert`, as finding 1 ran it. For tags: `insert … (household_id, name) … on conflict (household_id, name_key) do update set household_id = excluded.household_id, name = excluded.name`. For meals: `insert … (id, household_id, name, description, ingredients) … on conflict (id) do update set` every column sent. For links: `insert … on conflict (meal_id, tag_id) do nothing`.
- **pgTAP fixtures** name their meals and custom tags with a `Fixture ` prefix, so they never collide with the seed's library, which `60_meal_library.test.sql` may also read.
- **Jest is not Hermes.** Node has full ICU, and the app runs on Hermes's CoreFoundation and Foundation string support (design finding 2). Unit tests prove the logic. MT-20-12 proves the engine on a phone.
- **Hand-offs** are reset in `beforeEach` with each hand-off's `clear()`, so no test inherits another's values.

---

## Part A — Automated Tests

## 2. Database Tests (pgTAP)

### 2.1 Structural — `00_structure.test.sql` (task 15.1)

| ID | Change | Expected | Req |
|---|---|---|---|
| DB-S-06 (amended) | The expected `authenticated` set adds `library_meals` {SELECT, INSERT, UPDATE, DELETE}, `library_tags` {SELECT, INSERT, UPDATE} and `library_meal_tags` {SELECT, INSERT, DELETE} | Exact match, so a stray `delete` on tags or `update` on links fails | R47.1, DD48, R27.4 |

These existing checks cover the three tables and the two new private functions with no change, and must stay green after 15.2:
- DB-S-01–05: RLS, `household_id`, no `anon` or `true` policies, no `anon` grants
- DB-S-07–09: definer `search_path`, and `private` execute rights. Both new functions are invokers with execute revoked, so DB-S-09's "only `my_household_ids`" holds
- DB-S-11: no `public` functions, so the save plan really has no RPC
- DB-S-14: audit and broadcast triggers on every household table, including the link table
- DB-S-15: an index leading with `household_id` on each table

### 2.2 Library Tables — `60_meal_library.test.sql` (task 15.1)

**Isolation**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-L-01 | A | `select` from each of the three tables | Only H1 rows in each | R47.1, R19.2 |
| DB-L-02 | C | `select` H1 rows from each table | 0 rows | R19.2 |
| DB-L-03 | anon | `select` from each table | `42501` | R19.3 |
| DB-L-04 | D (no membership) | `select` from each table, then insert a meal into H1 | 0 rows, then `42501` | R19.9 |
| DB-L-05 | C | Insert a meal, a tag and a link with `household_id = H1` | `42501` for each | R19.4 |
| DB-L-06 | C | Upsert an H1 meal's `id`, naming H2, then naming H1 | `42501` both times; the H1 row is unchanged | R19.4, finding 1 |
| DB-L-07 | C | Upsert the tag "Dinner" into H1 | `42501`; H1's Dinner is unchanged | R19.4, DD45 |
| DB-L-08 | C | Update and delete H1 meals and tags by `id`, and delete H1 links | 0 rows each; all unchanged | R19.2 |
| DB-L-09 | A | Update an own meal, setting `household_id = H2` | `42501` | R19.4, R19.5 |

**Tags**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-L-10 | postgres | Read each seeded household's tags | Exactly the seven starter tags in each, matching `STARTER_TAGS`, with `created_by` null | R43.8, R47.8 |
| DB-L-11 | postgres | `private.add_starter_tags(H1)` again | Still seven starter tags in H1 | R43.8, DD47 |
| DB-L-12 | A | A plain insert of "DINNER"; then of "Fixture  Taco   Night" after "Fixture Taco Night" | `23505` on `library_tags_one_per_name` for both | R47.4, DD44 |
| DB-L-13 | A, then B | Upsert "quick  &  EASY" as A, then "Quick & easy" as B, each returning `id, name` | Both return the starter tag's `id` and the name "Quick & Easy"; H1 still has one such tag | R43.5, R46.8, DD45 |
| DB-L-14 | A | One upsert with "Fixture Soup" and "fixture soup" | `21000`; nothing created | finding 1 |
| DB-L-15 | A | Update a tag's name to a different key; then to "dinner" | `42501`; then success with the name still "Dinner" | R43.11, DD45 |
| DB-L-16 | A | Tag names `''`, `' Lead'`, `'Trail '`, `E'Two\nlines'`, one containing U+2028, and 31 characters | `23514` on `library_tags_name_check` for each. 30 characters succeed | R47.3 |
| DB-L-17 | A | Insert "Fixture ÉCLAIR  Night" | `name_key` is `fixture éclair night` | DD44 |
| DB-L-18 | A | Delete a tag | `42501` (no grant) | R43.11, DD48 |

**Meals**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-L-19 | A | Upsert a new meal on a given `id` | One row; `created_by` and `updated_by` are A | R46.4, R47.8 |
| DB-L-20 | B, after DB-L-19 | Upsert the same `id` with another description and ingredients | One row, with B's values, the same `id`, `created_by` A and `updated_by` B | R46.4, R46.6, finding 1 |
| DB-L-21 | A | Upsert the same `id` and values twice, as a retry | One row and no error | R46.4, N5 |
| DB-L-22 | A | Names `''`, 101 characters, `E'Two\r\nlines'`, `E'Two\nlines'`, `' Lead'` and `'Trail '` | `23514` on `library_meals_name_check` for each. 100 × `é` succeeds | R47.2 |
| DB-L-23 | A | Description `''`, `' x'` and 301 characters; ingredients `''` and 2,001 characters | `23514` on `library_meals_description_check` or `library_meals_ingredients_check`. Null for both, and inner line breaks in both, succeed | R47.2, R47.9, R42.4 |
| DB-L-24 | A | Update one field of a meal, returning `id`; then update an unknown `id` | 1 row, then 0 rows | R46.5, R46.7 |
| DB-L-25 | A | Delete a meal, returning `id`; then delete it again | 1 row, then 0 rows with no error | R44.5 |

**Links, cascades and entries**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-L-26 | A | Insert a link with `on conflict do nothing`, twice | One link | R47.5, N5 |
| DB-L-27 | A | A plain duplicate insert of that link | `23505` on `library_meal_tags_one_per_pair` | R47.5 |
| DB-L-28 | postgres | Link an H1 meal to an H2 tag, naming H1 | `23503`, despite bypassing RLS | R47.5, R19.6 |
| DB-L-29 | C | Link C's own tag to an H1 meal, naming H2 | `23503` | R19.6 |
| DB-L-30 | A | Update a link | `42501` (no grant) | DD48 |
| DB-L-31 | postgres | Delete a tag that two meals have | Its two links are gone; both meals remain | R47.6 |
| DB-L-32 | A | Delete a meal with two tags | Its links are gone; every tag remains | R47.6, R44.7 |
| DB-L-33 | A | With an entry whose body equals a meal's copied text, edit that meal's name, then delete the meal | The entry's body, `updated_at` and count are unchanged | R44.6, R45.6, R47.7 |
| DB-L-34 | postgres | Read the catalog for `meal_entries` | No foreign key from it references a library table, and it has no column naming a library meal | R47.7, K19 |

**Attribution and privileges**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-L-35 | A | Insert a meal, a tag and a link with `created_by = B`, `updated_by = B`, `created_at = '2000-01-01'` | Stored with A for both, and `created_at` close to `now()`, on all three | R19.7, R19.8, R47.8 |
| DB-L-36 | A | Update a meal, setting `created_by = B`; then setting `created_by = null` | `42501` for both | R19.5 |
| DB-L-37 | authenticated | Execute `private.add_starter_tags` and `private.handle_library_tag_name` (`function_privs_are`) | No privilege on either | R19.11 |
| DB-L-38 | postgres | Delete auth user B, who created and updated library rows. Clear the signed-in identity first; this runs last | Succeeds; B's `created_by` and `updated_by` become null on all three tables | §4.3 of the MVP design |

### 2.3 Realtime — `30_realtime.test.sql` additions (task 15.1)

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-R-14 | A | Insert, update and delete a meal; read `realtime.messages` as postgres | Three broadcasts on `household:<H1>` with table `library_meals` | R46.1, R11.2 (amended) |
| DB-R-15 | A | Upsert a new tag, then upsert the same key again (the conflict path) | Two broadcasts with table `library_tags` | R46.1 |
| DB-R-16 | A | Add a link, remove it, then delete a meal with one link | Broadcasts with table `library_meal_tags` for the insert, the delete and the cascaded delete | R46.1, §3.5 |
| DB-R-17 | C, topic `household:<H1>` | `select` the library broadcasts | Nothing | R22.2, R47.1 |
| DB-R-18 | A | C's rejected upsert (DB-L-06) and insert (DB-L-05), then read as postgres | No broadcast for either | R22.1, N7 |

### 2.4 Provisioning — `40_provisioning.test.sql` additions (task 15.1)

| ID | Action | Expected | Req |
|---|---|---|---|
| DB-P-08 | Provision a new household with two existing emails | It has exactly the seven starter tags, with `created_by` null, alongside its memberships and grocery list | R43.8, R23.2 (amended) |
| DB-P-09 | Provision where the second email doesn't exist | Exception; the count of `library_tags` is unchanged | R23.3 |

---

## 3. Unit Tests (Jest)

### 3.1 Library Domain — `constants.test.ts`, `domain.test.ts` (tasks 16.1, 16.2)

**Text, search, order and tags (task 16.1)**

| ID | Test | Req |
|---|---|---|
| U-LDOM-01 | `LIMITS` is 100, 300, 2,000 and 30; `COUNTER_FROM` is 20, 50 and 50; `STARTER_TAGS` lists the seven names in the migration's order | K21, R42.3, R43.8 |
| U-LDOM-02 | `charLength('🌮')` is 1. `clampTo` keeps 100 of 101 ASCII characters, and 2,000 of 2,001 emoji with no lone surrogate | R42.3 |
| U-LDOM-03 | `maxLengthFor('', 100)` is 100; for 99 ASCII characters it's 100; for 99 emoji (198 UTF-16 units) it's 199; for 100 characters it's the text's own length | R42.3, DD56 |
| U-LDOM-04 | `charactersLeft`: Name is `null` at 80 characters, 19 at 81 and 0 at 100; Description is `null` at 250 and 49 at 251 | R42.3 |
| U-LDOM-05 | `trimField` strips everything `trim()` strips, plus U+0085. `oneLine` turns CR, LF, CR LF, U+0085, U+2028 and U+2029 into one space each | R42.2, R42.4, meals finding 6 |
| U-LDOM-06 | `cleanTagName(' quick  &  EASY ')` is `quick & EASY`; a tab inside becomes a space. `tagKey` gives the keys finding 1 measured in Postgres: `quick & easy`, `taco night` and `éclair night` | R43.5, DD44 |
| U-LDOM-07 | `foldForSearch('Jalapeño')` is `jalapeno` and `foldForSearch('Crème Brûlée')` is `creme brulee`. With `String.prototype.normalize` deleted for the test, it lower-cases only and doesn't throw | R41.1, DD54 |
| U-LDOM-08 | `filterMeals` by search: `jala` finds "Jalapeño poppers"; `  TACO ` finds "Chicken tacos"; an empty search with no tags returns every meal | R41.1, R41.5 |
| U-LDOM-09 | `filterMeals` by tags: with Dinner and Quick & Easy selected, a meal with only Dinner is left out and one with both is kept | R41.4 |
| U-LDOM-10 | `filterMeals` with both: a meal must match the search and have every selected tag | R41.6 |
| U-LDOM-11 | `compareNames` orders "apple", "Banana", "éclair", "Eggs"; puts "Soup 2" before "Soup 10"; orders "tacos" and "Tacos" the same way every time; and orders two identical names by `id` | R40.4, K25 |
| U-LDOM-12 | `copiedText`: "Tacos" alone; "Tacos\nBeef, corn tortillas"; and a 100-character name with a 300-character description gives 401 characters, within `ENTRY_MAX` | R45.4, K20, K21 |
| U-LDOM-13 | `buildLibrary` maps rows to meals and tags, sorts both lists, orders each meal's `tagIds` by tag name, sets `searchKey`, and drops a link to an unknown tag | R40.3, R40.4, N25 |
| U-LDOM-14 | `buildLibrary` leaves out a meal with a null name, a tag with an empty name, a meal without `library_meal_tags` and a meal whose description isn't a string, naming each in `reportKeys` by table, `id` and field | R46.9, R14.8 |

**The form and save plans (task 16.2)**

| ID | Test | Req |
|---|---|---|
| U-LDOM-15 | `formValuesOf(null)` is empty; with the prefill `'  lasag '` its name is `lasag`. `formValuesOf(meal)` has the meal's fields, with `null` as `''`, and its tags as `existing` choices | R42.6, R42.7 |
| U-LDOM-16 | `addTypedTag`: "Fixture Taco Night" is `added`; " dinner " is `selected-existing`, selecting Dinner; Dinner again is `already-selected`; "FIXTURE taco night" after the first is `already-selected` with no second new tag; "   " is `empty` | R43.4–R43.6 |
| U-LDOM-17 | `isDirty` is false for unchanged values and for a tag added then removed, and true after any field or tag change | R42.12 |
| U-LDOM-18 | `validateMeal` trims every field and turns empty optional fields into `null`. "   " as the name fails on `name` with "Enter a meal name". A 101-character name fails with "Shorten this to 100 characters" | R42.4, R42.5 |
| U-LDOM-19 | `planSave(null, …)` is an `upsert` with every field and the form's `mealId`, adds every chosen tag, and removes none | R42.9, DD46 |
| U-LDOM-20 | An edit of the description only is an `update` with only `description` | R46.5 |
| U-LDOM-21 | An edit of tags only is a `check`, adding and removing just the changed tags | R46.5 |
| U-LDOM-22 | An unchanged edit gives `null` | R42.11 |
| U-LDOM-23 | New tags whose keys repeat are sent once. A typed tag matching an existing household tag never appears in `newTags` | R43.5, finding 1 |
| U-LDOM-24 | Against `base`: a tag the other member added after the form opened isn't removed, and a field the other member changed isn't sent unless this member changed it too | R46.5 |
| U-LDOM-25 | `constraintField` maps each named CHECK constraint to its field, and anything else, including `undefined`, to `null` | R42.10, DD58 |

### 3.2 Hand-offs — `handoff.test.ts` (task 16.3)

| ID | Test | Req |
|---|---|---|
| U-LHOF-01 | `set` then `read` gives the value with an `id`; a second `read` gives the same; another `set` gives a new `id` | DD51 |
| U-LHOF-02 | `clear` makes `read` return `null`. Setting `newMealName` leaves `lastSaved` and `mealPick` alone | DD51 |

### 3.3 Library API — `api.test.ts` (task 16.4)

| ID | Test | Req |
|---|---|---|
| U-LAPI-01 | `fetchLibrary` selects `MEAL_COLUMNS` from `library_meals` and `TAG_COLUMNS` from `library_tags`, each with `eq('household_id')`, `order('id')` and `range(0, 999)`. A full page asks for `range(1000, 1999)`; a short page stops. Both tables are requested before either resolves | R40.3, DD59, finding 5 |
| U-LAPI-02 | `upsertTags` sends only `household_id` and `name`, with `{ onConflict: 'household_id,name_key' }`, and selects `TAG_COLUMNS` | DD45 |
| U-LAPI-03 | `upsertMeal` sends exactly `id`, `household_id`, `name`, `description` and `ingredients`, with `{ onConflict: 'id' }` | DD46 |
| U-LAPI-04 | No request body from any function contains `created_by`, `updated_by`, `created_at`, `updated_at` or `name_key` | R19.7 |
| U-LAPI-05 | `updateMeal` sends only the changes, filters on `id`, selects `id`, and returns `'missing'` for an empty result | R46.5, R46.7 |
| U-LAPI-06 | `addTagLinks` sends `{ onConflict: 'meal_id,tag_id', ignoreDuplicates: true }`. `removeTagLinks` filters `eq('meal_id')` and `in('tag_id')` | R47.5 |
| U-LAPI-07 | `deleteMeal` filters on `id`, and resolves when it deletes 0 rows | R44.5 |
| U-LAPI-08 | `runSavePlan` calls tags, then the meal, then added links, then removed links, and skips any empty step | DD46 |
| U-LAPI-09 | A failure in any step stops the run; later steps aren't called | R46.4 |
| U-LAPI-10 | `'missing'` from `updateMeal`, and `false` from `mealExists`, throw `ApiError('not_found')`. A returned `name_key` that matches no requested tag throws `ApiError('server')` with operation `tag_key_mismatch` | R46.7, §3.3 |
| U-LAPI-11 | Every failure throws an `ApiError` with the table and operation. A CHECK error whose `message` and `details` contain `Lasagna` leaves no `Lasagna` in the error's message or meta | R26.4 (amended) |

### 3.4 Library Query and Mutations — `hooks.test.tsx` (task 16.5)

These run with a real `QueryClient`, a mocked `api.ts` and a controllable `onlineManager`.

| ID | Test | Req |
|---|---|---|
| U-LMUT-01 | Offline, a save returns `{ ok: false, reason: 'offline' }` and a delete returns the same, and neither calls `api.ts` | R46.3, K24 |
| U-LMUT-02 | A `network` failure during a save returns `offline` after one call; it isn't retried | R46.3 |
| U-LMUT-03 | `not_found` returns `deleted` | R46.7 |
| U-LMUT-04 | `forbidden` returns `forbidden` and is reported | R14.3, R26.1 |
| U-LMUT-05 | `validation` with constraint `library_meals_name_check` returns `invalid` with field `name`; without a constraint, field `null`. Both are reported | R42.10, DD58 |
| U-LMUT-06 | `server` returns `failed` and is reported; `network` isn't reported | R26.1, R26.2 |
| U-LMUT-07 | While a save is pending, the cached library is unchanged | R46.2 |
| U-LMUT-08 | A successful save puts the meal, with its resolved tag IDs, and any new tags into the cached library, sorted, before the returned promise resolves | R42.9, DD49 |
| U-LMUT-09 | A successful delete removes the meal from the cache before the promise resolves; a failed one leaves it | R44.3, R44.4 |
| U-LMUT-10 | Two saves share the `library:<hid>` scope: the second's first API call happens only after the first settles | DD49 |
| U-LMUT-11 | Three saves invalidate `['household', hid, 'library']` once, after the last settles | R12.6, R11.5 |
| U-LMUT-12 | `useLibrary` status is `loading`, `waiting` (paused with no data), `error` (no data) or `ready`, and `refreshFailedAt` is set when a refetch fails while data is shown | R40.8, R40.10, R13.1 |
| U-LMUT-13 | Unobserved for 10 minutes (fake timers), the library is still cached, and a new observer gets it at once with no `loading` | R45.11, DD59 |
| U-LMUT-14 | A bad row is left out and reported once (`invalid_library_row:<table>:<id>:<field>`) across re-renders and refetches | R46.9, R14.8 |
| U-LMUT-15 | Two saves with the same `mealId` and values, the first failing after its meal step, run the same plan twice: the second upserts the same `id` and adds the same links | R46.4, DD46 |

### 3.5 Library Live Updates — `realtime.test.ts` (task 16.6)

| ID | Test | Req |
|---|---|---|
| U-LRT-01 | An event on any library table, with no pending library mutation, invalidates `['household', hid, 'library']` and no grocery or meal key | R46.1 |
| U-LRT-02 | An event during a pending library mutation doesn't invalidate; the mutation's settle does | R11.5 |
| U-LRT-03 | Through the coalescer and the merged handlers, a burst on all three library tables and `meal_entries` runs the library handler once and the meals handler once | R11.4, R11.2 (amended) |

### 3.6 Shared UI and Errors (task 17.1)

| ID | Test | Req |
|---|---|---|
| U-THM-10 | `TEXT_PAIRS` includes `ink` on `accentSoft` with a minimum of 4.5; U-THM-01 measures it at 10.50 | R40.12, N13, finding 6 |
| U-ERR-13 | `23514` with the message `new row … violates check constraint "library_meals_name_check"` is `validation` with `meta.constraint` set to that name. When the message also holds row text, none of it is kept. U-ERR-06–08 still pass | R42.10, R26.4, DD58 |
| C-UI-09 | `Chip` with `tone="accent"` and `selected` is `accent` with bold `onBrand` text. Without `tone`, it's cactus as before | R40.12, DD57 |
| C-UI-10 | `Button` with `tone="accent"`: the primary variant is `accent` with bold `onBrand` text, and the secondary has bold `accent` text. Without `tone`, both are as before | R40.12, DD57 |

---

## 4. Component and Route Tests (RNTL 14)

### 4.1 Browser Components — `meal-browser.test.tsx` and siblings (task 18.1)

| ID | Test | Req |
|---|---|---|
| C-LBR-01 | `SearchField` is labelled "Search meals"; typing filters the list at once, with no Search button | R41.1 |
| C-LBR-02 | `TagFilter` starts collapsed, with no tag chips rendered | R41.3 |
| C-LBR-03 | Opening it shows every tag in alphabetical order; Done collapses it | R41.2, R43.10 |
| C-LBR-04 | Selecting Dinner and Quick & Easy shows only meals with both | R41.4 |
| C-LBR-05 | Collapsed with two selected, it shows the count and "Dinner, Quick & Easy". VoiceOver reads "Filter by tags, 2 selected", with `accessibilityState.expanded` | R41.3, N27 |
| C-LBR-06 | Clear filters appears only while there's search text or a selected tag, and empties both | R41.7 |
| C-LBR-07 | No match shows "No meals match" with Clear filters, below the search and filter. An empty library shows "No saved meals yet", the sentence and Add meal, with no search or filter | R41.8, R40.9 |
| C-LBR-08 | `MealRow` shows the name and its tag pills in order, with no `numberOfLines`. It reads "Tacos. Tags: Dinner, Quick & Easy", or "Tacos" with no tags | R40.3, R40.5, N27 |
| C-LBR-09 | A selected `TagChip` shows "✓ Dinner", is labelled "Dinner" and has `accessibilityState.selected` | R43.1, N10, N13 |
| C-LBR-10 | Given a just-saved meal, a "Just saved" row shows it above the list even when the search hides it; changing the search or tags removes the row | R42.9, R45.9, DD55 |
| C-LBR-11 | `SkeletonRows`, `LoadError` ("Couldn't load meals" with Retry) and `WaitingForConnection` render for their states | R40.8, R40.10, R13.1 |
| C-LBR-12 | Rows, the filter, Clear filters and chips are at least 44 × 44 pt, counting `hitSlop` | N11 |
| C-LBR-13 | `testID`s hold only static parts and IDs; none contains a meal name or tag name | R26.7 |
| C-LBR-14 | A new `MealBrowser` starts with an empty search and no tags | R41.9, R45.11 |

### 4.2 Meal Library Screen and the Library Tab — `meal-library.test.tsx`, `meals.test.tsx`, `routing.test.tsx` (tasks 18.2, 21.1)

| ID | Test | Req |
|---|---|---|
| C-LIB-01 | The Meals header has no Library button. The Library tab opens the Meal Library, titled "Meal Library", with the tab selected *(changed 2026-10-24)* | R40.1, R40.2 |
| C-LIB-02 | Back on the Meals tab, Meals shows the same week *(changed 2026-10-24)* | R40.2 |
| C-LIB-03 | An open slot editor saves when the Library tab opens | R32.3 |
| C-LIB-04 | With "lasag" in the search, Add meal sets `newMealName` to "lasag" and opens `/meal-form`. With an empty search, it clears `newMealName` | R40.6, R42.6 |
| C-LIB-05 | Tapping a row opens `/meal-form` with only the meal's `id` as a param | R40.7, DD51 |
| C-LIB-06 | Each state in the §3.8 table, including an error over a cached list: the list stays, and a "Couldn't load meals" toast with Retry shows at the top | R40.8–R40.10, DD60 |
| C-LIB-07 | Pull to refresh calls `refetch` | R40.11 |
| C-LIB-08 | On focus with `lastSaved` set to a save, "Meal saved" shows with the Just saved row; set to a delete, "Meal deleted" shows. A second focus doesn't repeat either | R42.9, R44.3, DD51 |
| C-LIB-09 | The library starts with an empty search and no tags, and keeps both after the form closes | R41.9 |
| C-LIB-10 | Offline, the banner shows and the cached list stays | R46.3, R13.1 |
| C-LIB-11 | Every library row ends with a chevron, has Delete behind a swipe, hidden from VoiceOver, and has a Delete accessibility action. With `onDelete` the card's edge is on the swipeable; picker rows have none of these *(added 2026-10-24)* | R40.7, R44.8, R45.10, N10 |
| C-LIB-12 | Delete, by swipe or by the VoiceOver action, asks "Delete “Tacos”?" with the plans message. Cancel deletes nothing; Delete calls `useDeleteMeal` with the meal's ID and shows "Meal deleted" *(added 2026-10-24)* | R44.2, R44.3, R44.8 |
| C-LIB-13 | A failed delete keeps the meal listed. Offline and other failures show their message with Retry, which deletes again without asking; forbidden shows no Retry *(added 2026-10-24)* | R44.4, R44.8, R46.3, K24 |
| C-LIB-14 | The search and selected tags stay while the member visits another tab *(added 2026-10-24)* | R40.2, R41.9 |
| C-RTE-06 (amended again) | Exactly four tabs, in the order Groceries, Meals, Library, Settings. The app still opens on Groceries *(2026-10-24)* | R1.5 (amended) |
| C-RTE-11 | `meal-library` is the Library tab under `(tabs)`, titled "Meal Library", with nothing pushed over the tabs; `meal-form` and `meal-picker` are registered under `(app)` with the §3.9–§3.10 options; none is reachable while signed out *(changed 2026-10-24)* | DD50, R1.2 |
| C-RTE-12 | The active Library tab is terracotta, in bold *(added 2026-10-24)* | R40.12, N13 |

### 4.3 Meal Form Components — `meal-form.test.tsx`, `tag-picker.test.tsx`, `form-error.test.tsx` (task 18.3)

| ID | Test | Req |
|---|---|---|
| C-LFM-01 | The fields are Name, Description (optional), Ingredients (optional) and Tags, in that order, with those labels | R42.2 |
| C-LFM-02 | Name is single-line. Pasting `"Two\nlines"` gives "Two lines" | R42.2 |
| C-LFM-03 | Each field's `maxLength` follows `maxLengthFor` as the text changes, and text past the limit is clamped | R42.3, DD56 |
| C-LFM-04 | Name shows no counter at 80 characters and "19 characters left" at 81; Description shows "49 characters left" at 251; a full field shows "No characters left". VoiceOver hears the counter when it appears and at zero | R42.3, N10 |
| C-LFM-05 | Save with "   " as the name shows "Enter a meal name" at Name, focuses it and announces it, and doesn't call `onSave` | R42.5 |
| C-LFM-06 | Tag chips are alphabetical, and tapping one toggles it | R43.1, R43.2, R43.10 |
| C-LFM-07 | New tag: "Fixture Taco Night" adds a selected chip and announces "Added Fixture Taco Night". " dinner " selects Dinner and announces "Selected Dinner", with no error. Empty adds nothing. The field stops at 30 characters | R43.3–R43.6 |
| C-LFM-08 | Deselecting a new tag removes its chip | R43.7 |
| C-LFM-09 | Each `FormError` row in §3.9 shows its message and its action: Retry, Save as new meal, or none. It's announced when it appears | R42.10, R46.7, R14.3 |
| C-LFM-10 | `invalid` with a field shows "This couldn't be saved. Check it and try again." at that field | R42.10, DD58 |
| C-LFM-11 | Delete meal shows only when editing, styled destructive | R44.1 |
| C-LFM-12 | Every field, Save, Cancel and Delete meal has a text label and role; touch targets are at least 44 pt | N10, N11, N26 |

### 4.4 Meal Form Screen — `meal-library.test.tsx` (task 18.4)

| ID | Test | Req |
|---|---|---|
| C-LFS-01 | A new meal is titled "New meal", with the name from `newMealName`. An edit is titled "Edit meal", with the meal's values and its tags selected | R42.1, R42.6, R42.7 |
| C-LFS-02 | The route presents as a full-screen modal, with Cancel and Save in the header | R42.1, DD50 |
| C-LFS-03 | While saving, Save shows a spinner, Save and Cancel are disabled, and a second tap doesn't call the save again | R42.8 |
| C-LFS-04 | Success sets `lastSaved` to `{ mealId, kind: 'saved' }` and goes back | R42.9 |
| C-LFS-05 | Save on an unchanged edit goes back without calling the save | R42.11 |
| C-LFS-06 | The `offline` outcome shows the offline message with Retry and keeps every value. Retry calls the save again with the same `mealId` | R42.10, R46.3, R46.4 |
| C-LFS-07 | The `deleted` outcome shows "This meal was deleted on another device" with Save as new meal, which saves with a new `mealId` and `base` null | R46.7 |
| C-LFS-08 | `invalid` with a field shows the message at that field; `forbidden` shows "You don't have access to that" without Retry; `failed` shows "Couldn't save this meal" with Retry | R42.10, R14.3 |
| C-LFS-09 | Cancel with changes asks "Discard changes?". Keep editing stays; Discard goes back. Cancel without changes goes back at once | R42.12, finding 3 |
| C-LFS-10 | Delete meal asks "Delete “Tacos”?" with the plans message. Cancel does nothing. Delete calls the delete; success sets `lastSaved` to `deleted` and goes back; failure keeps the form with "Couldn't delete this meal" and Retry | R44.2–R44.4 |
| C-LFS-11 | While editing, a change to the same meal in the cached library leaves the form's fields as they were | R42.13 |
| C-LFS-12 | An `id` that isn't in a loaded library shows "This meal isn't in the library any more" with Close | §3.9 |
| C-LFS-13 | A new meal's `mealId` is the same across a failed save and its Retry | R46.4, DD46 |

### 4.5 Slot Editor — `slot-editor.test.tsx` additions (task 19.1)

| ID | Test | Req |
|---|---|---|
| C-SLOT-16 | Without `onChooseFromLibrary`, there's no Choose button, and C-SLOT-01–15 pass unchanged | R45.13 |
| C-SLOT-17 | With it, "Choose from Meal Library" shows before Clear: bold `accent`, at least 44 pt, `testID="slot-choose"`. Tapping calls the prop | R45.1, N11, N26 |
| C-SLOT-18 | At the largest standard text size, the footer wraps and nothing is clipped | N12 |

### 4.6 Picker — `meal-library.test.tsx` (task 19.2)

| ID | Test | Req |
|---|---|---|
| C-PICK-01 | The picker presents as a page sheet titled "Choose a meal", and shows "For Thursday dinner" from `date=2026-10-22` and `mealType=dinner` | R45.2 |
| C-PICK-02 | `date=2026-02-30`, or `mealType=snack`, closes the picker and reports `picker_bad_params` once | §6 |
| C-PICK-03 | A cached library shows at once, with no skeleton; the search is empty and no tags are selected | R45.11 |
| C-PICK-04 | Tapping "Tacos" sets `mealPick` to `{ date, mealType, text: 'Tacos\nBeef, corn tortillas' }` and goes back | R45.3, R45.4 |
| C-PICK-05 | Cancel goes back without setting `mealPick` | R45.7 |
| C-PICK-06 | "+ Add new meal" sets `newMealName` from the search and opens `/meal-form` | R45.8, R42.6 |
| C-PICK-07 | Back from a save, the picker shows "Meal saved" and the Just saved row, even with a search that hides the meal; tapping that row chooses it | R45.9 |
| C-PICK-08 | The library's states show in the picker; an empty library says so and offers "+ Add new meal" | R45.12 |
| C-PICK-09 | Rows have the hint "Chooses this meal"; nothing offers edit or delete | R45.10 |
| C-PICK-10 | Search and Filter by tags narrow the list as in the library; a meal with no tags can be found and chosen | R45.2 |

### 4.7 Meals Screen — `meals.test.tsx` additions (task 19.3)

| ID | Test | Req |
|---|---|---|
| C-MEAL-15 | Choose in an open slot opens `/meal-picker` with only `date` and `mealType` as params, and the slot's draft is saved as it opens | R45.2, R45.7, R32.3, DD52 |
| C-MEAL-16 | Back with a pick for that slot calls `setMeal` with the copied text, reopens the slot's editor showing it, and announces "Thursday dinner: Tacos" | R45.3, R45.5 |
| C-MEAL-17 | A pick whose text equals the slot's sends no `setMeal`; the editor reopens | DD52 |
| C-MEAL-18 | Back without a pick reopens the slot's editor with the slot's text | R45.7 |
| C-MEAL-19 | A pick for another slot, or one whose `id` was already applied, is ignored | DD51 |
| C-MEAL-20 | When saving the chosen text fails, Meals shows "Couldn't save that meal" with Retry | R35.5 |
| C-MEAL-21 | With the library never opened, C-MEAL-01–14 pass unchanged | R45.13 |
| C-MEAL-22 | No route param pushed from Meals, the library or the picker contains a meal name, description or tag name | R26.4 (amended), DD51 |

---

## 5. CI and Static Checks

No new gates. CI-01 to CI-12 now include the new files:
- CI-04 applies the thresholds in §9.
- CI-06 applies `meal_library_init` from scratch, after `meals_init`.
- CI-07 and CI-08 check it: `db lint` and the security advisors.
- CI-09 runs §2.
- CI-10 checks that the generated types include the three tables and `name_key`.

---

## Part B — Manual Acceptance (Owner)

## 6. Manual Tests by Milestone

As in the MVP and meals plans, tick each box when it passes. If one fails, record it against the test ID and fix it before moving on.

### 6.1 M18 — One Simulator, the Library (after task 18.4)

- [ ] **MT-18-01** On Meals, go to a later week, then tap the Library tab. The Meal Library lists the seeded meals in alphabetical order with their tags, each with a chevron. The Meals tab shows the same week. *(Changed 2026-10-24.)* (R40.1–R40.4, R40.7)
- [ ] **MT-18-02** Search "jalapeno". "Jalapeño poppers" shows. Search "TACO": "Chicken tacos" shows. (R41.1)
- [ ] **MT-18-03** Open Filter by tags; all tags show. Pick Dinner and Quick & Easy, then collapse it: only "Chicken tacos" shows, and the filter shows "2" and both names. Clear filters brings everything back. (R41)
- [ ] **MT-18-04** Add meal with only the name "Toast". It's saved, "Meal saved" shows, and it's under Just saved and in its place in the list. (R42, SC1)
- [ ] **MT-18-05** Add a meal with a description, three lines of ingredients, two starter tags and a new tag "Weeknight". Then edit another meal and type "weeknight" as a new tag: the existing tag is selected, and no second one appears. (R42, R43, SC1, SC3)
- [ ] **MT-18-06** Save with an empty name: "Enter a meal name". Paste 150 characters into Name: 100 stay, and the counter shows. Type and delete around the limit in each field: no flicker, and the cursor doesn't jump (OI-23). (R42.3, R42.5)
- [ ] **MT-18-07** Edit a meal's description and tags; the library shows the change. Edit again, change something and tap Cancel: "Discard changes?" appears. Keep editing stays; Discard leaves without saving. (R42.7, R42.12, SC5)
- [ ] **MT-18-08** Delete a meal. The confirmation names it and says planned meals won't change. It's gone, and "Meal deleted" shows. (R44, SC5)
- [ ] **MT-18-09** Turn the Mac's Wi-Fi off. The banner shows, and the library still lists meals. Save a new meal: it fails at once with "You're offline…", and everything typed is still there. Turn Wi-Fi on and tap Retry: it saves. (R46.3, K24)
- [ ] **MT-18-10** Load the 300-meal library from §8.2. Scroll the whole list: it's smooth. Type a search a letter at a time: the list keeps up. (N25)
- [ ] **MT-18-11** Use the largest standard text size. Rows, tag pills, chips, the filter, the form and its counters wrap without clipping. (N12)
- [ ] **MT-18-12** VoiceOver, through the Accessibility Inspector or a device. A row reads "Tacos. Tags: Dinner, Quick & Easy". The filter reads "Filter by tags, 2 selected". Chips say "selected". Counters are announced. (N10, N27)
- [ ] **MT-18-13** Run the Accessibility Inspector's contrast audit on the library, the form and a selected chip. It finds no failures. (N13)
- [ ] **MT-18-14** In the Library tab, swipe a meal left: Delete shows inside the card's rounded edge. Tap it: the confirmation names the meal. Cancel leaves the row closed and the meal listed. Swipe again and Delete: the meal goes and "Meal deleted" shows. With the Mac's Wi-Fi off, the same delete fails with "You're offline…" and Retry, and the meal stays. In the picker, swiping a meal does nothing. *(Added 2026-10-24.)* (R44.8, R45.10)

### 6.2 M19 — One Simulator, Choosing (after task 19.3)

- [ ] **MT-19-01** Open Thursday's dinner. "Choose from Meal Library" shows beneath the field, beside Clear. (R45.1)
- [ ] **MT-19-02** Choose "Chicken tacos", which has a description. The picker closes, the slot shows the name and description on two lines, its editor is open, and the keyboard is up (OI-21). (R45.3, R45.4)
- [ ] **MT-19-03** Add " — no cheese" and tap Done. The slot saves it. Open the library: "Chicken tacos" is unchanged. (R45.5, R45.6, SC8)
- [ ] **MT-19-04** Type "Pasta" in a slot, open the picker and swipe it down. "Pasta" is there and the editor is open. (R45.7)
- [ ] **MT-19-05** In the picker, search "lasag" and tap "+ Add new meal". The form opens full screen over the picker, with "lasag" as the name. Save "Lasagna": you're back in the picker with Lasagna under Just saved. Tap it to choose it (OI-20). (R45.8, R45.9, SC9)
- [ ] **MT-19-06** In the picker, set a search and a tag, scroll, open "+ Add new meal" and Cancel. The picker's search, tag and scroll position are as they were (OI-20). (R45.9)
- [ ] **MT-19-07** Edit, then delete, the library meal you chose in MT-19-02. The planned slot doesn't change. (R44.6, R45.6, SC6)
- [ ] **MT-19-08** With Wi-Fi off, choose a meal for a slot. It shows at once with the banner, and it's saved when Wi-Fi comes back. (R46.3, R35.1)
- [ ] **MT-19-09** With VoiceOver, choose a meal. It announces "Thursday dinner: Chicken tacos". (R45.3)

### 6.3 M20 — Two Simulators Against the Local Stack (`docs/TASKS.md` ML.1)

Run `npm run two-sims`. Sign in as A on simulator 1 and as B on simulator 2.

- [ ] **MT-20-01** A adds a meal with a new tag. It appears in B's library within about 1 second, and B puts the new tag on another meal. (R46.1, N1, SC2, SC3)
- [ ] **MT-20-02** A and B each start a new meal, type the same new tag in different capitals, and save at nearly the same moment. One tag exists, on both meals, and neither shows an error. (R46.8, edge case 2)
- [ ] **MT-20-03** A changes a meal's description while B adds a tag to it. Both changes stay on both simulators. (R46.5, edge case 4)
- [ ] **MT-20-04** Both change the same meal's description and save. Both end on the later save. (R46.6)
- [ ] **MT-20-05** A opens a meal; B deletes it. A taps Save: "This meal was deleted on another device". Save as new meal brings it back on both. (R46.7, edge case 5)
- [ ] **MT-20-06** A chooses a meal for a slot. The slot shows on B's Meals. (R45.3, R35.1)
- [ ] **MT-20-07** Stop Realtime with the `docker stop` command that `two-sims.sh` prints. Add a meal on A, then start Realtime again. B refetches and shows it. (R11.3, R13.4)
- [ ] **MT-20-08** Sign in as C on simulator 2. Its library shows only Household Two's meals and tags, and A's changes never appear. (R47.1, R22.1)

### 6.4 Production — Two Phones (`docs/TASKS.md` ML.3–ML.6)

- [ ] **MT-20-09** The deploy's dry run lists only `meal_library_init`, and the post-deploy advisors step passes. Table Editor shows seven rows in `library_tags` for the household. (R28.4, R28.6, R43.8)
- [ ] **MT-20-10** `curl -s https://<ref>.supabase.co/rest/v1/library_meals -H "apikey: <publishable key>"` returns a permission error, not rows. (R19.3)
- [ ] **MT-20-11** After the over-the-air update, both phones show Library on Meals. Meals and Groceries work as before, and there's no DEV badge. (N30, SC13)
- [ ] **MT-20-12** **Search and order on a phone (OI-22, gate G15).** Add "Jalapeño poppers"; searching "jalapeno" finds it. Add "Soup 10" and "Soup 2"; Soup 2 is listed first. Delete the three meals. (R41.1, K25, finding 2)
- [ ] **MT-20-13** On phone 1, save a meal with a new tag; it shows on phone 2 within about 2 seconds, and phone 2 uses the tag on another meal. (SC1–SC3)
- [ ] **MT-20-14** Choose a meal for a slot on phone 1 and change the planned text; the library meal stays as it was. Then edit and delete that meal; the plan stays. (SC6, SC8)
- [ ] **MT-20-15** In airplane mode, saving a library meal fails at once and keeps the form; choosing a meal for a slot still works and syncs afterwards. (R46.3, SC10)
- [ ] **MT-20-16** In Sentry, no event from these tests contains a meal name, description, ingredient or tag name. (SC12, R26.4)

SC4 and SC11 (duplicate tags and cross-household isolation) are proven by CI on every change (DB-L-01–18, DB-R-17). SC7 (search and filters) is proven by U-LDOM-07–11 and C-LBR-04, and on a phone by MT-20-12.

---

## 7. BDD Scenarios

```gherkin
Feature: Plans never depend on the library
  Background:
    Given members A and B belong to Household One
    And the library has "Chicken tacos" with the description "Beef, corn tortillas"

  @C-PICK-04 @C-MEAL-16 @MT-19-02
  Scenario: Choosing a meal copies its text
    Given A is editing Thursday dinner
    When A taps "Choose from Meal Library" and chooses "Chicken tacos"
    Then Thursday dinner reads "Chicken tacos" and "Beef, corn tortillas" on two lines
    And Thursday dinner's editor is open

  @DB-L-33 @MT-19-07 @MT-20-14
  Scenario: Editing or deleting the meal leaves the plan alone
    Given Thursday dinner was filled from "Chicken tacos"
    When B renames "Chicken tacos" to "Fish tacos"
    And B then deletes it
    Then Thursday dinner still reads "Chicken tacos" and "Beef, corn tortillas"
```

```gherkin
Feature: Saving never loses or duplicates anything
  @U-LMUT-01 @C-LFS-06 @MT-18-09
  Scenario: Saving while offline
    Given A is offline with a new meal typed into the form
    When A taps Save
    Then the form says "You're offline. Try again when you're connected"
    And everything A typed is still in the form
    And nothing was sent

  @U-LAPI-09 @U-LMUT-15 @C-LFS-13 @DB-L-21
  Scenario: A save fails partway and is retried
    Given A saves a new meal with a new tag
    And the meal is stored but adding its tag link fails
    When A taps Retry
    Then exactly one meal, one tag and one link exist

  @C-LFS-07 @MT-20-05
  Scenario: Editing a meal the other member deleted
    Given A is editing "Chicken tacos"
    And B deletes "Chicken tacos"
    When A taps Save
    Then A sees "This meal was deleted on another device"
    And Save as new meal saves A's version as a new meal
```

```gherkin
Feature: Tags stay unique in the household
  @DB-L-12 @DB-L-13 @U-LDOM-16 @MT-20-02
  Scenario: Both members create the same tag at once
    When A creates the tag "Taco Night" on one meal
    And B creates the tag "taco  NIGHT" on another at about the same moment
    Then Household One has one tag "Taco Night"
    And both meals have it
    And neither member sees an error
```

```gherkin
Feature: The library stays in the household
  @DB-L-02 @DB-L-06 @DB-L-29 @DB-R-17 @MT-20-08
  Scenario: A member of another household
    Given C belongs to Household Two
    When C reads library meals, upserts a Household One meal, links its tag to a Household One meal, or listens on Household One's channel
    Then C receives no Household One meals, tags or events
    And each of C's writes fails
```

---

## 8. Test Data and Mocking

### 8.1 Database Fixtures

The MVP and meals fixtures apply. Task 15.2 adds the seed library in design §4.6, and provisioning gives both seeded households the starter tags. `60_meal_library.test.sql` inserts its own `Fixture ` rows, with the triggers off where it needs backdated or directly attributed rows, and rolls back. DB-L-33's entry uses a date in the week of 2030-01-07, as the meals tests do.

### 8.2 Manual-test Data

For MT-18-10, run this in the local Studio SQL editor (local only). It adds 300 meals to Household One, each with five of the starter tags (N25):

```sql
with m as (
  insert into public.library_meals (household_id, name, description)
  select h.id, 'Test meal ' || lpad(g::text, 3, '0'), 'A description for test meal ' || g
  from public.households h cross join generate_series(1, 300) g
  where h.name = 'Household One'
  returning id, household_id
)
insert into public.library_meal_tags (household_id, meal_id, tag_id)
select m.household_id, m.id, t.id
from m cross join lateral (
  select id from public.library_tags t
  where t.household_id = m.household_id and t.created_by is null
  order by t.name_key limit 5
) t;
```

Remove them afterwards with `delete from public.library_meals where name like 'Test meal %';`. Their links go with them.

### 8.3 Jest Fixtures and Factories

| Fixture | Location | Used by |
|---|---|---|
| `makeLibraryMeal`, `makeLibraryTag`, `makeMealRow` and `makeTagRow` | `src/test/factories.ts` (task 16.1) | Domain, hooks and component tests |
| `makePostgrestError(code, …)` (existing) | `src/test/factories.ts` | U-LAPI-11, U-LMUT-03–06 and U-ERR-13. A CHECK error's `message` names the constraint, and its `details` contain `Lasagna` |
| The finding 1 tag-key table | Inline in `domain.test.ts` | U-LDOM-06 |
| A library with "Chicken tacos" (Dinner, Quick & Easy), "Beef stew" (Dinner), "Jalapeño poppers" (no tags) and "Soup 2" and "Soup 10" | A `testLibrary()` helper in `meal-library.test.tsx` | C-LBR-*, C-LIB-*, C-PICK-* |

### 8.4 Mock Strategy

The MVP and meals strategies apply. These are added:

| Dependency | Mocked in | Approach |
|---|---|---|
| `src/features/meal-library/hooks.ts` | C-LIB-*, C-LFS-*, C-PICK-* | `jest.mock` with a controllable library, and spies for save and delete returning chosen outcomes |
| `src/features/meal-library/handoff.ts` | Never | The real module, cleared in `beforeEach`. Tests read it to check what a screen set |
| `src/features/meals/hooks.ts` | C-MEAL-15–22 | As for C-MEAL-*: the existing mock, with a `setMeal` spy |
| `String.prototype.normalize` | U-LDOM-07 only | Deleted and restored around the one case |
| `Alert.alert` | C-LFS-09, C-LFS-10 | `jest.spyOn`, pressing the chosen button from the spy |
| `expo-crypto` `randomUUID` | C-LFS-07, C-LFS-13 | A deterministic sequence |

`domain.ts`, `handoff.ts` and the coalescer are never mocked.

---

## 9. Coverage Goals

`jest.config.js` enforces these (task 16.5 adds the hooks file). CI-04 fails below them.

| Scope | Lines | Branches |
|---|---|---|
| The 95/90 group. `src/features/meal-library/domain.ts` is already matched by `src/features/*/domain.ts` | 95 % | 90 % |
| The 90/85 group, plus `src/features/meal-library/hooks.ts`. `src/features/meal-library/api.ts` is already matched by `src/features/*/api.ts` | 90 % | 85 % |
| Everything else in `src/`, including the library components, `handoff.ts` and `realtime.ts` | 75 % | 70 % |

**Beyond line coverage:**

- Every acceptance criterion in R40–R47 that can be tested automatically has a test ID in §10; the rest have an `MT-*` ID.
- The library tables have their own behavioural pgTAP file (`60_meal_library.test.sql`), as SPEC Appendix B requires.

---

## 10. Requirements → Tests Matrix

| Requirement | Automated | Manual |
|---|---|---|
| R40 Library screen | U-LDOM-11, U-LDOM-13, U-LAPI-01, U-LMUT-12, U-THM-10, C-UI-09–10, C-LBR-07–08, C-LBR-11, C-LIB-01–07, C-LIB-10–11, C-LIB-14, C-RTE-06, C-RTE-12 | MT-18-01, MT-18-13 |
| R41 Search and filter by tags | U-LDOM-07–10, C-LBR-01–07, C-LBR-14, C-LIB-09, C-LIB-14 | MT-18-02, MT-18-03, MT-20-12 |
| R42 Add or edit a meal | U-LDOM-01–05, U-LDOM-15, U-LDOM-17–19, U-LDOM-22, U-LDOM-25, U-LMUT-05, U-LMUT-08, U-ERR-13, C-LIB-04, C-LIB-08, C-LFM-01–05, C-LFM-09–10, C-LFS-01–06, C-LFS-08–09, C-LFS-11 | MT-18-04–07, MT-18-09 |
| R43 Tags | DB-L-10–18, DB-P-08, U-LDOM-06, U-LDOM-16, U-LDOM-23, C-LBR-03, C-LBR-09, C-LFM-06–08 | MT-18-05, MT-20-01, MT-20-02 |
| R44 Delete a meal | DB-L-25, DB-L-32–33, U-LAPI-07, U-LMUT-09, C-LIB-08, C-LIB-11–13, C-LFM-11, C-LFS-10 | MT-18-08, MT-18-14, MT-19-07 |
| R45 Choose from the Meal Library | DB-L-33, U-LDOM-12, U-LMUT-13, C-LBR-10, C-SLOT-16–18, C-PICK-01–10, C-MEAL-15–21 | MT-19-01–09, MT-20-06, MT-20-14 |
| R46 Library sync, conflicts and offline | DB-L-13, DB-L-19–21, DB-L-24, DB-R-14–16, U-LDOM-14, U-LDOM-20–21, U-LDOM-24, U-LAPI-05, U-LAPI-08–10, U-LMUT-01–03, U-LMUT-07, U-LMUT-10–11, U-LMUT-14–15, U-LRT-01–03, C-LFS-06–07, C-LFS-13 | MT-18-09, MT-19-08, MT-20-01–07, MT-20-15 |
| R47 Library data integrity | DB-S-06, DB-L-01–38, DB-R-17–18, U-LAPI-02–04, U-LAPI-06 | MT-20-08–10 |
| Glossary and R11.2 (amended) | DB-R-14–16, U-LRT-03 | MT-20-01 |
| R13.2, R14.1 (amended) | U-LMUT-01–02, C-LFS-06 | MT-18-09, MT-20-15 |
| R23.2 (amended) | DB-P-08–09, DB-L-10–11 | MT-20-09 |
| R26.4 (amended) | U-LAPI-11, U-ERR-13, C-LBR-13, C-MEAL-22 | MT-20-16 |
| Meals N24 and Out of Scope (amended) | C-SLOT-16, C-MEAL-21, C-LIB-01 | MT-20-11 |
| N25 Performance | U-LDOM-13 (`searchKey`) | MT-18-10 |
| N26, N27 Labels and VoiceOver | C-LBR-05, C-LBR-08–09, C-LFM-12, C-SLOT-17 | MT-18-12, MT-19-09 |
| N28 Pure rules | U-LDOM-01–25 | — |
| N29 One form, one browser | C-PICK-10, C-LFS-01 | MT-19-05 |
| N30 Additive | DB-S-06 and DB-S-14–15 (no new structural cases), U-LRT-01 (grocery and meal keys untouched), C-MEAL-21 | MT-20-11, owner review in ML.2 |
| N31 Plain-text ingredients | DB-L-23, U-LAPI-03 | MT-18-05 |

---

## 11. Risk-Based Prioritization

If time runs short, keep the tests in this order. The top of the list must never be skipped.

1. **Isolation** (DB-S-06, DB-L-01–09, DB-L-28–29, DB-R-17–18). A mistake here exposes the household's library.
2. **Plans never depend on the library** (DB-L-33–34, C-MEAL-15–20, MT-19-07). A mistake here changes or loses what the household planned.
3. **Saving correctness** (U-LDOM-19–24, U-LAPI-08–10, U-LMUT-01–09, U-LMUT-15, C-LFS-03–08, C-LFS-13, MT-20-05). A mistake here loses what someone typed or duplicates a meal.
4. **Tag uniqueness** (DB-L-12–15, U-LDOM-06, U-LDOM-16, U-LDOM-23, MT-20-02).
5. **Privacy** (U-LAPI-11, U-ERR-13, C-MEAL-22, MT-20-16).
6. **Validation** (DB-L-16, DB-L-22–23, U-LDOM-02–05, C-LFM-02–05).
7. **Screens, accessibility and identity** (C-LBR-*, C-LIB-*, C-LFM-*, C-PICK-*, MT-18-*, MT-19-*).

---

## 12. Amendments to Earlier Test Plans

These are written into the earlier plans when this plan is approved, marked *(Amended for the meal library.)*

| Plan | Item | Change |
|---|---|---|
| [`specs/mvp/4-test-plan.md`](../mvp/4-test-plan.md) | DB-S-06 | The expected set adds `library_meals` {SELECT, INSERT, UPDATE, DELETE}, `library_tags` {SELECT, INSERT, UPDATE} and `library_meal_tags` {SELECT, INSERT, DELETE} |
| MVP | §10, R23 row | Adds DB-P-08 and DB-P-09 |
| MVP | §10, N10–N14 row | Adds C-UI-09 and C-UI-10 |
| [`specs/meals/4-test-plan.md`](../meals/4-test-plan.md) | §10, R32 and N24 rows | R32 adds C-MEAL-15 (opening the picker saves the draft). N24 adds C-SLOT-16 and C-MEAL-21 |

Test planning also adds two cases to task 15.1 in [3-tasks.md](./3-tasks.md), written there as *(added during test planning)*: DB-L-33 (deleting a meal leaves an entry with its copied text unchanged) and DB-R-18 (a rejected write broadcasts nothing).

---

## 13. Out of Scope for This Test Plan

- Automated end-to-end UI tests, as in the MVP.
- Truly simultaneous database sessions in pgTAP. MT-20-02 checks the tag race between phones; DB-L-13 and DB-L-14 check the upsert semantics it relies on.
- Testing the PostgREST request shapes inside CI. Task 16.4's one-off check closes OI-24; U-LAPI-* pin what the app sends, and DB-L-* pin what the database does with it.
- Hermes `Intl` beyond search folding and collation. MT-20-12 covers both on a phone.
- Everything under Out of Scope (Meal Library) in 1-requirements.
