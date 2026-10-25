# Kitchin Meal Planning — Test Plan

> **Phase 4 of 4** in the EARS spec-driven process: 1-requirements → 2-design → 3-tasks → **4-test-plan**.
> **Status:** Draft for owner review, 2026-10-19, to be approved together with [3-tasks.md](./3-tasks.md). Requirements and design were approved 2026-10-19.
> **Amended at the owner's request, 2026-10-25:** [§14](#14-start-of-the-week) added for the start of the week (Requirement 48, tasks 22.1–22.5), with rows in §10 and §12. **Approved by the owner, 2026-10-25.**

## 1. Requirements Traceability

This plan verifies meal planning from the database up to the two phones. These are the behaviours it has to prove, in order of risk:

1. **Meals stay inside the household.** No account outside it can read, write, upsert into or receive events for its entries (R38.1, R19, R22).
2. **A slot never holds two meals, and a member's typing is never lost or overwritten mid-edit.** That covers the upsert, last save wins, editor protection and the "unchanged" rule (R35, R38, DD24–DD27).
3. **Both phones agree on dates.** "Today" follows the household's zone, and nothing shifts at midnight, across DST or over a year end. This must hold on Hermes, not just in Node (R34, DD30).
4. **Meal text never leaves the phone** except to the database (R26.4 as amended).
5. **The planner is usable.** Week view, navigation, contrast, VoiceOver and large text (R30, R31, R36, N10–N14).

**References:**
- `R32.3` and `N21` point to [1-requirements.md](./1-requirements.md); R1–R29 and N1–N20 to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md).
- `§3.5`, `DD27`, `OI-15` and "finding 6" point to [2-design.md](./2-design.md).
- Task numbers (9.1–13.1) point to [3-tasks.md](./3-tasks.md).

**Test IDs.** These continue the [MVP test plan's](../mvp/4-test-plan.md) scheme. New prefixes start at 01, and existing prefixes continue past their highest MVP number.

| Prefix | Kind | Runs in | Section |
|---|---|---|---|
| `DB-S` | pgTAP, structural (amended) | CI `database` | §2.1 |
| `DB-M` | pgTAP, meal entries | CI `database` | §2.2 |
| `DB-R-11` on | pgTAP, realtime | CI `database` | §2.3 |
| `U-CAL`, `U-TDY` | Jest: calendar and household today | CI `app` | §3.1, §3.2 |
| `U-MDOM`, `U-MAPI`, `U-MMUT`, `U-MRT` | Jest: meal domain, API, mutations, live updates | CI `app` | §3.3–§3.6 |
| `U-THM-07` on, `U-LNT-04` on | Jest: theme and lint additions | CI `app` | §3.7 |
| `C-WEEK`, `C-SLOT`, `C-MEAL`, `C-AGR` | RNTL component and route tests | CI `app` | §4 |
| `C-RTE-06` (amended), `C-RTE-10` | Route tests for the tabs | CI `app` | §4.3 |
| `MT-12-*`, `MT-13-*` | Manual checks by milestone | Simulator or phones | §6 |

### 1.1 Test Coverage Summary

| Layer | Tool | What it proves |
|---|---|---|
| Database, structural | pgTAP | `meal_entries` follows every convention. The existing generic checks cover it once DB-S-06 lists its grants |
| Database, behavioural | pgTAP, acting as users A–D and anon | Isolation, one entry per slot under upsert, validation (including whitespace), slot immutability, attribution, clearing, broadcasts |
| Unit | Jest | Calendar maths and formatting, household today, meal rules, the API's payload, mutation and sync logic, theme contrast, lint rules |
| Component and route | RNTL 14 + `renderRouter` | Week view, slot editing lifecycle, navigation, states, tabs, Add to groceries, accessibility, with `api.ts` or hooks mocked |
| Manual | Owner, on the Simulator and phones | Hermes `Intl` on a device, midnight rollover, two-device sync and conflicts, offline, VoiceOver, large text, production |

### 1.2 Frameworks and Conventions

The MVP conventions apply unchanged (MVP §1.2):
- RNTL 14's async API
- `renderRouter` for route tests
- pgTAP files that begin, plan and roll back
- `api.ts` mocked in hook and component tests, and `domain.ts` never mocked
- test files beside their modules, with IDs in the `it` names

Additions:

- **Fixed instants.** Calendar and today tests pass explicit instants (`Date.UTC(…)`), or use `jest.useFakeTimers({ now })`. They never depend on the machine's zone.
- **Jest is not Hermes.** Node has full ICU, and the app runs on Hermes's Foundation-based `Intl` (design finding 2). Unit tests prove the logic. MT-13-13 proves the engine on a phone.
- **pgTAP fixtures** use dates in the week of **2030-01-07**, so they never collide with the seed's entries, which are relative to the current week.

---

## Part A — Automated Tests

## 2. Database Tests (pgTAP)

### 2.1 Structural — `00_structure.test.sql` (task 9.1)

| ID | Change | Expected | Req |
|---|---|---|---|
| DB-S-06 (amended) | The expected `authenticated` set adds `meal_entries` {SELECT, INSERT, UPDATE, DELETE} | Exact match | R38.1, R27.4 |

These existing checks cover `meal_entries` and `private.handle_meal_entry_slot` with no change, and must stay green after 9.2:
- DB-S-01–05: RLS, `household_id`, no `anon` or `true` policies, no `anon` grants
- DB-S-07–09: definer `search_path`, and `private` execute rights
- DB-S-11: no `public` functions
- DB-S-14: audit and broadcast triggers on every household table
- DB-S-15: an index leading with `household_id`, which the unique constraint provides

### 2.2 Meal Entries — `50_meal_entries.test.sql` (task 9.1)

"Upsert" means PostgREST's merge-duplicates statement, as `postgrest-js` sends it (design finding 1):

```sql
insert into public.meal_entries (household_id, meal_date, meal_type, body)
values (tests.household_id('Household One'), '2030-01-10', 'dinner', 'Tacos')
on conflict (household_id, meal_date, meal_type) do update
set household_id = excluded.household_id, meal_date = excluded.meal_date,
    meal_type = excluded.meal_type, body = excluded.body;
```

**Isolation**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-M-01 | A | `select` meal_entries | Only H1 rows | R19.2, R38.1 |
| DB-M-02 | C | `select` H1 entries | 0 rows | R19.2 |
| DB-M-03 | anon | `select` meal_entries | `42501` | R19.3 |
| DB-M-04 | C | Insert an entry with `household_id = H1` | `42501` | R19.4 |
| DB-M-05 | C | Upsert into an occupied H1 slot | `42501`; the H1 row is unchanged | R19.4, R38.5 |
| DB-M-06 | C | Update an H1 entry by id | 0 rows; unchanged | R19.2 |
| DB-M-07 | C | Delete an H1 entry by slot key | 0 rows; the entry remains | R19.2 |
| DB-M-08 | D (no membership) | `select`, then insert into H1 | 0 rows, then `42501` | R19.9 |
| DB-M-09 | A | Update an own entry, setting `household_id = H2` | `42501` | R19.4, R19.5 |

**One entry per slot**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-M-10 | A | Upsert an empty slot | One row with the body sent; `created_by` and `updated_by` are both A | R32.8, R38.5 |
| DB-M-11 | B, after DB-M-10 | Upsert the same slot with another body | Still one row, with B's body, `created_by` A, `updated_by` B, a later `updated_at` and the same `id` | R35.3, R38.2, R38.5 |
| DB-M-12 | A | Upsert the same slot twice with the same body, as a retry | One row and no error | R38.5, N5 |
| DB-M-13 | A | A plain insert into an occupied slot | `23505` on `meal_entries_one_per_slot` | R38.2 |
| DB-M-14 | A, plus postgres | The same date and meal type in H1 (as A) and H2 (as postgres) | Two rows, one per household | R38.2, R19.1 |
| DB-M-15 | A | Upsert an occupied slot that also sends a new `id` | `42501`. The audit trigger rejects the id change, which is why `api.ts` never sends `id` (finding 1) | R19.5, DD24 |

**Validation**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-M-16 | A | Body `''` | `23514` | R38.3 |
| DB-M-17 | A | Body with a leading or trailing space, tab, newline, U+00A0 or U+0085 | `23514` for each | R38.3, R32.4, finding 6 |
| DB-M-18 | A | Body ending in U+FEFF | Accepted. Postgres's `\s` doesn't match it, and the app strips it anyway (finding 6) | R38.3 |
| DB-M-19 | A | 500 characters, then 501 | 500 is accepted; 501 fails with `23514` | R38.3 |
| DB-M-20 | A | 500 emoji, then 501 | 500 is accepted; 501 fails with `23514` | R32.5, R38.3 |
| DB-M-21 | A | `E'Chili\nCornbread'` | Accepted, with the inner line break kept | R32.2 |
| DB-M-22 | A | Meal type `snack`, or `Dinner` | `23514` for both | R38.3 |
| DB-M-23 | postgres | The type of `meal_date` | `date` (`col_type_is`) | R34.2, R38.4 |

**Slot immutability and attribution**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-M-24 | A | Update `meal_date` | `42501` | R38.6 |
| DB-M-25 | A | Update `meal_type` | `42501` | R38.6 |
| DB-M-26 | A | Update `body` only | Succeeds; `updated_by` is A and `updated_at` advances | R32.8 |
| DB-M-27 | A | Insert with `created_by = B`, `updated_by = B`, `created_at = '2000-01-01'` | Stored with A for both, and `created_at` close to `now()` | R19.7, R19.8, R32.8 |
| DB-M-28 | A | Update, setting `created_by = B`; then setting `created_by = null` | `42501` for both | R19.5 |
| DB-M-29 | postgres | Delete auth user B, who created and updated entries | Succeeds; B's `created_by` and `updated_by` become null. Clear the signed-in identity first | §4.3 of the MVP design |

**Clearing**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-M-30 | A | Delete by slot key where no entry exists | 0 rows, no error | R33.3 |
| DB-M-31 | A | Delete an H1 entry by slot key while the same slot exists in H2 | Exactly the H1 entry is removed | R33.1, R19.2 |

### 2.3 Realtime — `30_realtime.test.sql` additions (task 9.1)

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-R-11 | A | Upsert an empty slot, upsert it again, then delete it; read `realtime.messages` as postgres | Three broadcasts on `household:<H1>` with table `meal_entries` and events `INSERT`, `UPDATE`, `DELETE` | R11.2 (amended), R35.1, R38.1 |
| DB-R-12 | C, topic `household:<H1>` | `select` the meal broadcasts | Nothing | R22.2, R38.1 |
| DB-R-13 | A | C's rejected upsert (DB-M-05), then read as postgres | No broadcast for it | R22.1, N7 |

---

## 3. Unit Tests (Jest)

### 3.1 Calendar — `src/lib/calendar.test.ts` (task 10.1)

| ID | Test | Req |
|---|---|---|
| U-CAL-01 | `parseIsoDate` accepts `2026-10-19`, and rejects `2026-02-30`, `2026-13-01`, `2026-1-5`, `2026-10-19T00:00` and `''` | R34.2 |
| U-CAL-02 | `addDays`: `2026-12-31` + 1 is `2027-01-01`; `2028-02-28` + 1 is `2028-02-29`; `2028-02-28` + 2 is `2028-03-01`; `2026-10-19` − 7 is `2026-10-12` | R34.4 |
| U-CAL-03 | `weekday`: `2026-10-19` is 0 (Monday) and `2026-10-25` is 6 (Sunday) | K10 |
| U-CAL-04 | `weekStartOf`: each day from `2026-10-19` to `2026-10-25` gives `2026-10-19`; `2027-01-01` (a Friday) gives `2026-12-28` | R30.1, K10 |
| U-CAL-05 | `weekDates`: seven consecutive dates for `2026-12-28` (to `2027-01-03`), for `2026-03-02` (whose Sunday is the US DST start) and for `2026-10-26` (whose Sunday is the US DST end) | R34.4, edge cases 9 and 10 |
| U-CAL-06 | `todayIn('America/Chicago')` gives `2026-10-19` at `2026-10-20T04:59:59Z` and `2026-10-20` at `05:00:00Z` | R34.1 |
| U-CAL-07 | `todayIn('Pacific/Auckland')` gives `2026-10-19` at `2026-10-19T10:59:59Z` and `2026-10-20` at `11:00:00Z` | R34.1 |
| U-CAL-08 | `todayIn('Asia/Kolkata')` gives `2026-10-19` at `2026-10-19T18:29:59Z` and `2026-10-20` at `18:30:00Z` | R34.1 |
| U-CAL-09 | `todayIn('Pacific/Chatham')` (+13:45) gives `2026-10-19` at `2026-10-19T10:14:59Z` and `2026-10-20` at `10:15:00Z` | R34.1 |
| U-CAL-10 | Changeover days in Chicago: `2026-03-08` runs from `06:00Z` that day to `04:59:59Z` the next. `2026-11-01` runs from `05:00Z` that day to `05:59:59Z` the next. In Auckland, `2026-09-27` ends at `11:00Z` that day | R34.1, R34.4 |
| U-CAL-11 | `isValidTimeZone` is true for `America/Chicago` and `UTC`, and false for `Mars/Olympus` and `''` | R34.5 |
| U-CAL-12 | `deviceTimeZone()` returns `Intl.DateTimeFormat().resolvedOptions().timeZone` | R34.5 |
| U-CAL-13 | With `format` spied to return an unexpected string (for example `2026年10月19日`), `todayIn` throws `CalendarFormatError`. `formatToParts` is never called | DD30, finding 2 |
| U-CAL-14 | `todayIn` builds one `Intl.DateTimeFormat` per zone and reuses it on later calls | DD30 |
| U-CAL-15 | `formatDay` builds its formatters with an undefined locale (the device's) and `timeZone: 'UTC'`. For `2026-10-22`, Node's default locale gives `Thursday` and `October 22` | R30.1, R30.12, R34.2 |
| U-CAL-16 | `formatWeekRange('2026-10-19', '2026-10-21')` joins two `{ day, month: 'short' }` dates with " – ". For the week of `2026-12-28`, both ends include the year. `formatRange` is never called | R30.7, edge case 10 |

### 3.2 Household Today — `use-household-today.test.tsx` (task 10.2)

| ID | Test | Req |
|---|---|---|
| U-TDY-01 | Household `Pacific/Auckland` at `2026-10-19T12:00Z` gives `2026-10-20`, the household's date rather than the UTC date | R34.1 |
| U-TDY-02 | Advancing fake timers across Auckland midnight changes the value once; the 60-second ticks before and after cause no re-render | R34.3 |
| U-TDY-03 | Going to the background before midnight and returning after it recomputes at once, without waiting for the tick | R34.3 |
| U-TDY-04 | Household zone `Mars/Olympus` uses `deviceTimeZone()` and calls `reportOnce('household_time_zone_invalid')` once across re-renders; the report extras contain no zone name | R34.5, R26.3 |
| U-TDY-05 | `todayIn` throwing `CalendarFormatError` falls back to the device's local date and reports `calendar_format_unexpected` once | §3.2 |
| U-TDY-06 | A new household zone from the provider recomputes at once | R34.1 |
| U-TDY-07 | No timer or AppState listener remains after unmount | §3.2 |

### 3.3 Meal Constants and Domain — `constants.test.ts`, `domain.test.ts` (task 11.1)

| ID | Test | Req |
|---|---|---|
| U-MDOM-01 | `MEAL_TYPES` order is breakfast, lunch, dinner, with labels `Breakfast`, `Lunch`, `Dinner` and the DD32 glyph and tint tokens | R30.2, R36.2 |
| U-MDOM-02 | `DAY_ACCENTS`, Monday to Sunday, is `primary`, `ink`, `cactus`, `secondary`, `tertiary`, `sand`, `accent`; `DAY_KEYS` is `mon`…`sun` | R36.3 |
| U-MDOM-03 | `buildWeek` with no entries gives seven Monday-first days with consecutive dates, 21 empty slots in meal-type order, and `planned` 0 | R30.1, R30.2, R30.8 |
| U-MDOM-04 | `buildWeek` places entries in their slots, counts 0–3 per day, and ignores entries outside the week | R30.5 |
| U-MDOM-05 | `parseEntryRow` maps a snake_case row to a `MealEntry` | §3.3.2 |
| U-MDOM-06 | `parseEntryRow` is invalid for meal type `snack` (field `meal_type`), a null `id` (`id`), `meal_date = '2026-02-30'` (`meal_date`) and an empty `body` (`body`) | R35.7, R14.8 |
| U-MDOM-07 | `charLength('🌮')` is 1; 500 emoji give 500 | R32.5 |
| U-MDOM-08 | `clampEntry`: 600 ASCII characters give 500; 600 emoji give 500 emoji with no lone surrogate; 499 characters are unchanged | R32.5, edge case 13 |
| U-MDOM-09 | `charactersLeft` is `null` at 450 characters, 49 at 451 and 0 at 500 | R32.5 |
| U-MDOM-10 | `slotChange`: `('', 'Tacos')` saves `Tacos`; `('Tacos', ' Tacos ')` is `none`; `('Tacos', 'Pizza ')` saves `Pizza`; `('Tacos', '   ')` clears; `('', '  ')` is `none` | R32.4, R32.7, R33.1, DD27 |
| U-MDOM-11 | `slotChange('', '\nChili\nCornbread\n')` saves `Chili\nCornbread`, keeping the inner line break | R32.2, R32.4 |
| U-MDOM-12 | `trimEntry` strips everything `trim()` strips, plus U+0085. For each of the 19 code points measured in finding 6, a trailing character that Postgres's `\s` matches is always stripped | R32.4, R38.3, finding 6 |

### 3.4 Meals API — `api.test.ts` (task 11.2)

| ID | Test | Req |
|---|---|---|
| U-MAPI-01 | `fetchWeek` selects `id, meal_date, meal_type, body, updated_at` from `meal_entries` with `eq('household_id')`, `gte` and `lte` on `meal_date` | R30.1 |
| U-MAPI-02 | `saveEntry` calls `upsert` with exactly `{ household_id, meal_date, meal_type, body }` and `{ onConflict: 'household_id,meal_date,meal_type' }`, with no `id`, attribution or timestamps | R38.5, R19.7, DD24 |
| U-MAPI-03 | `clearEntry` deletes with `eq` on all three key columns | R33.1 |
| U-MAPI-04 | `clearEntry` that deletes 0 rows resolves | R33.3 |
| U-MAPI-05 | Every failure throws an `ApiError` with table `meal_entries` and the operation. A CHECK error whose `message` and `details` contain `Tacos` leaves no `Tacos` in the error's message or meta | R26.4 (amended) |

### 3.5 Meal Queries and Mutations — `hooks.test.tsx` (task 11.3)

These run with a real `QueryClient`, a mocked `api.ts` and a controllable `onlineManager`.

| ID | Test | Req |
|---|---|---|
| U-MMUT-01 | Saving a planned slot shows the new body in the cache before `saveEntry` resolves | R32.6, R12.1, N2 |
| U-MMUT-02 | Saving an empty slot adds a placeholder row `pending:<date>:<type>` and raises that day's `planned`. After settling, the refetched row replaces it | R32.6 |
| U-MMUT-03 | `body: null` empties the slot at once and calls `clearEntry` | R33.1 |
| U-MMUT-04 | A `server` failure reverts the slot. The toast "Couldn't save that meal" has Retry, which calls `saveEntry` with the same body, and the failure is reported | R35.5, R12.2 |
| U-MMUT-05 | Save "Pizza", then save "Tacos" to the same slot; "Pizza" fails after "Tacos" is applied. The undo is skipped, and the slot shows "Tacos" | DD14, R35.3 |
| U-MMUT-06 | `forbidden` reverts, shows "You don't have access to that" with no Retry, and is reported | R14.3 |
| U-MMUT-07 | `validation` reverts, shows the toast without Retry, and is reported | R14.4, design §6 |
| U-MMUT-08 | Two saves share the `meals:<hid>` scope: the second call starts only after the first settles. For the same slot, the cache ends with the second | DD34, R35.3 |
| U-MMUT-09 | Offline, a save and then a clear show at once and don't call the API. Back online, they run in their original order | R13.2, R13.3, R35.1 |
| U-MMUT-10 | Three rapid saves invalidate `['household', hid, 'meals']` exactly once, after the last settles | R12.6, R11.5 |
| U-MMUT-11 | A `network` failure is retried up to 3 times; `validation` and `forbidden` aren't retried | R14.1 |
| U-MMUT-12 | `useMealWeek` status is `loading`, `waiting` (paused with no data), `error` (no data) or `ready`. `refreshFailedAt` is set when a refetch fails while data is shown | R30.9, R30.10, R13.1 |
| U-MMUT-13 | A ready week prefetches the weeks before and after once (`fetchWeek` called with their ranges) | R31.5, DD29 |
| U-MMUT-14 | Returning to a cached week gives its days at once, with no `loading`, and refetches in the background. A week unobserved for 10 minutes (fake timers) is still cached | R31.5, DD29 |
| U-MMUT-15 | An invalid row is left out and reported once (`invalid_row:<id>:<field>`) across re-renders and refetches | R35.7, R14.8 |
| U-MMUT-16 | A save for a date whose week isn't cached makes no optimistic patch, still calls `saveEntry`, and doesn't throw | §3.3.4 |

### 3.6 Meal Live Updates — `realtime.test.ts` (task 11.4)

| ID | Test | Req |
|---|---|---|
| U-MRT-01 | A `meal_entries` event with no pending meal mutation invalidates `['household', hid, 'meals']` and not the grocery keys | R35.1, R35.6 |
| U-MRT-02 | An event during a pending meal mutation doesn't invalidate; the mutation's settle does | R11.5 |
| U-MRT-03 | Through the coalescer and the merged handlers, a burst of `grocery_items` and `meal_entries` events runs each feature's handler once | R11.4, R11.2 (amended) |

### 3.7 Theme and Lint Additions (tasks 10.1, 12.1)

| ID | Test | Req |
|---|---|---|
| U-THM-07 | Every `ICON_PAIRS` entry measures at least 3:1 | R36.4, N13 |
| U-THM-08 | `TEXT_PAIRS` includes `accent` on `background` and on `screen`, both bold with a minimum of 3. U-THM-01 and U-THM-02 measure them | R36.1, N13 |
| U-THM-09 | Every `MEAL_TYPES` glyph and tint pair appears in `ICON_PAIRS`, so a token change can't skip measurement | R36.2, R36.4 |
| U-LNT-04 | `new Date().getHours()` (and `getDate`, `getDay`, `setHours`) in a `src/` fixture is an error; `getUTCDate` isn't | DD30 |
| U-LNT-05 | Importing `react` or `react-native` from `src/lib/calendar.ts` is an error | N23 |

---

## 4. Component and Route Tests (RNTL 14)

### 4.1 Week Components — `day-card.test.tsx`, `slot-row.test.tsx`, `week-header.test.tsx` (task 12.1)

| ID | Test | Req |
|---|---|---|
| C-WEEK-01 | `DayCard` renders Breakfast, Lunch and Dinner in that order, each with its label and `MealTypeIcon` | R30.2 |
| C-WEEK-02 | A planned slot shows its full body with no `numberOfLines` | R30.3 |
| C-WEEK-03 | An empty slot shows "Add dinner" in `inkMuted` with the ＋ glyph | R30.4 |
| C-WEEK-04 | The planned count shows "2/3", with the accessibility label "2 of 3 meals planned" | R30.5 |
| C-WEEK-05 | `isToday` shows the "Today" pill (bold `onBrand` on `accent`); other days have no pill | R30.6, R36.1 |
| C-WEEK-06 | The day header reads "Thursday 22 October, today, 2 of 3 meals planned", with the formatted parts | N10 |
| C-WEEK-07 | `SlotRow` has role button and the hint "Edits this meal". Its label is "Thursday dinner: Tacos", or "Thursday dinner, not planned" | N10 |
| C-WEEK-08 | The "Clear" accessibility action exists only on planned slots, and calls `onClear` | R33.2 |
| C-WEEK-09 | `DayCard`'s left edge uses `DAY_ACCENTS[weekday]` | R36.3 |
| C-WEEK-10 | `WeekHeader`: the range has role header; "Previous week" and "Next week" call their handlers; This week shows only when the week isn't current | R30.7, R31.2, R31.3 |
| C-WEEK-11 | Previous week, Next week, This week and slot rows are at least 44 × 44 pt | N11 |
| C-WEEK-12 | `SkeletonWeek` renders seven placeholder cards, with no animation under Reduce Motion | R30.9, N14 |
| C-WEEK-13 | `LoadError` shows "Couldn't load meals" with Retry; `WaitingForConnection` shows "Waiting for connection…" | R30.10, R13.1 |
| C-WEEK-14 | `testID`s are static (`day-thu`, `slot-thu-dinner`), and none contains meal text | R26.7 |
| C-WEEK-15 | `MealTypeIcon` is hidden from VoiceOver | N10 |

### 4.2 Slot Editor — `slot-editor.test.tsx` (task 12.2)

| ID | Test | Req |
|---|---|---|
| C-SLOT-01 | Opens with the slot's text, focused. Return (submit, then blur) calls `onSave({ kind: 'save', body })` once | R32.1, R32.3 |
| C-SLOT-02 | Blur without Return saves | R32.3 |
| C-SLOT-03 | Unmounting, because the parent opened another slot or week, saves the draft | R32.3 |
| C-SLOT-04 | AppState `inactive` saves and keeps the editor open. More typing and then blur saves the new text; another blur with no change sends nothing | R32.3 |
| C-SLOT-05 | Blur followed by unmount sends exactly one save | N5 |
| C-SLOT-06 | Text changed only by surrounding whitespace sends nothing | R32.7, DD27 |
| C-SLOT-07 | While open, the `entry` prop changes from "Pasta" to "Pizza". The field still shows the draft, and closing without changes sends nothing | R35.2, R32.7, DD27 |
| C-SLOT-08 | While open, the `entry` prop changes, and the member types "Tacos" and taps Done. The save is "Tacos" | R35.3 |
| C-SLOT-09 | Emptying a planned slot and pressing Return sends `{ kind: 'clear' }`; doing the same to an empty slot sends nothing | R33.1 |
| C-SLOT-10 | The Clear button sends `{ kind: 'clear' }` at once and closes the editor | R33.2 |
| C-SLOT-11 | Typing past 500 code points keeps 500; pasting 600 keeps the first 500 | R32.5, edge case 13 |
| C-SLOT-12 | No counter at 450 characters; "49 characters left" at 451; "No characters left" at 500. VoiceOver is told when the counter first appears and at zero | R32.5, N10 |
| C-SLOT-13 | The field is `multiline`, with `returnKeyType="done"` and `submitBehavior="blurAndSubmit"`. A pasted inner line break survives into the save | R32.2, DD25 |
| C-SLOT-14 | The field's accessibility label is "Thursday dinner" | N10 |
| C-SLOT-15 | Typing in the editor doesn't re-render the week's other `DayCard`s (a render counter on the memoised card) | N21 |

### 4.3 Meals Screen and Tabs — `src/__tests__/meals.test.tsx`, `routing.test.tsx` (task 12.3)

| ID | Test | Req |
|---|---|---|
| C-MEAL-01 | Seven days, Monday to Sunday, with the current week's dates from `useHouseholdToday` | R30.1 |
| C-MEAL-02 | The Today pill is on today's card only | R30.6 |
| C-MEAL-03 | Next shows the following week's range and calls `useMealWeek` with its start; Previous goes back; This week appears away from the current week and returns to it | R30.7, R31.2, R31.3 |
| C-MEAL-04 | Sixty taps on Previous reach a week more than a year back, without error | R31.4 |
| C-MEAL-05 | The states, in order: loading shows `SkeletonWeek`; an error with no data shows `LoadError`, whose Retry calls `refetch`; an error with data keeps the days and shows a toast with Retry; waiting shows `WaitingForConnection`; a ready empty week shows seven days of empty slots, with no empty state | R30.8–R30.10, R13.1 |
| C-MEAL-06 | Pull to refresh calls `refetch` | R30.11 |
| C-MEAL-07 | Tapping a slot opens its editor. Tapping another slot saves and closes the first, then opens the second | R32.3, DD25 |
| C-MEAL-08 | Switching to Groceries while a slot is open saves it | R32.3 |
| C-MEAL-09 | Leaving Meals and returning shows the same week | R31.6 |
| C-MEAL-10 | When `useHouseholdToday` moves to the next day, the Today pill moves, and the viewed week doesn't change. This week appears if the new today is in another week | R34.3 |
| C-MEAL-11 | A failed save's toast renders at the top, inside the Meals `ToastProvider` | DD35, R35.5 |
| C-MEAL-12 | The header shows "Reconnecting…" while the indicator is on | R13.4 |
| C-MEAL-13 | On first show, and after This week, `scrollTo` is called with today's card `y` and `animated: false` | R31.1, R31.3, N14 |
| C-MEAL-14 | New week data arriving while the member is scrolled down doesn't call `scrollTo` | R35.6 |
| C-RTE-06 (amended) | When ready, there are exactly three tabs, in the order Groceries, Meals, Settings. C-RTE-04 still opens on Groceries | R1.5 (amended) |
| C-RTE-10 | The Meals tab's active tint is `accent`; Groceries' is `cactus` | R36.1, DD36 |

### 4.4 Add to Groceries — `src/__tests__/meals.test.tsx` (task 12.4)

| ID | Test | Req |
|---|---|---|
| C-AGR-01 | The header button "Add to groceries" is at least 44 pt, and opens `/add-item` over Meals | R37.1 |
| C-AGR-02 | Closing the sheet returns to the same week | R37.3 |
| C-AGR-03 | An open slot editor saves when the sheet opens | R32.3 |
| C-AGR-04 | The sheet opens with an empty Name and no route params; no meal text reaches it | R37.4 |
| C-AGR-05 | Adding an item from the sheet over Meals calls `useAddItem` as it does from Groceries, and a duplicate is still blocked | R37.2 |

---

## 5. CI and Static Checks

No new gates. CI-01 to CI-10 from the MVP plan now include the new files:
- CI-04 applies the thresholds in §9.
- CI-06 applies `meals_init` from scratch.
- CI-07 and CI-08 check it.
- CI-09 runs §2.
- CI-10 checks that the generated types include `meal_entries`.

---

## Part B — Manual Acceptance (Owner)

## 6. Manual Tests by Milestone

As in the MVP plan, tick each box when it passes. If one fails, record it against the test ID and fix it before moving on.

### 6.1 M12 — One Simulator Against the Local Stack (after task 12.4)

- [ ] **MT-12-01** Run the app. The tabs are Groceries, Meals and Settings, and it opens on Groceries. The active Meals tab is terracotta and the active Groceries tab is cactus. (R1.5, R36.1)
- [ ] **MT-12-02** Open Meals. It shows the current week, scrolled to today, with the Today pill and the seeded entries. (R30.1, R30.6, R31.1)
- [ ] **MT-12-03** Tap Thursday's dinner, type "Tacos" and press Return. It's saved, and the count goes up. (R32.1–R32.6)
- [ ] **MT-12-04** Type in one slot, then tap another. The first is saved and the second opens. (R32.3)
- [ ] **MT-12-05** Type in a slot, switch to Groceries, then come back. The text was saved, and Meals shows the same week. (R32.3, R31.6)
- [ ] **MT-12-06** Type in a slot and go to the home screen. In Studio, the entry holds the text. Reopen the app: the editor is still open. (R32.3)
- [ ] **MT-12-07** Clear a slot by deleting its text and pressing Return, and another with the Clear button. Both show their placeholders. (R33.1, R33.2)
- [ ] **MT-12-08** Paste 600 characters. The slot keeps 500 and shows "No characters left". Type and delete around the limit: the text doesn't flicker and the cursor doesn't jump (OI-16). (R32.5)
  - *Failed 2026-10-19 (iPhone 17 Simulator, iOS 26.5, Debug build, keys sent by AXe). The paste keeps the first 500 and shows "No characters left", and deleting below the limit works. Two failures in a full slot. **Flicker:** a character typed at the end shows for 140–690 ms before the clamp removes it. **Cursor:** after a character typed mid-text, the cursor lands before it, so the next one goes in front ("MN" comes out as "NM"). Below the limit, typing mid-text is normal. Design §10 OI-16 has the details.*
- [ ] **MT-12-09** Go back to a past week and forward to a week next year. This week returns and scrolls to today. Relaunch the app: the past week still shows its entry. (R31.1–R31.4)
- [ ] **MT-12-10** On Meals, tap Add to groceries and add "Tortillas". Done returns to the same week, and Groceries lists Tortillas. (R37)
- [ ] **MT-12-11** Turn the Mac's Wi-Fi off. The offline banner shows. Save two slots; both show. Turn Wi-Fi on: both are saved, in order. (R35.1, R13.1–R13.3)
- [x] **MT-12-12** Load the long-text week from §8.2. Scroll the whole week: it's smooth (N22). Type in a slot: nothing lags or drops (N21).
  - *Passed 2026-10-19 on the same Simulator and Debug build. The week arrived live. Flick-scrolling it ran at about 60 fps: median frame gap 16.7 ms, 95th percentile 20 ms, and five isolated gaps of about 50 ms. Text typed by machine, 45 and 500 characters, all arrived in order.*
- [x] **MT-12-13** Use the largest standard text size. Nothing is clipped, text wraps, and today still scrolls into view (OI-17). (N12)
  - *Passed 2026-10-19 at Extra Extra Extra Large, with the long-text week loaded and the household zone set to `Pacific/Kiritimati` so that today was Tuesday, below a Monday card about 2,000 points tall. Tuesday's card opened right under the week header, on first show and after This week. The day headers, an open editor, its counter and Clear all fit without clipping.*
- [ ] **MT-12-14** VoiceOver, through the Accessibility Inspector or a device. Day headers read like "Thursday 22 October, today, 2 of 3 meals planned". Slots read like "Thursday dinner: Tacos". The Clear action works, and the counter is announced. (N10)
- [ ] **MT-12-15** Run the Accessibility Inspector's contrast audit on Meals. It finds no failures. (N13, R36.4)
- [ ] **MT-12-16** Turn on Reduce Motion. Scrolling to today isn't animated, and the skeleton doesn't shimmer. (N14)
- [ ] **MT-12-17** The cup, sun, moon, fork-and-knife and cart-plus symbols all render (OI-19). (R36.2)
  - *In the development build, the DEV badge covers the Add to groceries button, so the cart-plus symbol can't be seen there. The button still works, because the badge passes taps through. Check this one on a production build. The other four symbols and the week arrows rendered on 2026-10-19.*
- [ ] **MT-12-18** **Midnight rollover.**
  1. In Studio, set Household One's `time_zone` to a zone where midnight is 2–3 minutes away.
  2. Send the app to the background and reopen it, so the household reloads.
  3. Wait past that midnight. Within a minute the Today pill moves, and the viewed week stays put. (R34.3, edge case 7)
  4. Restore the zone.
- [ ] **MT-12-19** **Household zone, not the Mac's.** Set Household One's zone to `Pacific/Kiritimati` (UTC+14) and reopen the app. Today shows the household's date, which differs from the Mac's for much of the day. Restore the zone. (R34.1, edge case 8)

### 6.2 M13 — Two Simulators Against the Local Stack (`docs/TASKS.md` P2.1)

Run `npm run two-sims`. Sign in as A on simulator 1 and as B on simulator 2.

- [ ] **MT-13-01** Save a meal on A. It appears on B within about 1 second. Clearing it propagates too. (R35.1, N1)
- [ ] **MT-13-02** Both open the same slot. B types "Pizza" and taps Done; A's typing isn't disturbed. A types "Tacos" and taps Done. Both show "Tacos". (R35.2, R35.3, edge case 2)
- [ ] **MT-13-03** A opens a slot that reads "Pasta". B saves "Pizza" in it. A taps Done without changing anything. Both show "Pizza". (R32.7, DD27)
- [ ] **MT-13-04** Both type into the same empty slot and tap Done at nearly the same moment. One entry results, and neither shows an error. (R35.4, edge case 1)
- [ ] **MT-13-05** Send B to the home screen. Make three meal changes on A, wait a minute, then reopen B. B shows all three. (R11.3)
- [ ] **MT-13-06** Stop Realtime with the `docker stop` command that `two-sims.sh` prints. Meals shows "Reconnecting…". Save on A, then start Realtime again: B refetches and shows the change. (R13.4, R11.3)
- [ ] **MT-13-07** B scrolls down in next week while A saves a slot in that week. B updates without jumping. (R35.6)
- [ ] **MT-13-08** Sign in as C on simulator 2. It shows none of Household One's meals, and A's saves never appear. (R38.1, R22.1)
- [ ] **MT-13-09** Add to groceries on A. The item appears on B's Groceries. (R37.2)

### 6.3 Production — Two Phones (`docs/TASKS.md` P2.3–P2.6)

- [ ] **MT-13-10** The deploy's dry run lists only `meals_init`, and the post-deploy advisors step passes. (R28.4, R28.6)
- [ ] **MT-13-11** `curl -s https://<ref>.supabase.co/rest/v1/meal_entries -H "apikey: <publishable key>"` returns a permission error, not rows. (R19.3)
- [ ] **MT-13-12** On both phones, the TestFlight build shows three tabs and Meals works. There's no DEV badge, and Groceries still works as before. (R1.5, N24)
- [ ] **MT-13-13** **Phone time zone (OI-15, gate G11).** On one phone, turn off Set Automatically and pick a zone whose date differs from the household's. Meals marks the household's date as Today. If practical, check again just after midnight in the household's zone. Restore the setting. (R34.1, finding 2)
- [ ] **MT-13-14** Save on phone 1; it shows on phone 2 within about a second. Phone 2 goes back a week and sees past entries. (SC1, SC2)
- [ ] **MT-13-15** Both phones show the same Today, including just after midnight. (SC3)
- [ ] **MT-13-16** Both edit the same slot. Neither's typing is interrupted, and both end on the same text. (SC4, SC5)
- [ ] **MT-13-17** Edit a slot in airplane mode on phone 1, then turn airplane mode off. It syncs to phone 2. (SC6)
- [ ] **MT-13-18** In Sentry, no event from these tests contains meal text. (SC8, R26.4)

SC7 (cross-household isolation) is proven by CI on every change (DB-M-01–09, DB-R-12). SC9 (no core table or policy changed) is proven by design §1.5 and the review in P2.2.

---

## 7. BDD Scenarios

```gherkin
Feature: One week of meals on two phones
  Background:
    Given members A and B belong to Household One
    And both are signed in with Meals open on the same week

  @U-MMUT-01 @U-MRT-01 @MT-13-01
  Scenario: A meal saved on one phone appears on the other
    When A types "Tacos" into Thursday dinner and taps Done
    Then A sees "Tacos" immediately
    And B sees "Tacos" within 2 seconds

  @C-SLOT-07 @C-SLOT-08 @DB-M-11 @MT-13-02
  Scenario: Both members edit the same slot
    Given Thursday dinner reads "Pasta"
    And A and B both open Thursday dinner
    When B types "Pizza" and taps Done
    Then A's field still shows what A is typing
    When A types "Tacos" and taps Done
    Then both phones show "Tacos"

  @U-MDOM-10 @C-SLOT-07 @MT-13-03
  Scenario: Closing a slot without changes never overwrites the other member
    Given Thursday dinner reads "Pasta"
    And A opens Thursday dinner
    When B saves "Pizza" in Thursday dinner
    And A taps Done without typing
    Then no write is sent from A
    And both phones show "Pizza"

  @DB-M-10 @DB-M-11 @DB-M-12 @MT-13-04
  Scenario: Both members fill the same empty slot at once
    When A and B both save Thursday lunch at nearly the same moment
    Then exactly one entry exists for Thursday lunch
    And neither member sees an error
```

```gherkin
Feature: Dates follow the household
  @U-CAL-07 @U-TDY-01 @MT-12-19 @MT-13-13
  Scenario: A phone set to another time zone
    Given the household's time zone is America/Chicago
    And it is 8 pm on Monday 19 October in Chicago
    And A's phone is set to Pacific/Auckland, where it is Tuesday
    When A opens Meals
    Then Monday 19 October is marked Today

  @U-TDY-02 @C-MEAL-10 @MT-12-18
  Scenario: Midnight passes with Meals open
    Given A is viewing the current week
    When midnight passes in the household's time zone
    Then the Today marker moves to the next day
    And the week A is viewing doesn't change
```

```gherkin
Feature: Meals stay in the household
  @DB-M-02 @DB-M-05 @DB-R-12 @MT-13-08
  Scenario: A member of another household
    Given C belongs to Household Two
    When C reads meal entries, upserts into a Household One slot, or listens on Household One's channel
    Then C receives no Household One meals or events
    And C's upsert fails with "42501"
```

---

## 8. Test Data and Mocking

### 8.1 Database Fixtures

The MVP fixtures (`00_test_helpers.sql`, `10_seed_data.sql`) apply. Task 9.2 adds the seed entries in design §4.5, relative to the current week. `50_meal_entries.test.sql` inserts its own rows in the week of 2030-01-07 and rolls back, so it never depends on the seed's entries.

### 8.2 Manual-test Data

For MT-12-12, run this in the local Studio SQL editor (local only). It fills all 21 slots of the current week with 500 characters each, the limit (N22):

```sql
insert into public.meal_entries (household_id, meal_date, meal_type, body)
select h.id, d::date, t, repeat('Long meal text ', 33) || 'Ended'
from public.households h
cross join generate_series(date_trunc('week', current_date), date_trunc('week', current_date) + interval '6 days', interval '1 day') d
cross join unnest(array['breakfast', 'lunch', 'dinner']) t
where h.name = 'Household One'
on conflict (household_id, meal_date, meal_type) do update set body = excluded.body;
```

Clear them afterwards with `delete from public.meal_entries where body like 'Long meal text %';`. That also removes any seeded entries in the current week, which come back at the next reset.

### 8.3 Jest Fixtures and Factories

| Fixture | Location | Used by |
|---|---|---|
| `makeEntryRow(overrides)` and `makeMealEntry(overrides)` | `src/test/factories.ts` (task 11.1) | Domain, hooks and component tests |
| `makePostgrestError(code, …)` (existing) | `src/test/factories.ts` | U-MAPI-05 and U-MMUT-04–07. A CHECK error's `details` contains `Tacos` |
| Fixed instants | `Date.UTC(…)` in each test | U-CAL-*, U-TDY-* |
| The whitespace table from finding 6 | Inline in `domain.test.ts` | U-MDOM-12 |

### 8.4 Mock Strategy

The MVP strategy applies (MVP §8.4). These are added:

| Dependency | Mocked in | Approach |
|---|---|---|
| `Intl.DateTimeFormat` | U-CAL-13–16 | `jest.spyOn` on the constructor and on `prototype.format`, `formatToParts` and `formatRange`, to check arguments and force odd output. Never replaced globally |
| `src/lib/calendar.ts` | U-TDY-04 and U-TDY-05 only | Spy on `todayIn` and `deviceTimeZone`; otherwise the real module |
| AppState | U-TDY-03, C-SLOT-04 | The existing mocked AppState emitter |
| `useHouseholdToday` | C-MEAL-* | `jest.mock` returning a controllable date |
| `src/features/meals/hooks.ts` | C-MEAL-*, C-AGR-* | `jest.mock` with per-test week data and a `setMeal` spy |

`calendar.ts` (apart from the two cases above), `domain.ts` and the coalescer are never mocked.

---

## 9. Coverage Goals

`jest.config.js` enforces these (tasks 10.1 and 11.3 add the meal entries). CI-04 fails below them.

| Scope | Lines | Branches |
|---|---|---|
| The MVP 95/90 group, plus `src/lib/calendar.ts`. `src/features/meals/domain.ts` is already matched by `src/features/*/domain.ts` | 95 % | 90 % |
| The MVP 90/85 group, plus `src/features/meals/hooks.ts`. `src/features/meals/api.ts` and `src/features/household/use-household-today.ts` are already matched by its patterns | 90 % | 85 % |
| Everything else in `src/`, including the meal components and `realtime.ts` | 75 % | 70 % |

**Beyond line coverage:**

- Every acceptance criterion in R30–R38 that can be tested automatically has a test ID in §10; the rest have an `MT-*` ID.
- `meal_entries` has its own behavioural pgTAP file (`50_meal_entries.test.sql`), as SPEC Appendix B requires.

---

## 10. Requirements → Tests Matrix

| Requirement | Automated | Manual |
|---|---|---|
| R30 Week view | U-CAL-04, U-CAL-15–16, U-MDOM-03–04, U-MAPI-01, U-MMUT-12, U-MMUT-16, C-WEEK-01–07, C-WEEK-10, C-WEEK-12–13, C-MEAL-01–02, C-MEAL-05–06 | MT-12-02, MT-12-13 |
| R31 Moving between weeks | U-MMUT-13–14, C-WEEK-10, C-MEAL-03–04, C-MEAL-09, C-MEAL-13 | MT-12-05, MT-12-09 |
| R32 Plan or change a meal | DB-M-10, DB-M-21, DB-M-26–27, U-MDOM-07–12, U-MMUT-01–02, C-SLOT-01–14, C-MEAL-07–08, C-AGR-03 | MT-12-03–08, MT-13-03 |
| R33 Clear a meal | DB-M-30–31, U-MDOM-10, U-MAPI-03–04, U-MMUT-03, C-WEEK-08, C-SLOT-09–10 | MT-12-07 |
| R34 Household calendar | DB-M-23, U-CAL-01–16, U-TDY-01–07, C-MEAL-10 | MT-12-18, MT-12-19, MT-13-13, MT-13-15 |
| R35 Sync, conflicts and offline | DB-M-11–12, DB-R-11, U-MMUT-04–11, U-MMUT-15, U-MRT-01–03, U-MDOM-06, C-SLOT-07–08, C-MEAL-11, C-MEAL-14 | MT-12-11, MT-13-01–07, MT-13-16, MT-13-17 |
| R36 Visual identity | U-MDOM-01–02, U-THM-07–09, C-WEEK-05, C-WEEK-09, C-RTE-10 | MT-12-01, MT-12-15, MT-12-17 |
| R37 Add groceries while planning | C-AGR-01–05 | MT-12-10, MT-13-09 |
| R38 Meal data integrity | DB-S-06, DB-M-01–31, DB-R-11–13, U-MAPI-02 | MT-13-08, MT-13-10, MT-13-11 |
| R1.5 (amended) Tabs | C-RTE-06, C-RTE-10 | MT-12-01, MT-13-12 |
| R11.2 (amended) Live updates for meals | DB-R-11, U-MRT-03 | MT-13-01 |
| R26.4 (amended) No meal text in reports | U-MAPI-05, U-TDY-04, C-WEEK-14 | MT-13-18 |
| N21 Typing keeps up | C-SLOT-15 | MT-12-12 |
| N22 Smooth week | — | MT-12-12 |
| N23 Date rules are pure and tested | U-CAL-*, U-MDOM-03–04, U-LNT-04–05 | — |
| N24 Additive | DB-S-14–15 (no new structural cases needed), U-MRT-01 (grocery keys untouched) | MT-13-12, owner review in P2.2 |
| R48 Start of the week *(added 2026-10-25)* | DB-H-19–23, DB-R-19–20, U-CAL-17–21, U-WKS-01–11, U-HH-07–10, U-MMUT-17, C-WEEK-16–17, C-MEAL-23–28, C-SET-06–07, C-WKS-01–06 | MT-22-01–08, `docs/TASKS.md` WS.5 |

---

## 11. Risk-Based Prioritization

If time runs short, keep the tests in this order. The top of the list must never be skipped.

1. **Isolation** (DB-S-06, DB-M-01–09, DB-R-12–13). A mistake here exposes household meals.
2. **Slot integrity and editing correctness** (DB-M-10–15, U-MDOM-10, U-MMUT-04–10, C-SLOT-01–09, MT-13-02–04). A mistake here loses or overwrites what someone typed.
3. **Dates** (U-CAL-06–13, U-TDY-*, MT-13-13). A mistake here plans meals on the wrong day for one of the two people.
4. **Privacy** (U-MAPI-05, MT-13-18).
5. **Validation** (DB-M-16–22, U-MDOM-07–12).
6. **Screens, accessibility and identity** (C-WEEK-*, C-MEAL-*, C-AGR-*, MT-12-*).

---

## 12. Amendments to the MVP Test Plan

These are written into [`specs/mvp/4-test-plan.md`](../mvp/4-test-plan.md) when this plan is approved, marked *(Amended for meal planning.)*

| MVP item | Change |
|---|---|
| DB-S-06 | The expected set adds `meal_entries` {SELECT, INSERT, UPDATE, DELETE} |
| C-RTE-06 | "Exactly three tabs, in order: Groceries, Meals, Settings" |
| §10, R1 row | Adds C-RTE-10 |
| §2.2 *(added 2026-10-25)* | Adds DB-H-19–23 for the start of the week (§14.1) |
| §3.8 *(added 2026-10-25)* | Adds U-HH-07–10 (§14.2) |
| §4.4 *(added 2026-10-25)* | Adds C-SET-06–07 (§14.3) |
| §10, R11, R15 and R20 rows *(added 2026-10-25)* | Add DB-R-19, C-SET-06–07 and DB-H-19–23 respectively |

Task 22.6 writes the four rows added on 2026-10-25 into the MVP plan, marked *(Amended for the start of the week.)*

---

## 13. Out of Scope for This Test Plan

- Automated end-to-end UI tests, as in the MVP.
- Truly simultaneous database sessions in pgTAP. MT-13-04 checks the race between phones; DB-M-10–12 check the upsert semantics it relies on.
- Running on an iOS 16.4 Simulator runtime. The symbols date from iOS 13 (MT-12-17), and the phones run a current iOS.
- DST on a device. U-CAL-05 and U-CAL-10 cover it, and MT-13-13 covers the engine.
- Everything under Out of Scope (Meal Planning) in 1-requirements.

---

## 14. Start of the Week

*(Added 2026-10-25 for [Requirement 48](./1-requirements.md#requirement-48-settings--start-of-the-week), [design §11](./2-design.md#11-start-of-the-week) and tasks 22.1–22.5. Approved by the owner, 2026-10-25.)*

New prefixes are `U-WKS` (the week-start rules, hook and live updates) and `C-WKS` (the Week starts on screen). Existing prefixes continue past their highest number: DB-H-19, DB-R-19, U-CAL-17, U-HH-07, U-MMUT-17, C-WEEK-16, C-MEAL-23 and C-SET-06. Manual checks are `MT-22-*`. §9's thresholds apply, with `week-start.ts` in the 95/90 group and `use-week-start.ts` in the 90/85 group (task 22.3).

**Fixed dates.** 2026-10-19 is a Monday and 2026-10-25 a Sunday, as in U-CAL-03.

### 14.1 Database — `10_households.test.sql`, `30_realtime.test.sql` (task 22.1)

| ID | Test | Req |
|---|---|---|
| DB-H-19 | Both seeded households have `week_start = 'monday'`, and so does a household created by `private.provision_household` | R48.3 |
| DB-H-20 | A sets Household One's `week_start` to each of the seven values in turn. Each update returns the new value, and `updated_at` advances | R48.4, R20.4 (amended) |
| DB-H-21 | `'Sunday'`, `'sun'`, `''` and `'funday'` fail with `23514`, and null fails with `23502` | R48.12 |
| DB-H-22 | A's update of Household Two's `week_start` affects 0 rows, and so does C's update of Household One's | R19, R48.2 |
| DB-H-23 | Changing `week_start` leaves Household One's `meal_entries` exactly as they were | R48.6 |
| DB-R-19 | An update to Household One's `week_start` as A broadcasts once on its topic, with table `households` and event `UPDATE` | R48.5 |
| DB-R-20 | C can't read DB-R-19's message | R22.1 |

The new definer function needs no structural case. The existing checks (`search_path = ''`, execute revoked, no functions in `public`) cover it, and DB-S-06's grants don't change.

### 14.2 Unit — Calendar, Week Start and Household Data (tasks 22.2, 22.3)

| ID | Test | Req |
|---|---|---|
| U-CAL-04 (amended) | As before, with `start` Monday (`0`) passed explicitly | R30.1, K10 |
| U-CAL-17 | `weekStartOf('2026-10-21', start)`, a Wednesday, gives `2026-10-19` for Monday, `2026-10-18` for Sunday, `2026-10-21` for Wednesday and `2026-10-15` for Thursday | R48.4 |
| U-CAL-18 | For every start day and each of 14 consecutive dates, `weekStartOf` falls on that start day, zero to six days before the date | R48.4, N23 |
| U-CAL-19 | Across a year end with a Sunday start, `weekStartOf('2027-01-01', 6)` is `2026-12-27`, and its `weekDates` run to `2027-01-02` | R34.4, R48.4 |
| U-CAL-20 | `reanchorWeek` with today `2026-10-25`: from the current Monday week (`2026-10-19`) to Sunday gives `2026-10-25`. From the Monday week of `2026-10-05` to Sunday gives `2026-10-04`. From the Sunday week of `2026-10-04` to Monday gives `2026-10-05` | R48.7 |
| U-CAL-21 | For all 49 pairs of start days, and a week away from today, `reanchorWeek`'s result starts on the new day and shares at least four dates with the old week. No other week starting on that day shares more | R48.7, DD66 |
| U-WKS-01 | `parseWeekStart` maps `'monday'`…`'sunday'` to 0…6, and `weekStartValue` maps them back | R48.12, DD62 |
| U-WKS-02 | `parseWeekStart` returns null for `'Sunday'`, `'sun'`, `''` and `'funday'` | R48.11 |
| U-HH-07 | `fetchMemberships` selects `week_start`, maps `'sunday'` to `weekStart: 6`, and maps an unknown value to null | R48.2, R48.11 |
| U-HH-08 | `updateWeekStart(H1, 6)` sends exactly `{ week_start: 'sunday' }`, filtered on `id` | R48.4 |
| U-HH-09 | `updateWeekStart` throws `forbidden` when no row comes back. Any other failure arrives as an `ApiError` without server text | R48.10, R26.4 |
| U-HH-10 | The provider's ready state carries `weekStart` | R48.2 |
| U-WKS-03 | `useWeekStart` returns the household's day, and Monday before the household is ready | R48.3 |
| U-WKS-04 | A null `weekStart` gives Monday, and calls `reportOnce('household_week_start_invalid')` once across re-renders, with no value in the extras | R48.11, R26.3 |
| U-WKS-05 | `setWeekStart(6)` shows Sunday in the cached membership at once, then calls `updateWeekStart` | R48.4 |
| U-WKS-06 | A failure restores the earlier day and sets `failed`. A later choice made before the failure arrived survives it | R48.10, DD14 |
| U-WKS-07 | Offline, a choice fails at once: `updateWeekStart` isn't called, the earlier day is restored and `failed` is set. Nothing is sent when the connection returns | R48.10, DD65 |
| U-WKS-08 | Two quick choices run in order in one scope, and the second shows once both settle | R48.2, DD65 |
| U-WKS-09 | Only the last week-start mutation to settle invalidates the membership query, and a new choice clears `failed` | DD65 |
| U-WKS-10 | A `households` event invalidates the membership query, and leaves the meal, library and grocery queries alone | R48.5 |
| U-WKS-11 | A `households` event while a week-start mutation is pending doesn't invalidate | R11.5 |
| U-MMUT-17 | `useSetMeal(6)` patches the cached Sunday-first week that holds the date, and leaves a cached Monday-first week alone | R48.4, R12.1 |

### 14.3 Components and Routes (tasks 22.4, 22.5)

| ID | Test | Req |
|---|---|---|
| C-WEEK-16 | With a Sunday start and today `2026-10-25`, `WeekHeader` hides This week for the week of `2026-10-25` and shows it for the week of `2026-10-18` | R31.3, R48.4 |
| C-WEEK-17 | In a Sunday-first week, the first card is `day-sun` with the `accent` edge and the last is `day-sat` with `sand` | R48.9, R36.3 |
| C-MEAL-23 | With a Sunday start, Meals shows seven days from Sunday to Saturday, with the current week's dates, and the header's range runs Sunday to Saturday | R30.1 (amended), R30.7, R48.4 |
| C-MEAL-24 | Changing the start while the current week shows moves to the new current week and scrolls to today | R48.7, R31.3 |
| C-MEAL-25 | Changing the start while another week shows moves to `reanchorWeek`'s week, without scrolling | R48.7 |
| C-MEAL-26 | A change while a slot is open leaves the editor open with its text. Closing it saves the slot, and then the week rearranges | R48.8, R35.2 |
| C-MEAL-27 | After a change, Previous, Next and This week step through weeks that begin on the new day | R31.2, R31.3, R48.4 |
| C-MEAL-28 | Changing the start calls no meal mutation | R48.6 |
| C-SET-06 | Settings shows "Week starts on" with the household's day and the footnote. The row is labelled "Week starts on, Sunday" | R48.1, R15.1 (amended) |
| C-SET-07 | Tapping the row opens `/week-start` | R48.1 |
| C-WKS-01 | The screen lists the seven days, Monday to Sunday, named in the device locale. Only the household's day has the checkmark and `selected` | R48.1, R30.12 |
| C-WKS-02 | Tapping Sunday calls `setWeekStart(6)` and moves the checkmark at once, and the screen stays open | R48.4 |
| C-WKS-03 | Tapping the checked day does nothing | §11.5 |
| C-WKS-04 | A failed change shows "Couldn't change the start of the week" with the checkmark back on the earlier day. The next choice hides the message | R48.10 |
| C-WKS-05 | Every row is a button at least 44 pt high, and the test IDs are static | N10, N11 |
| C-WKS-06 | A change from the other phone moves the checkmark while the screen is open | R48.5 |

### 14.4 Manual — Two Simulators Against the Local Stack (after task 22.5)

Run `npm run two-sims`, then sign in as **A** on one simulator and **B** on the other. Tick each box when it passes.

- [ ] **MT-22-01** On A, Settings → Week starts on → Sunday. A's Meals shows Sunday to Saturday, with every seeded meal still on its date. (R48.4, R48.6)
- [ ] **MT-22-02** B, with Meals open, shows Sunday to Saturday within about 2 seconds, and B's Settings says Sunday. (R48.5)
- [ ] **MT-22-03** Sign B out and in as **C**. Household Two still starts on Monday. Sign back in as B. (R48.2)
- [ ] **MT-22-04** On B, open a slot and type. On A, change the start to Wednesday. B's editor stays open with the text. Tapping Done saves it, and B's week then runs Wednesday to Tuesday. (R48.8, R35.2)
- [ ] **MT-22-05** On A, go two weeks ahead, change the start day in Settings, and return to Meals. It shows a week sharing most of its dates with the one before. (R48.7)
- [ ] **MT-22-06** Turn the Mac's Wi-Fi off and change the start on A. The checkmark goes back at once, and "Couldn't change the start of the week" shows. Turn Wi-Fi back on. Nothing changes until A chooses again. (R48.10)
- [ ] **MT-22-07** With VoiceOver, the Settings row reads "Week starts on, Sunday", and the list says which day is selected. At the largest standard text size, nothing clips. (R48.1, N10–N12)
- [ ] **MT-22-08** Set it back to Monday. Both simulators show Monday to Sunday again. (R48.4)

The production check on both phones is `docs/TASKS.md` WS.5.
