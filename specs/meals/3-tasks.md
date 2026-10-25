# Kitchin Meal Planning — Implementation Tasks

> **Phase 3 of 4** in the EARS spec-driven process: 1-requirements → 2-design → **3-tasks** → 4-test-plan.
> **Status:** Draft for owner review, 2026-10-19. Implements [2-design.md](./2-design.md) and [1-requirements.md](./1-requirements.md), both approved 2026-10-19. Implementation waits until the owner approves this document and [4-test-plan.md](./4-test-plan.md), which cites every task by number.
> **Amended during test planning:** G10 marked done; task 11.1 adds `trimEntry` and the meal factories (design finding 6, OI-18).
> **Amended at the owner's request, 2026-10-25:** section 22 and gate G16 added for the start of the week (Requirement 48, design §11). **Approved by the owner, 2026-10-25**, with the matching additions to 1-requirements, 2-design and 4-test-plan.

The tasks are ordered by dependency. Numbering continues from [`specs/mvp/3-tasks.md`](../mvp/3-tasks.md): sections start at **9** and owner gates at **G10**, so "task 9.1" means one thing anywhere in the project. Each task fits in one focused session. Tests are written with the code, or before it where a task is marked **TDD**. A task is done when its tests pass locally and the CI `app` and `database` checks pass (CLAUDE.md, Commands).

Work happens on `main` in the shared working tree. Agents don't commit; the owner reviews and commits.

This list contains only coding work. Owner steps are in [`docs/TASKS.md` → Phase 2](../../docs/TASKS.md#phase-2-meal-planning): the two-device checks, the phone time-zone check, the production deploy and the TestFlight build. Its 🤖 lines mirror these tasks under the same numbers, so tick both when a task is done.

**References:**

- `R32.3` is acceptance criterion 32.3 and `N21` a non-functional requirement, in [1-requirements.md](./1-requirements.md). R1–R29 and N1–N20 are in [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md).
- `§3.5`, `DD25`, `OI-15` and "finding 1" are a section, a design decision, an open item and a research finding in [2-design.md](./2-design.md).

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
| G10 | MVP task 4.8 (the add-item sheet) ticked in `specs/mvp/3-tasks.md`. **Done**: ticked by 2026-10-19 | 12.4, which opens that sheet from Meals |
| G11 | `docs/TASKS.md` P2.5: the time-zone check on a physical iPhone (OI-15) | Phase 2 sign-off. If it fails, the fallback in OI-15 becomes a new task |
| G12 | `docs/TASKS.md` P2.3: the production deploy of `meals_init` | The first TestFlight build with Meals (P2.4) |
| G16 | `docs/TASKS.md` WS.3: the production deploy of `household_week_start` *(added 2026-10-25)* | The over-the-air update with section 22 (WS.4) |

**Timing.** `docs/TASKS.md` suggests using the MVP for a couple of weeks before starting Phase 2, and requirements Assumption 1 expects it to be in daily use. Sections 9–13 work only against the local stack, so the owner decides when they start. Nothing reaches production before G12.

**Shared local stack.** Several agents use one local Supabase stack. Before running `npx supabase db reset`, make sure nobody is signed in: run it only if `select count(*) from auth.sessions` returns 0, or ask the owner. To check SQL without a reset, run it in a transaction and roll it back.

---

## 9. Meal database (M9)

- [x] **9.1 Write the meal database tests first** · M
  - Add the `meal_entries` grants to the expected-grants table in `00_structure.test.sql`: select, insert, update and delete. The existing structural checks then cover the new table and its slot function without new cases: RLS, `household_id`, the audit and broadcast triggers, no `public` functions, and the definer `search_path` rule.
  - `50_meal_entries.test.sql`:
    - **Isolation:**
      - A reads H1's entries only.
      - C's insert and upsert into H1 fail with `42501`.
      - C's updates and deletes of H1 entries affect 0 rows.
      - anon can't read or write.
    - **One entry per slot:**
      - A upserts a slot, then B upserts the same slot, in PostgREST's merge-duplicates shape (finding 1). One row remains, with B's text, `created_by` A and `updated_by` B.
      - A plain second insert fails with `23505` on `meal_entries_one_per_slot`.
      - The same date and meal type in H2 is a separate row.
    - **Validation:**
      - These fail with `23514`: an empty body; leading or trailing whitespace (a space, a tab, a newline or a no-break space, OI-18); 501 characters; an unknown meal type.
      - 500 emoji and an inner line break succeed.
    - **Slot:** changing `meal_date` or `meal_type` fails with `42501`. The upsert's repeated key values pass.
    - **Attribution:**
      - Spoofed `created_by` and `updated_by` values are overwritten.
      - A can't set `created_by` to null (`42501`).
      - Deleting an auth user nulls both. Clear the test's signed-in identity first, as `20_grocery_items.test.sql` does.
    - **Clearing:** a delete by slot key that matches no row succeeds.
  - `30_realtime.test.sql`: an insert, an upsert that updates and a delete on `meal_entries` as A each broadcast on H1's topic with table `meal_entries`. C can't read them.
  - The new cases fail until 9.2 lands.
  - _Requirements: R19 and R22 through R38.1, R32.8, R33.3, R35.4, R38.2–R38.6_ — _Design: §4.1–§4.4, §7, §8, finding 1_

- [x] **9.2 Write the migration `meals_init`** · S
  - Create it with `npx supabase migration new meals_init`. Per §4.1–§4.3, it holds:
    - the table and `meal_entries_one_per_slot`
    - `private.handle_meal_entry_slot()`, with execute revoked
    - the triggers `10_audit`, `20_slot` and `90_broadcast`
    - grants, RLS and the four policies
  - Add the §4.5 entries to `supabase/seed/10_seed_data.sql`, using dates relative to `date_trunc('week', current_date)`.
  - Regenerate `src/types/database.ts`.
  - Done when 9.1 passes and the structural tests stay green, `supabase db lint --local --schema public,private --fail-on error` is clean, and `supabase db advisors --local --type security --fail-on warn` is clean.
  - _Requirements: R38.2–R38.7, N24_ — _Design: §4, §5, DD23, DD24_

## 10. Calendar (M10)

- [x] **10.1 Write the calendar module (TDD)** · M
  - Write the tests first in `src/lib/calendar.test.ts`:
    - `todayIn` at fixed instants either side of midnight in `America/Chicago`, `Pacific/Auckland`, `Asia/Kolkata` and `Pacific/Chatham`
    - the US DST weeks of 2026-03-08 and 2026-11-01, and a Southern Hemisphere DST change
    - `weekStartOf` for each weekday, including Sunday; `weekDates` across a month end and across 2026-12-28 → 2027-01-03; `addDays` over 2028-02-29
    - `parseIsoDate` rejecting malformed and impossible dates
    - `isValidTimeZone` accepting IANA names and rejecting unknown ones
    - a formatter output that doesn't match the strict pattern throws `CalendarFormatError`
    - `formatWeekRange` adding the year for a week outside today's year
  - Implement `src/lib/calendar.ts` per §3.1:
    - UTC day numbers only
    - a cached `en-US` formatter per zone
    - the strict `MM/DD/YYYY` parse
    - display formatting with `timeZone: 'UTC'` and the device locale
    - no `formatToParts` or `formatRange`
  - **Lint** (`eslint.config.js`):
    - Ban the local `Date` getters and setters across `src/` with `no-restricted-properties`: `getDate`, `getDay`, `getMonth`, `getFullYear`, `getHours`, `getMinutes`, `getSeconds`, `getMilliseconds`, `getTimezoneOffset` and their setters. The message should cite DD30.
    - Add `src/lib/calendar.ts` to the purity rule that `domain.ts` files follow.
    - Add a firing case and a passing case for each rule to `eslint-rules.test.ts`.
    - No existing code uses these methods (checked 2026-10-19).
  - In `jest.config.js`, put `src/lib/calendar.ts` in the 95/90 coverage group.
  - _Requirements: R30.1, R30.7, R30.12, R34.1, R34.2, R34.4, N23_ — _Design: §3.1, DD30, DD31, finding 2_

- [x] **10.2 Write `useHouseholdToday` (TDD)** · S
  - Write the tests first, with fake timers:
    - today follows the household's zone, not the device's
    - the value changes once at midnight in that zone, and not on the other 60-second ticks
    - it recomputes when the app returns to the foreground
    - an invalid household zone falls back to the device zone and calls `reportOnce('household_time_zone_invalid')` once, with no zone name
    - a `CalendarFormatError` falls back to the local date and reports `calendar_format_unexpected` once
  - Implement `src/features/household/use-household-today.ts` per §3.2. The local-date fallback is the only place in `src/` that suppresses the 10.1 lint rule, with a comment explaining why.
  - _Requirements: R34.1, R34.3, R34.5, R26.3_ — _Design: §3.2_

## 11. Meals data layer (M11)

- [x] **11.1 Write the meal constants and domain rules (TDD)** · M
  - Write `src/features/meals/constants.ts` per §3.3.1, taking the labels, order and day accents from the legacy `MEAL_TYPES` and `DAYS`.
  - Write the tests first, then `domain.ts` per §3.3.2:
    - `buildWeek`: seven days, Monday first, slots in meal-type order, planned counts, and entries outside the week ignored
    - `parseEntryRow`: an unknown meal type or a missing field is invalid, naming the field
    - `charLength`, `clampEntry` and `charactersLeft` with emoji and a pasted 600-character text
    - `trimEntry`: everything `trim()` strips, plus U+0085 (design finding 6) *(added during test planning)*
    - `slotChange`, every branch: trimming, unchanged against `base` (DD27), clear, empty to empty, and save
  - Add `makeEntryRow` and `makeMealEntry` to `src/test/factories.ts` for the hook and component tests.
  - _Requirements: R30.1–R30.5, R32.4, R32.5, R32.7, R33.1, R35.7, R36.2, R36.3, N23_ — _Design: §3.3.1, §3.3.2, DD27_

- [x] **11.2 Write the meals API layer** · S
  - Needs 9.2's generated types.
  - Write `src/features/meals/api.ts` per §3.3.3, with every failure wrapped by `toApiError`.
  - Tests with a stub client:
    - the upsert sends exactly `household_id`, `meal_date`, `meal_type` and `body`, with `onConflict: 'household_id,meal_date,meal_type'`, and never `id`, attribution or timestamps
    - the delete filters on all three key columns, and a delete of 0 rows succeeds
    - `fetchWeek` filters on household and the date range
    - raw PostgREST text never appears on a thrown error
  - _Requirements: R32.3, R33.1, R33.3, R38.5, R26.4_ — _Design: §3.3.3, DD24, finding 1_

- [x] **11.3 Write the week query and the save mutation (TDD)** · L
  - Write the tests first, with a real `QueryClient` and a mocked `api.ts`:
    - a save or clear shows immediately, including the placeholder row for an empty slot
    - a failure undoes the slot only if it still shows that save; a later save to the same slot survives
    - Retry resends the member's text
    - `forbidden` shows its toast without Retry
    - saves run in order in the `meals:<hid>` scope, pause while `onlineManager` is offline, and resume in order
    - only the last mutation to settle invalidates `meals`
    - a ready week prefetches the weeks either side
    - weeks stay cached (`gcTime: Infinity`)
    - an invalid row is left out and reported once
    - the status values and `refreshFailedAt` behave as they do for groceries
  - Implement `src/features/meals/hooks.ts` per §3.3.4, written separately from the grocery factory so no grocery code changes (N24).
  - In `jest.config.js`, put `src/features/meals/hooks.ts` in the 90/85 coverage group.
  - _Requirements: R30.9–R30.11, R31.5, R32.6, R33.1, R35.1, R35.3, R35.5, R35.7, N5_ — _Design: §3.3.4, DD29, DD34_

- [x] **11.4 Handle meal events** · S
  - Write `src/features/meals/realtime.ts` per §3.3.5, and merge `mealTableHandlers` into `TABLE_HANDLERS` in `src/app/(app)/_layout.tsx`.
  - Tests:
    - an event during a pending meal mutation doesn't invalidate
    - otherwise it invalidates `meals` and leaves the grocery queries alone
    - a burst that touches grocery and meal tables runs each handler once
  - _Requirements: R11.2 (amended), R11.4, R11.5, R35.1, R35.6_ — _Design: §3.3.5_

## 12. Meals screen (M12)

- [x] **12.1 Add the theme pairs and the week components** · M
  - In `src/ui/theme.ts`, add `ICON_PAIRS` and the two `TEXT_PAIRS` rows per §3.7. Extend `theme.test.ts` to measure them.
  - Build these components per §3.3.6 and §3.4: `MealTypeIcon`, `DayCard`, `SlotRow`, `WeekHeader`, `SkeletonWeek` and `WeekStates`.
  - Component tests:
    - slots appear in meal-type order
    - long text wraps rather than truncating
    - an empty slot shows its placeholder
    - the planned count reads "2 of 3 meals planned"
    - the Today pill shows
    - the day header and slot accessibility labels, including "not planned"
    - the Clear action exists only on planned slots
    - the `WeekHeader` buttons and labels, with This week shown only away from the current week
    - `testID`s are static
  - All five SF Symbols date from SF Symbols 1 (iOS 13). Check each name in the SF Symbols app or the Simulator to close OI-19.
    - *Checked 2026-10-19 against the iOS 26.1 Simulator's `name_availability.plist`. All five names exist. `sun.max.fill`, `moon.fill` and `cart.badge.plus` date from iOS 13, but `cup.and.saucer.fill` and `fork.knife` date from iOS 15 (SF Symbols 3). Both are still below the iOS 16.4 deployment target, so no fallback is needed. The week arrows, `chevron.left` and `chevron.right`, date from iOS 13. MT-12-17 still checks that they render.*
  - _Requirements: R30.2–R30.7, R33.2, R36.1–R36.5, N10, N11, N13_ — _Design: §3.3.6, §3.4, §3.7, DD32, OI-19_

- [x] **12.2 Build the slot editor** · M
  - Build `SlotEditor` per §3.5.
  - Component tests, one or more for each row of the §3.5 table:
    - Return, blur and unmount each call `setMeal` with the right variables
    - moving to `inactive` or `background` saves and keeps the editor open, and a second commit sends nothing
    - Clear sends `body: null` and closes the editor
    - unchanged text sends nothing, including when the slot's entry changed while the editor was open (DD27)
    - a new `entry` prop while editing leaves the field's text alone (R35.2)
    - a pasted 600-character text is clamped to 500 code points
    - the counter appears below 50 characters left and at zero
    - the field's accessibility label
  - In the Simulator, type and paste at the limit, and check that clamping doesn't flicker or move the cursor (OI-16).
  - _Requirements: R32.1–R32.5, R32.7, R33.2, R35.2, N21_ — _Design: §3.5, DD25–DD27, OI-16_

- [x] **12.3 Build the Meals screen and tab** · M
  - Write `src/app/(app)/(tabs)/meals.tsx` per §3.4:
    - its own `ToastProvider placement="top"` (DD35)
    - `weekStart` and `editing` state
    - the `ScrollView` settings
    - scroll to today on first show and on This week
    - `useFocusEffect` closing the editor when the tab loses focus
    - the states table
    - pull to refresh
    - the refresh-failed toast
  - Update `src/app/(app)/(tabs)/_layout.tsx` per §3.6: tabs in the order Groceries, Meals, Settings. Meals has the `fork.knife` icon, the terracotta active tint (DD36) and `ReconnectingPill` in `headerRight`.
  - Route tests in `src/__tests__/meals.test.tsx`, with mocked hooks:
    - seven days in order, with their dates
    - the Today marker and the planned counts
    - Previous, Next and This week change the week, and This week shows only away from the current week
    - every state in the §3.4 table
    - pull to refresh calls `refetch`
    - switching tab while a slot is open saves it
  - Update `src/__tests__/routing.test.tsx`: three tabs in order, and the app still opens on Groceries.
  - In the Simulator, at the largest standard text size:
    - today scrolls into view (OI-17)
    - a week whose 21 slots each hold 500 characters scrolls smoothly (N22)
  - _Requirements: R1.5 (amended), R30, R31, R34.3, R35.2, R35.5, R35.6, R36.1, N12, N14, N22_ — _Design: §3.4, §3.6, DD29, DD35, DD36, OI-17_

- [x] **12.4 Add the Add to groceries shortcut** · S
  - Needs gate G10.
  - Add `AddToGroceriesButton` to the Meals `headerRight`, calling `router.push('/add-item')`.
  - Route tests:
    - tapping it opens the add-item sheet over Meals
    - closing the sheet returns to the same week
    - an open slot editor saves when the sheet opens
    - nothing from meal text reaches the sheet
  - _Requirements: R37.1–R37.4_ — _Design: §3.6, DD33_

## 13. Phase 2 sign-off (M13)

- [x] **13.1 Bring the docs up to date** · S
  - In `CLAUDE.md`, name `specs/meals/` alongside `specs/mvp/` as authoritative for its feature. Leave the owner's Status line alone unless the owner asks.
  - Record how OI-15–OI-19 were resolved in `specs/meals/2-design.md` §10, the way the MVP design records its open items.
  - Check that every task here and its 🤖 line in `docs/TASKS.md` are ticked, and list any that weren't done.
    - *Checked 2026-10-19. Tasks 9.1–12.4 are ticked in both files, and every file, rule and test they list exists. The CI `app` and `database` checks pass locally. Two parts had not been done: the Simulator check in 12.2 (OI-16) and the Simulator checks in 12.3 (OI-17 and N22). Both were run the same day. 12.3's checks passed (MT-12-12, MT-12-13), so OI-17 is resolved. 12.2's check failed (MT-12-08): typing in a full slot flickers and moves the cursor. OI-16's fallback becomes a new task once the owner settles its emoji trade-off with R32.5. OI-15 waits for gate G11, and OI-18 and OI-19 are resolved. The §8.2 long-text data in the test plan now fills 500 characters, as N22 specifies, instead of 498.*
  - _Requirements: none directly; it keeps the spec and the code in step_ — _Design: §10_

## 22. Start of the week (owner request, 2026-10-25)

Implements [Requirement 48](./1-requirements.md#requirement-48-settings--start-of-the-week) and [design §11](./2-design.md#11-start-of-the-week). Numbered after the meal library's section 21. Test IDs are in [4-test-plan.md §14](./4-test-plan.md#14-start-of-the-week).

- [x] **22.1 Write the start-of-the-week database tests, then the migration** · M
  - Tests first:
    - `10_households.test.sql`: DB-H-19–DB-H-23. Run them before DB-H-12 renames Household One, or look it up by id.
    - `30_realtime.test.sql`: DB-R-19 and DB-R-20.
    - The new cases fail until the migration lands. The existing structural checks cover the new definer function (`search_path`, revoked execute) without new cases.
  - Create the migration with `npx supabase migration new household_week_start`. Per §11.1, it holds the `week_start` column and its check, `private.broadcast_household_row_change()` with execute revoked, and the `households_90_broadcast` trigger.
  - Regenerate `src/types/database.ts`.
  - Done when the new cases pass, the structural tests stay green, and `supabase db lint --local --schema public,private --fail-on error` and `supabase db advisors --local --type security --fail-on warn` are clean.
  - _Requirements: R48.2, R48.3, R48.5, R48.6, R48.12, R20.4 and R20.5 (amended)_ — _Design: §11.1, DD62, DD63_

- [x] **22.2 Make the calendar take the start day (TDD)** · S
  - Write U-CAL-17–U-CAL-21 first in `src/lib/calendar.test.ts`, and change U-CAL-04 to pass Monday (`0`).
  - In `src/lib/calendar.ts`, add `Weekday`, give `weekStartOf` a required `start`, and add `reanchorWeek`, per §11.2.
  - Pass `0` at the existing call sites for now, so the app behaves as before until 22.4.
  - _Requirements: R48.4, R48.7, R34.4, N23 (amended)_ — _Design: §11.2, DD66, DD67_

- [x] **22.3 Read, change and follow the household's start day (TDD)** · M
  - Needs 22.1's types and 22.2's `Weekday`.
  - Write `src/features/household/week-start.ts` and its tests (U-WKS-01, U-WKS-02).
  - In `api.ts`, add `week_start` to the membership select and write `updateWeekStart` (U-HH-07–U-HH-09). Pass `weekStart` through `household-provider.tsx` (U-HH-10).
  - Write `use-week-start.ts` per §11.3, with its tests first (U-WKS-03–U-WKS-09).
  - Write the household's `realtime.ts` (U-WKS-10, U-WKS-11), and merge `householdTableHandlers` into `TABLE_HANDLERS` in `src/app/(app)/_layout.tsx`.
  - Update `src/test/mock-backend.ts` and `src/test/factories.ts`.
  - In `jest.config.js`, put `week-start.ts` in the 95/90 group and `use-week-start.ts` in the 90/85 group.
  - _Requirements: R48.2–R48.5, R48.10, R48.11, R11.2 (amended), R26.3_ — _Design: §11.3, §11.6, DD63, DD65_

- [x] **22.4 Lay Meals out from the household's start day** · M
  - Needs 22.2 and 22.3.
  - Per §11.4:
    - `MealsWeek` reads `useWeekStart()`, keeps `start` beside `weekStart`, and re-anchors with `reanchorWeek` once no slot is open
    - `WeekHeader` takes `start`
    - `useSetMeal` takes `start`
  - Tests: C-WEEK-16, C-WEEK-17, C-MEAL-23–C-MEAL-28 and U-MMUT-17.
  - _Requirements: R30.1 (amended), R31.2, R31.3, R48.4, R48.6–R48.9, R35.2_ — _Design: §11.4, DD66, DD67_

- [x] **22.5 Add Week starts on to Settings** · M
  - Needs 22.3.
  - Per §11.5, add the Settings row and footnote. Write `src/app/(app)/week-start.tsx` and add it to the (app) stack.
  - Tests: C-SET-06 and C-SET-07 in `settings.test.tsx`, and C-WKS-01–C-WKS-06 in `src/__tests__/week-start.test.tsx`.
  - _Requirements: R48.1, R48.4, R48.5, R48.10, R15.1 (amended), N10–N12_ — _Design: §11.5, DD64_

- [x] **22.6 Bring the docs up to date** · S
  - Write the MVP amendments (11.2, 13.2, 14.1, 15.1, 20.4, 20.5) into `specs/mvp/1-requirements.md`, and 4-test-plan §12's additions into `specs/mvp/4-test-plan.md`, marked *(Amended for the start of the week.)*
  - Change the amendment's "Draft for owner review" status lines in this spec's four files to the date the owner approved it.
  - Check that 22.1–22.5 and their 🤖 lines in `docs/TASKS.md` are ticked, and list any that weren't done.
  - _Requirements: none directly; it keeps the spec and the code in step_ — _Design: §11_

---

## Requirements coverage matrix

| Requirement | Tasks |
|---|---|
| R30 Week view | 10.1, 11.1, 11.3, 12.1, 12.3 |
| R31 Moving between weeks | 11.3, 12.1, 12.3 |
| R32 Plan or change a meal | 9.1, 11.1, 11.2, 11.3, 12.2 |
| R33 Clear a meal | 9.1, 11.1, 11.2, 11.3, 12.1, 12.2 |
| R34 Household calendar | 10.1, 10.2, 12.3 |
| R35 Sync, conflicts and offline | 9.1, 11.3, 11.4, 12.2, 12.3; the two-device checks are owner step P2.1 |
| R36 Visual identity | 11.1, 12.1, 12.3 |
| R37 Add groceries while planning | 12.4 |
| R38 Meal data integrity | 9.1, 9.2, 11.2 |
| MVP amendments: R1.5, R11.2, R26.4 | 12.3, 11.4, 11.2 and 10.2 |
| N21–N22 Performance | 12.2, 12.3 |
| N23 Date rules | 10.1, 11.1 |
| N24 Additive | 9.2, 11.3; design §1.5 lists every existing file that changes, and §11.7 those the start of the week changes |
| R48 Start of the week *(added 2026-10-25)* | 22.1–22.5; the two-device checks are owner steps WS.1 and WS.5 |
| MVP amendments for R48: R11.2, R13.2, R14.1, R15.1, R20.4, R20.5 | 22.3, 22.3, 22.3, 22.5, 22.1, 22.1; written into the MVP spec by 22.6 |

## Parallelization opportunities

- **Three tracks can start at once:**
  - the database (9.1 → 9.2)
  - the calendar (10.1 → 10.2)
  - 11.1, once 10.1 has defined `IsoDate`
- **The data layer:** 11.2 needs 9.2's types and 11.1. 11.3 needs 11.2. 11.4 needs 11.3's `mealKeys`.
- **The screen:** 12.1 and 12.2 need only 11.1, so they can run alongside 11.2–11.4. 12.3 needs 10.2, 11.3, 11.4, 12.1 and 12.2. 12.4 needs 12.3 and gate G10.
- **Files shared between tracks:** `jest.config.js` (10.1, 11.3), `eslint.config.js` (10.1) and `src/app/(app)/_layout.tsx` (11.4). Edit only the lines a task owns, because agents share one working tree.
- **13.1** comes last.
- **Section 22:** 22.1 and 22.2 can start at once. 22.3 needs both. 22.4 and 22.5 need 22.3 and can run side by side. 22.3 and 22.5 both edit `src/app/(app)/_layout.tsx`, so each edits only the lines it owns. 22.6 comes last.
