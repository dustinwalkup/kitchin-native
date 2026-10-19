# Kitchin Meal Library — Requirements Document

> **Phase 1 of 4** in the EARS spec-driven process: **1-requirements** → 2-design → 3-tasks → 4-test-plan.
> **Status:** Approved by the owner, 2026-10-19, including decisions K18–K27. Written from the owner's [brief](./brief.md), the meals spec and the code as built.
> **Amendment proposed during design** (approved together with `2-design.md`): 45.7 changed. See [2-design.md §1.4](./2-design.md#14-requirement-amendments).

## Introduction

The Meal Library is the household's shared collection of meals they make often. Either member can save a meal with just a name, or add a description, free-text ingredients and tags. Both phones see the same library, and members find meals by searching their names and filtering by tags.

The library feeds the planner in one direction only. While a member is editing a slot in Meals, a "Choose from Meal Library" button opens the saved meals. Choosing one copies its name and description into the slot, where the member can change it like any typed text. The slot keeps no link to the meal, so editing or deleting the meal later never changes a plan.

The library also prepares for generating grocery lists later. Ingredients get their own field now, as plain text, so that a later release can turn them into structured ingredients. This release doesn't parse them or create grocery items from them.

**Relationship to the other specs.** This document adds to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md) and [`specs/meals/1-requirements.md`](../meals/1-requirements.md) and doesn't replace either. Every MVP and meals requirement still applies, notably sync (11–14), data protection (18–22), delivery (24–29), the slot editor (32–35) and N1–N24. Where a library requirement depends on one, it cites it. Numbering continues from [`specs/app-deploy/spec.md`](../app-deploy/spec.md), the last document to add a requirement (R39): requirements start at **40**, non-functional requirements at **N25** and decisions at **K18**. Design will start at **DD43** and tasks at **15**. The changes this feature makes to earlier requirements are listed in [Amendments to Earlier Requirements](#amendments-to-earlier-requirements).

### Glossary

These terms add to the [MVP glossary](../mvp/1-requirements.md#glossary) and the [meals glossary](../meals/1-requirements.md#glossary).

| Term | Meaning |
|---|---|
| **Meal Library** | The household's saved meals, and the screen that lists them. |
| **Meal** | In this document, a saved meal in the Meal Library: a name, with an optional description, ingredients and tags. A meal is a template. Planning copies its text into an entry and keeps no link to it (K19). |
| **Tag** | A label such as "Dinner" or "Quick & Easy" that members put on meals. Tags belong to the household, not to one meal. |
| **Starter tags** | The seven tags every household begins with (43.8). Once created, they're ordinary tags. |
| **Custom tag** | A tag a member creates from the meal form. |
| **Tag link** | The record that a meal has a tag. A meal can have any number of tags, and a tag can be on any number of meals. |
| **Normalized tag name** | A tag name with leading and trailing whitespace removed and each run of whitespace inside it reduced to one space, compared case-insensitively. " quick  &  EASY" and "Quick & Easy" have the same normalized name. |
| **Meal form** | The one full-screen form for adding and editing a meal ([Requirement 42](#requirement-42-meal-library--add-or-edit-a-meal)). |
| **Picker** | The screen that opens from a slot's editor for choosing a meal ([Requirement 45](#requirement-45-meals--choose-from-the-meal-library)). |
| **Copied text** | The text that choosing a meal puts into a slot (K20). |

### Scope

**In scope:**

- A Meal Library screen, separate from the planner and opened from Meals. It lists saved meals with their tags in alphabetical order, with loading, empty, no-results and error states.
- Search by name, and a compact Filter by tags control that shows only meals having every selected tag. Search and tags combine.
- One full-screen form for adding and editing a meal: a required name, and an optional description, ingredients and tags.
- Tags as household records: seven starter tags, custom tags created from the form, and no duplicates within a household.
- Deleting a meal after confirmation, without changing any plan.
- A "Choose from Meal Library" button in the slot editor. It opens a picker with search, the tag filter and "+ Add new meal", and copies the chosen meal's name and description into the slot.
- The same household sharing, isolation and live updates as groceries and meals, enforced by the database and proven by automated tests.

**Out of scope:** see [Out of Scope (Meal Library)](#out-of-scope-meal-library). The main exclusions are generating grocery lists, structured ingredients, recipes, nutrition and servings, sorting and filtering beyond name search and tags, a tag-management screen, and any link from a planned entry back to a meal.

### Key Decisions

The requirements below depend on these decisions. Each is a recommendation drawn from the brief, the meals spec and the code as built. **Approving this document approves these decisions.** Technical choices, such as the table layout, routes and how a save is written, are settled in `2-design.md`.

| # | Decision | Assumed here | Source |
|---|---|---|---|
| K18 | Where the library lives | A separate screen, opened from a Library button with a text label in the Meals header, with Back to Meals. Not a fourth tab: Chores and Notes are each expected to add a tab (`docs/TASKS.md`), and a sixth tab would push one behind iOS's "More" | Brief §1, §8; K16 |
| K19 | Copy, don't link | Choosing a meal copies its text into the slot. The entry stores no reference to the meal, so editing or deleting the meal never changes a plan, and editing the entry never changes the meal | Brief §6 |
| K20 | Copied text | The meal's name, then, if it has a description, a line break and the description. Ingredients and tags aren't copied | Brief §6; R32.2 |
| K21 | Field limits | Name: 1–100 characters, one line. Description: up to 300. Ingredients: up to 2,000. Tag name: 1–30 characters, one line. A full name and description, 401 characters with the line break, always fit a slot's 500 (K12), so choosing a meal never cuts its text | Brief §2; K12 |
| K22 | Tags | Household records, starting with seven starter tags. No two tags in a household share a normalized name. A custom tag is created when the meal that uses it is saved. Members can't rename or delete tags in the app | Brief §2, §7, §9 |
| K23 | Search and filter | Search matches meal names only, ignoring case and accents. Selected tags combine with AND: a meal must have every one. Search and tags combine with AND too | Brief §5 |
| K24 | Saving library changes | A save or delete takes effect when the backend confirms it, not before. The form stays open until then, and a failure keeps everything the member entered. Library changes need a connection and aren't held offline: the library is used while planning, not in the shop, and a held save that failed later couldn't give the member back what they typed | Brief §2, §4, §8 |
| K25 | Order | Meals in alphabetical order of name, and tags in alphabetical order, both following the device's language. No other sorting | Brief §1, §9 |
| K26 | Duplicate meal names | Allowed. Two meals may share a name, and alphabetical order puts them side by side | Brief silent |
| K27 | The picker | The library's list, search and tag filter, plus "+ Add new meal". It only chooses meals; editing and deleting stay in the library | Brief §6 |

---

## Requirements

| Area | Requirements |
|---|---|
| Meal Library | 40 Library screen · 41 Search and filter by tags · 42 Add or edit a meal · 43 Tags · 44 Delete a meal |
| Meals | 45 Choose from the Meal Library |
| Sync | 46 Library sync, conflicts and offline |
| Data protection | 47 Library data integrity |

### Requirement 40: Meal Library — Library Screen

**User Story:** As a member, I want one place for the meals we make often, so that we can find and reuse them when we plan.

#### Acceptance Criteria

1. The Meals screen SHALL offer a button with a visible text label, such as "Library", that opens the Meal Library (K18). Its VoiceOver label SHALL be "Meal Library".
2. WHEN the member uses it THEN the app SHALL show the Meal Library as its own full screen, titled "Meal Library", with a Back control. WHEN the member goes back THEN the app SHALL show Meals at the week and scroll position they left.
3. The Meal Library SHALL list the household's meals. Each SHALL show its name and its tags. A meal with no tags SHALL show only its name.
4. Meals SHALL be listed in alphabetical order of name, and each meal's tags in alphabetical order (K25).
5. Long names SHALL wrap rather than be truncated, and tags that don't fit on one line SHALL continue on the next (N12).
6. The screen SHALL offer an Add meal action that's visible without scrolling, whether or not the library has meals.
7. WHEN the member taps a meal THEN the app SHALL open it in the meal form ([Requirement 42](#requirement-42-meal-library--add-or-edit-a-meal)).
8. WHILE the library loads for the first time in a session, the app SHALL show placeholder (skeleton) rows, not a blank screen or a full-screen spinner.
9. IF the household has no meals THEN the app SHALL show "No saved meals yet", a sentence saying what the library is for, and Add meal.
10. IF loading the library fails THEN the app SHALL show "Couldn't load meals" with Retry, and SHALL keep showing the meals it loaded earlier, if any.
11. WHEN the member pulls down on the list THEN the app SHALL reload it from the backend.
12. The Meal Library, the meal form and the picker SHALL use the Meals look: terracotta (`accent`) for primary actions, with white text on terracotta always bold (36.1, N13), and rounded white cards on the sand background, with colours taken only from theme tokens (16.2, 16.7).

### Requirement 41: Meal Library — Search and Filter by Tags

**User Story:** As a member, I want to narrow the library by name and by tags, so that I can find a quick dinner in a few taps.

#### Acceptance Criteria

1. The Meal Library SHALL offer a search field labelled "Search meals". WHEN the member types in it THEN the list SHALL show only meals whose name contains the search text, updating as they type, with no Search button. Matching SHALL ignore case, accents, and leading and trailing whitespace in the search text (K23).
2. The Meal Library SHALL offer one "Filter by tags" control. WHEN the member opens it THEN the app SHALL list every household tag and SHALL let the member select or deselect any number of them.
3. The screen SHALL NOT show the full list of tags until the member opens the filter. WHILE tags are selected, the control SHALL show how many, and the screen SHALL show which.
4. WHILE one or more tags are selected, the list SHALL show only meals that have every selected tag.
5. WHILE no tags are selected, the list SHALL show every meal that matches the search, or every meal if the search is empty.
6. WHILE the search field holds text and tags are selected, the list SHALL show only meals that match the search and have every selected tag.
7. WHILE the search field holds text or any tag is selected, the screen SHALL offer Clear filters. WHEN the member uses it THEN the app SHALL empty the search field and deselect every tag.
8. IF no meals match the search and tags THEN the app SHALL show "No meals match" with Clear filters. This state SHALL look different from the empty library (40.9), so that the member can tell meals exist.
9. The Meal Library SHALL open with an empty search and no tags selected. Returning to it from the meal form SHALL keep the search and the selected tags.

### Requirement 42: Meal Library — Add or Edit a Meal

**User Story:** As a member, I want to save a meal with as much or as little detail as I like, so that adding one takes seconds but it can still hold what we need.

#### Acceptance Criteria

1. Adding and editing SHALL use the same full-screen form, the meal form, titled "New meal" or "Edit meal", with Cancel and Save.
2. The meal form SHALL have these fields, in this order:
   - **Name:** required, one line, up to 100 characters. Line breaks in pasted text SHALL become spaces.
   - **Description:** optional, multi-line, up to 300 characters.
   - **Ingredients:** optional, multi-line free text, up to 2,000 characters. The app SHALL store it as the member typed it, apart from trimming (42.4), and SHALL NOT interpret it.
   - **Tags:** optional, any number ([Requirement 43](#requirement-43-meal-library--tags)).
3. The app SHALL stop accepting text once a field reaches its limit, keeping the first characters of pasted text. It SHALL show the number of characters left once fewer than 20 remain in Name, or fewer than 50 in Description or Ingredients. Characters SHALL be counted as in 32.5.
4. The app SHALL trim leading and trailing whitespace from every field before saving. A description or ingredients that's empty after trimming SHALL be saved as none.
5. IF the member saves while the trimmed name is empty THEN the app SHALL NOT save, SHALL show "Enter a meal name" at the Name field, and SHALL move focus to that field.
6. WHEN the member adds a meal while the search field holds text, in the library or the picker, THEN the form SHALL start with that text, trimmed, as the name.
7. WHEN the member opens a meal to edit THEN the form SHALL show its current name, description and ingredients, with its tags selected.
8. WHILE a save is in progress, Save SHALL show that it's saving and SHALL NOT start a second save (K24).
9. WHEN a save succeeds THEN the app SHALL close the form, return to the screen it was opened from with the saved meal shown there, and show "Meal saved".
10. IF a save fails THEN the form SHALL stay open with everything the member entered, and the app SHALL say why, with Retry: at the field concerned if the database rejected a value (14.4), "You're offline. Try again when you're connected" if the device is offline (46.3), and a brief message otherwise (14.5).
11. IF the member saves an edited meal without having changed anything THEN the app SHALL close the form without sending a write.
12. WHEN the member cancels, or swipes the form away, with unsaved changes THEN the app SHALL ask "Discard changes?", with Discard and Keep editing. Without unsaved changes, the form SHALL close at once.
13. WHILE the form is open, changes to the same meal from the other phone SHALL NOT replace what the form shows (as 35.2).

### Requirement 43: Meal Library — Tags

**User Story:** As a member, I want to tag meals our own way, so that we can group and filter them the way we think about them.

#### Acceptance Criteria

1. The meal form SHALL show every household tag as a chip. A selected chip SHALL be marked by more than colour, such as a checkmark (N13), and VoiceOver SHALL read each chip's name and whether it's selected (N10).
2. WHEN the member taps a chip THEN the app SHALL select or deselect it. A meal MAY have any number of tags, including none.
3. The meal form SHALL offer New tag, which lets the member type a tag name of up to 30 characters on one line.
4. WHEN the member adds a new tag THEN the app SHALL show it among the chips, selected.
5. IF the new tag's normalized name matches that of an existing tag, or of a tag already added in this form, THEN the app SHALL select that tag instead of adding another, and SHALL NOT show an error.
6. IF the new tag's name is empty after trimming THEN the app SHALL add nothing.
7. A new tag SHALL be created when the meal is saved. IF the member discards the form THEN the tag SHALL NOT be created.
8. Every household SHALL have these starter tags: Quick & Easy, Family Favorite, High Protein, Breakfast, Lunch, Dinner and Meal Prep. Households that exist when the library ships SHALL get them too, without any step by a member or the owner.
9. Starter tags and custom tags SHALL behave the same. Once created, every tag SHALL be available to both members on every meal and in the filter.
10. Chips in the meal form and in the filter SHALL be in alphabetical order (K25).
11. The app SHALL NOT offer renaming, merging or deleting tags (K22).

### Requirement 44: Meal Library — Delete a Meal

**User Story:** As a member, I want to remove meals we no longer make, so that the library stays useful.

#### Acceptance Criteria

1. WHILE editing a meal, the meal form SHALL offer Delete meal, styled as destructive and placed apart from Save.
2. WHEN the member taps Delete meal THEN the app SHALL ask for confirmation: "Delete “<name>”?", saying that meals already planned won't change, with Delete and Cancel.
3. WHEN the member confirms and the backend confirms the deletion THEN the app SHALL close the form, return to the Meal Library without the meal, and show "Meal deleted".
4. IF the deletion fails THEN the meal SHALL stay in the library, the form SHALL stay open with what the member entered, and the app SHALL show a message with Retry. The app SHALL NOT show a meal as deleted until the backend confirms it (K24).
5. IF the other member has already deleted the meal THEN the app SHALL treat the deletion as successful and SHALL NOT show an error (as 33.3).
6. Deleting a meal SHALL NOT change any entry, including entries whose text was copied from it (K19).
7. Deleting a meal SHALL remove its tag links, and SHALL NOT delete any tag.

### Requirement 45: Meals — Choose from the Meal Library

**User Story:** As a member, I want to fill a slot from our saved meals, so that planning a week takes a few taps rather than a lot of typing.

#### Acceptance Criteria

1. WHILE a slot's editor is open (32.1), the app SHALL show a "Choose from Meal Library" button beneath the field, alongside Clear (33.2).
2. WHEN the member taps it THEN the app SHALL open the picker over Meals, naming the slot, for example "Thursday dinner". The picker SHALL list meals as the library does (40.3–40.5), with search and Filter by tags ([Requirement 41](#requirement-41-meal-library--search-and-filter-by-tags), K27). Tags SHALL never be needed to find or choose a meal.
3. WHEN the member chooses a meal THEN the app SHALL close the picker and return to the same week and slot, with the slot's editor open and its text replaced by the copied text. VoiceOver SHALL announce the change.
4. The copied text SHALL be the meal's name, followed, if the meal has a description, by a line break and the description (K20). Ingredients and tags SHALL NOT be copied.
5. The member SHALL be able to change the copied text like any typed text. Saving SHALL follow 32.3–32.8.
6. The entry SHALL be independent of the meal. Editing or deleting the meal SHALL NOT change the entry, and editing the entry SHALL NOT change the meal (K19).
7. WHEN the member closes the picker without choosing THEN the app SHALL return to the slot as it was when the picker opened, with its editor open. Text typed before the picker opened SHALL be kept; it's saved when the picker opens, as when the member moves to another slot (32.3). *(Changed during design: it said the text stays unsaved. Opening any screen over Meals closes the slot's editor, which saves it.)*
8. The picker SHALL offer "+ Add new meal". WHEN the member uses it THEN the app SHALL open the meal form ([Requirement 42](#requirement-42-meal-library--add-or-edit-a-meal)), starting from the picker's search text (42.6).
9. WHEN a meal is saved from the picker THEN the app SHALL return to the picker and show the new meal where the member can choose it straight away, even if it doesn't match the current search or tags. WHEN the member cancels the form THEN the app SHALL return to the picker unchanged.
10. The picker SHALL NOT offer editing or deleting meals.
11. The picker SHALL open with an empty search and no tags selected. IF the library has already loaded in this session THEN the picker SHALL show its meals immediately and refresh them in the background.
12. The picker SHALL have the library's loading, error and no-results states (40.8, 40.10, 41.8). IF the library is empty THEN the picker SHALL say so and offer "+ Add new meal". Closing the picker from any state SHALL leave the slot as in 45.7.
13. Typing a slot's text by hand SHALL work exactly as before ([Requirement 32](../meals/1-requirements.md#requirement-32-meals--plan-or-change-a-meal)).

### Requirement 46: Sync — Library Sync, Conflicts and Offline

**User Story:** As a member, I want library changes to reach the other phone and settle cleanly, so that we're always choosing from the same meals.

#### Acceptance Criteria

1. Live updates (R11) SHALL cover adding, editing and deleting meals and creating tags. The other phone's Meal Library and picker SHALL show the change within 2 seconds (11.1), and 11.3, 11.4 and 11.6 SHALL apply.
2. A library save or delete SHALL change what the app shows only once the backend confirms it (K24). 12.1 and 12.2 SHALL NOT apply to library changes. A failure keeps the form open instead (42.10, 44.4).
3. WHILE the device is offline, the Meal Library and the picker SHALL keep showing the last-loaded meals with the offline banner (13.1), and members SHALL still be able to choose meals for slots, which are held like any slot change (35.1). IF a member saves or deletes a meal while offline THEN the app SHALL fail it at once with "You're offline. Try again when you're connected", and SHALL NOT hold or retry it automatically (amends 13.2 and 14.1).
4. Retrying a save SHALL never create a duplicate meal, tag or tag link, including when an earlier attempt reached the backend but its reply was lost (N5). IF a save fails partway THEN Retry SHALL complete it.
5. The app SHALL send only what the member changed: the fields they edited, and the tags they added or removed. Two members editing different fields, or different tags, of one meal SHALL NOT overwrite each other (as 12.4).
6. IF both members change the same field of a meal at about the same time THEN the last save SHALL win, and both phones SHALL end up showing the same meal (as K15).
7. IF a member saves changes to a meal that the other member has deleted THEN the app SHALL say "This meal was deleted on another device", keep the form's contents, and offer Save as new meal.
8. IF both members create tags with the same normalized name at about the same time THEN exactly one tag SHALL exist afterwards, both meals SHALL have it, and neither member SHALL see an error.
9. IF the backend returns a meal or tag that breaks the app's expectations THEN the app SHALL leave it out of the display and report it once (14.8).

### Requirement 47: Data Protection — Library Data Integrity

**User Story:** As a member, I want the library to stay private and consistent, so that it holds only our meals and never two copies of a tag.

#### Acceptance Criteria

1. Meals, tags and tag links SHALL be household data. Requirements 19 (isolation) and 22 (realtime authorization) SHALL apply to them, and the CI isolation tests (27.6) SHALL cover them.
2. The database SHALL reject a meal if any of these hold:
   - its name is empty, is longer than 100 characters, has leading or trailing whitespace, or contains a line break
   - its description or ingredients are present but empty, or have leading or trailing whitespace
   - its description is longer than 300 characters, or its ingredients longer than 2,000
3. The database SHALL reject a tag whose name is empty, is longer than 30 characters, has leading or trailing whitespace, or contains a line break.
4. The database SHALL allow at most one tag per normalized tag name in each household, however the request is made.
5. The database SHALL allow at most one tag link per meal and tag, and SHALL reject a tag link between a meal and a tag in different households (19.6).
6. Deleting a meal SHALL delete its tag links and nothing else. Deleting a tag SHALL delete its tag links and no meal.
7. Entries SHALL NOT reference meals. No change to the library SHALL create, change or delete an entry (K19).
8. The system SHALL record who created each meal, who last changed it and when, and who created each tag and when, from the authenticated identity and the server clock (19.7, 19.8).
9. Ingredients SHALL be stored in their own field, never combined with the description.

---

## Amendments to Earlier Requirements

Approving this document approves these changes. They were written into those files on 2026-10-19, when this feature's design was approved, marked *(Amended for the meal library.)*, as the meals amendments were. Design DD47 confirmed the 23.2 change.

| Item | Change |
|---|---|
| MVP glossary, "Household data" | Now includes library meals, tags and tag links |
| MVP 11.2 | Live updates also cover adding, editing and deleting meals and creating tags (46.1) |
| MVP 13.2, 14.1 | Except library saves and deletes, which fail at once while offline and aren't held or retried automatically (46.3, K24) |
| MVP 26.4 | The household content that reports must never contain adds "meal library names, descriptions and ingredients, and tag names" |
| MVP 23.2 | Only if design chooses to change provisioning for the starter tags (Open Item 4): provisioning also creates them |
| Meals Out of Scope, "Saved, favourite, pinned or template meals" | Saved meals move into scope under this document. Favourites, pinned meals and suggestions drawn from past entries stay out |
| Meals Out of Scope, "Recipes: ingredients, …" | Free-text ingredients on library meals move into scope. The rest of that line stays out |
| Meals N24 | The meals feature gains the Library button in its header and the Choose from Meal Library button in the slot editor (N30) |

---

## Non-Functional Requirements

N1–N24 apply to the Meal Library unchanged. These add to them.

### Performance

- **N25.** The Meal Library and the picker SHALL scroll smoothly on the members' iPhones with 300 meals of five tags each. The list SHALL update within 100 ms of each keystroke in the search field and each tag selected.

### Usability & Accessibility

- **N26.** Every action in the Meal Library, the meal form and the picker SHALL have a visible text label. An icon MAY accompany a label but SHALL NOT replace it.
- **N27.** VoiceOver SHALL read each meal in a list as its name followed by its tags, and the Filter by tags control SHALL say how many tags are selected. N10–N14 apply.

### Maintainability & Extensibility

- **N28.** Search matching, tag filtering, ordering, tag normalization, duplicate-tag detection, building the copied text and field validation SHALL be pure functions with unit tests (N17).
- **N29.** The meal form SHALL be one component, used for adding and editing from both the library and the picker. The picker SHALL reuse the library's list, search and filter.
- **N30.** The library SHALL be additive (N16, N24): new tables, a new feature module and new screens. The only changes to existing features SHALL be the Library button in the Meals header, the Choose from Meal Library button in the slot editor, and whatever the starter tags need at provisioning (Open Item 4). No grocery code, and no core table or policy, SHALL change.
- **N31.** Ingredients SHALL stay plain text that the app neither parses nor rewrites, so that a later release can turn them into structured ingredients, or generate grocery lists from them, with an additive change.

---

## Assumptions

1. Meal planning (R30–R38) is in daily use on both phones. Its slot editor (meals DD25–DD27) is where the Choose from Meal Library button goes.
2. The library holds tens to a few hundred meals and a few dozen tags, so the app can load all of it at once and search and filter on the phone.
3. A mistyped custom tag stays until the owner deletes it in the dashboard. With two members this should be rare (K22).
4. The library adds no native package, so it can ship as an over-the-air update (R39) once its migration is deployed (39.9).
5. Both members install the update within a few days of each other.
6. Members will probably write ingredients one per line, but nothing depends on it.

## Constraints

1. Every MVP and meals constraint applies, including no custom server and no Edge Functions.
2. The new tables must work alongside the build and update installed at the time, which have no library (R28.5).
3. The structural database tests forbid functions in `public` (meals DD24). A design that needs one, for example to save a meal and its tags in one call, must say so and change that test deliberately (Open Item 3).

## Edge Cases

1. **Both members add a meal with the same name.** Two meals exist, listed side by side (K26).
2. **Both members create the same custom tag at once.** One tag exists, and both meals have it (46.8).
3. **A member types " quick & EASY" as a new tag.** The form selects the existing Quick & Easy (43.5).
4. **Both members edit one meal.** Changes to different fields or tags both survive. The same field ends with the last save (46.5, 46.6).
5. **A member saves changes to a meal the other member has just deleted.** They're told, keep what they entered, and can save it as a new meal (46.7).
6. **A member deletes or renames a meal that's planned this week.** The planned entries don't change (44.6, 45.6).
7. **A member chooses a meal for a slot that already has text.** The copied text replaces it in the editor. The earlier text isn't kept; this is accepted, because the member chose to replace it.
8. **A member types in a slot, opens the picker, then closes it.** Their typing is still there (45.7).
9. **The app goes to the background with the picker open.** The slot's text is saved as in 32.3, and the picker is still open when the member comes back.
10. **The other member saves the same slot while the picker is open.** The chosen meal is the last save and wins (K15).
11. **A member chooses a meal that the other member deleted moments ago but that's still on screen.** Its text is copied as shown, without an error (45.6).
12. **A member adds a meal from the picker while a search or tags would hide it.** The new meal is shown anyway, ready to choose (45.9).
13. **A save fails partway**, for example the meal saved but a tag link didn't. The form stays open, and Retry completes the save without duplicates (46.4).
14. **The device is offline.** Members can browse the last-loaded library and choose meals for slots. Saving or deleting a meal fails at once and keeps the form (46.3).
15. **The library is empty when the picker opens.** The picker says so and offers "+ Add new meal" (45.12).
16. **A member filters by a tag that no meal has.** The library shows "No meals match" with Clear filters (41.8).
17. **A member chooses a meal with a 100-character name and a 300-character description.** The copied text is 401 characters and fits the slot uncut (K21).
18. **Pasted text is longer than a field's limit.** The field keeps the first characters up to the limit, and the database rejects anything longer (42.3, 47.2).
19. **One phone runs a build or update without the library.** That member sees no Library or Choose from Meal Library button until they update. Entries filled from the library are ordinary entries and show on both phones (Constraint 2).
20. **The household's last meal is deleted.** The library shows its empty state (40.9).

## Out of Scope (Meal Library)

These are deferred and SHALL NOT appear in this feature's design, tasks or implementation:

- Generating grocery lists, with or without AI, and creating grocery items from ingredients. Add to groceries (R37) is unchanged.
- Inferring ingredients from a meal's name or description.
- Structured ingredients: separate ingredient records, quantities and units.
- Nutrition and calories, serving sizes, recipe instructions, prep time, photos, and recipe links or imports.
- Sorting other than alphabetical, searching descriptions, ingredients or tags, OR filters, and saved filters.
- A tag-management screen: renaming, merging, deleting, colouring or reordering tags.
- A link from an entry back to the meal it came from, and updating entries when a meal changes (K19).
- Saving a slot's text to the library from the planner. This is the first candidate for a later iteration.
- Favourites, ratings, "last planned" dates, and suggesting meals by meal type or from past weeks.
- Warnings about duplicate meal names (K26), and duplicating a meal.
- Holding library changes while offline (K24).
- Sharing meals outside the household.

## Success Criteria

1. A member can save a meal with only a name, and another with a description, ingredients and several tags.
2. A meal saved on one phone appears in the other phone's library within about 2 seconds, and either member can edit or delete it.
3. A member can create a custom tag, and either member can then use it on another meal.
4. CI proves that the database allows no duplicate tag within a household, including names that differ only in case or whitespace.
5. A member can edit a meal and its tags, and can delete a meal after confirming.
6. Editing or deleting a meal leaves every planned entry unchanged.
7. Searching by name, filtering by several tags, and both together show the expected meals. Unit tests cover the matching rules.
8. A member can fill breakfast, lunch or dinner from the library and change the copied text, and the saved meal stays as it was.
9. A member can add a meal from the picker and choose it straight away.
10. A failed save keeps everything the member entered, and the empty and no-results states explain themselves.
11. CI proves that an account in another household can't read, change or receive events for meals, tags or tag links.
12. Error reports never contain meal names, descriptions, ingredients or tag names.
13. Typing in slots, and every other meals and groceries behaviour, works as before.

## Differences from the Brief

| Topic | Brief | This document |
|---|---|---|
| Where the library opens | §1: a dedicated screen, separate from the planner | A Library button in the Meals header opens it. It isn't a new tab (K18) |
| Copied text | §6: the name and description | The name, then a line break and the description. Nothing else is copied (K20) |
| Field limits | Not given | Name 100, description 300, ingredients 2,000, tag 30 (K21) |
| Duplicate tags | §7: differences of case or surrounding whitespace | Also runs of whitespace inside the name (glossary) |
| When a custom tag is created | Not given | When the meal is saved. Discarding the form discards the tag (43.7) |
| Saving and offline | §2: keep what was entered if saving fails | Saves wait for the backend and need a connection (K24) |
| Clear filters | §5: a clear-filters action | Also empties the search (41.7) |
| The picker | §6: shows saved meals | Also has search and Filter by tags (K27) |
| Delete | §4: a delete action | In the meal form, while editing (44.1) |
| Duplicate meal names | Not given | Allowed (K26) |
| Additions | — | The name starts from the search text (42.6). Save as new meal when the meal was deleted meanwhile (46.7). "Discard changes?" on cancel (42.12) |
| Implementation instructions | §11: inspect, migrate, test and report | Carried into 2-design, 3-tasks and 4-test-plan |

## Open Items for Design Phase

1. Navigation: where the library, the meal form and the picker sit among the routes, how the meal form opens from the picker sheet and returns to it (45.8, 45.9), and how swiping a form away asks to discard (42.12).
2. How the slot editor survives the picker. It closes and saves on blur today (meals DD25, DD26), so design must keep the slot open across the picker, restore it on close (45.7) and replace its draft on choose (45.3).
3. How a save writes a meal, its new tags and its tag links: one call, which needs a function in `public` and a deliberate change to the structural test (Constraint 3), or ordered writes with phone-generated IDs that Retry can repeat safely (46.4). This includes the tag race (46.8) and Save as new meal (46.7).
4. How households get the starter tags (43.8): a migration that adds them to existing households, plus either a change to `provision_household`, a core function that would amend R23.2 and need an exception to N16, or a trigger on new households.
5. Table names and layout, avoiding confusion with `meal_entries`, and how the normalized tag name is stored and kept unique (47.4).
6. Accent-insensitive search and locale-aware ordering on Hermes: whether `String.prototype.normalize`, `localeCompare` and `Intl.Collator` behave as they do on the web (41.1, K25), checked the way meals DD30 checked dates.
7. What Filter by tags looks like, for example a sheet of chips or a row that expands, and how the selected tags are summarized (41.2, 41.3).
8. Where toasts go on the library, the meal form and the picker, which may cover the root's toasts or sit under the keyboard (meals DD35).
9. How the picker shows a just-added meal despite the search and tags, for example by clearing them and scrolling to it (45.9).
10. Query keys, a cache shared by the library and the picker (45.11), and realtime handlers for the new tables (46.1).
