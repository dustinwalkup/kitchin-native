# Kitchin Meal Planning — Requirements Document

> **Phase 1 of 4** in the EARS spec-driven process: **1-requirements** → 2-design → 3-tasks → 4-test-plan.
> **Status:** Approved by the owner, 2026-10-19, including decisions K9–K17.
> **Amendment proposed during design** (approved together with `2-design.md`): 32.7 changed. See [2-design.md §1.4](./2-design.md#14-requirement-amendments).
> **Amended for the meal library** (approved with `specs/meal-library/2-design.md`, 2026-10-19): N24 and Out of Scope. See [specs/meal-library/1-requirements.md](../meal-library/1-requirements.md#amendments-to-earlier-requirements).

## Introduction

Meal planning is Phase 2 of Kitchin. It brings back the legacy `kitchin-app` Meals tab, a week of breakfast, lunch and dinner typed as free text, and rebuilds it on real dates and on the MVP's foundation. The legacy planner had one Monday–Sunday grid that never changed. It had no history, saved on every keystroke and had no protection against two people editing at once.

Both members see the same week. Either can type what's for dinner on Thursday, and the other phone shows it within about a second. Members move back and forward a week at a time, so past weeks stay as a record and future weeks can be planned ahead.

**Relationship to the MVP spec.** This document adds to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md) and doesn't replace any of it. Every MVP requirement still applies, notably sign-in (1–3), sync (11–14), data protection (18–22), delivery (24–29) and N1–N20. Where a meal requirement depends on one, it cites it. Numbering continues from the MVP: requirements start at **30**, non-functional requirements at **N21**, and decisions at **K9**, so a reference such as R32.3 means one thing anywhere in the project. The changes this phase makes to MVP requirements are listed in [Amendments to the MVP Requirements](#amendments-to-the-mvp-requirements). The research behind this document is in [research.md](./research.md).

### Glossary

These terms add to the [MVP glossary](../mvp/1-requirements.md#glossary).

| Term | Meaning |
|---|---|
| **Meal type** | Breakfast, lunch or dinner (K11). |
| **Slot** | One meal type on one date, for example dinner on Thursday 23 October. Each date has three slots. |
| **Entry** | The text planned for a slot. A slot with an entry is **planned**; a slot without one is **empty**. |
| **Household date** | The calendar date in the household's time zone (K5, K13). |
| **Today** | The current household date. |
| **Week** | Seven consecutive dates, Monday to Sunday (K10). |
| **Current week** | The week that contains today. |

### Scope

**In scope:**

- A Meals tab showing one week at a time: seven dates, each with three slots of free text and a count of planned slots.
- Today marked. Meals opens on the current week.
- Moving to the previous or next week, to any past or future week, and back to the current week.
- Planning, changing and clearing a slot. Saving is automatic, and the other phone shows the change within about a second.
- Concurrent edits settled per slot by last save wins, with a member's typing never overwritten while they edit.
- The MVP's loading, error, offline and reconnecting behaviour, applied to meals.
- Isolation and integrity for meal entries, enforced by the database and proven by automated tests.
- The legacy Meals look: terracotta, day accents and meal-type icons.
- Optional, assumed included (K17): an Add to groceries shortcut from Meals that opens the existing add-item sheet.

**Out of scope:** see [Out of Scope (Meal Planning)](#out-of-scope-meal-planning). The main exclusions are recipes and ingredients, creating grocery items from meals automatically, meal types beyond breakfast, lunch and dinner, saved or favourite meals, moving meals between slots, a month view, reminders and widgets.

### Key Decisions

The requirements below depend on these decisions. Each is a recommendation drawn from the legacy app, SPEC.md and [research.md](./research.md). **Approving this document approves these decisions.** Technical choices, such as the table layout, date library and editing UI, are settled in `2-design.md`.

| # | Decision | Assumed here | Source |
|---|---|---|---|
| K9 | Calendar model | Real dates. Each entry belongs to a calendar date, not a weekday, so every week is separate and past weeks stay as a record | SPEC §2.12 and §5.6; TASKS.md "date-based" |
| K10 | Start of the week | Monday, as in the legacy app. Not configurable. Entries are stored by date, so the start day only affects the display, and making it configurable later moves no data | Legacy `DAYS`; research.md §6 |
| K11 | Meal types | Breakfast, lunch and dinner only, with at most one entry each per date | Legacy `MEAL_TYPES` |
| K12 | Entry content | Free text of up to 500 characters. No recipes, ingredients or other structured fields | Legacy; research.md §5 |
| K13 | Whose "today" | The household's time zone decides today and the current week, on both phones | K5; SPEC §5.1 |
| K14 | Saving | Automatic, at the latest when the member finishes editing a slot. No Save button, and no write for every keystroke | SPEC §2.11 item 4 |
| K15 | Concurrent edits | Last save wins per slot, and both phones converge. No merging and no conflict prompt | SPEC §5.6 |
| K16 | Tabs | Groceries, Meals, Settings, in that order. The app still opens on Groceries | Amends R1.5 |
| K17 | Grocery link | Included: a manual Add to groceries shortcut that opens the existing add-item sheet ([Requirement 37](#requirement-37-groceries--add-groceries-while-planning-optional)). Nothing is created from meal text | SPEC §12.3; research.md §6 |

---

## Requirements

| Area | Requirements |
|---|---|
| Meals | 30 Week view · 31 Moving between weeks · 32 Plan or change a meal · 33 Clear a meal |
| Calendar | 34 Household calendar |
| Sync | 35 Meal sync, conflicts and offline |
| App | 36 Visual identity for Meals |
| Groceries | 37 Add groceries while planning (optional) |
| Data protection | 38 Meal data integrity |

### Requirement 30: Meals — Week View

**User Story:** As a member, I want to see a week of meals at a glance, so that we both know what we're eating and what's still unplanned.

#### Acceptance Criteria

1. WHEN a member opens Meals THEN the app SHALL show one week (K10) as seven days, Monday to Sunday, each with its weekday name and date.
2. Each day SHALL show its three slots in this fixed order: Breakfast, Lunch, Dinner. Each slot SHALL show its meal-type label and icon ([Requirement 36](#requirement-36-app--visual-identity-for-meals)).
3. A planned slot SHALL show its full entry, wrapping long text rather than truncating it.
4. An empty slot SHALL show placeholder text that names its meal type (for example "Add dinner"), styled so that it can't be mistaken for an entry.
5. Each day SHALL show how many of its three slots are planned (for example "2/3"). VoiceOver SHALL read this as "2 of 3 meals planned".
6. The app SHALL mark today ([Requirement 34](#requirement-34-calendar--household-calendar)) with a visible "Today" label, so that colour alone never identifies it.
7. The week's header SHALL show its date range (for example "20–26 Oct").
8. A week with no entries SHALL still show its seven days and their empty slots, so that a member can start planning straight away. Meals has no separate empty state.
9. WHILE a week loads for the first time in a session, the app SHALL show placeholder (skeleton) days, not a blank screen or a full-screen spinner.
10. IF loading a week fails THEN the app SHALL show "Couldn't load meals" with Retry, and SHALL keep showing that week's previously loaded entries if there are any.
11. WHEN the member pulls down on the week THEN the app SHALL reload it from the backend.
12. The app SHALL format dates and weekday names according to the device's language and region settings.

### Requirement 31: Meals — Moving Between Weeks

**User Story:** As a member, I want to look back at past weeks and plan ahead, so that we can repeat meals we liked and plan before we shop.

#### Acceptance Criteria

1. WHEN Meals opens for the first time after the app starts THEN the app SHALL show the current week, scrolled so that today is visible.
2. The app SHALL offer Previous week and Next week controls. WHEN the member uses one THEN the app SHALL show the adjacent week.
3. WHILE the member is viewing a week other than the current week, the app SHALL offer a control that returns to the current week and today.
4. The app SHALL let the member move to any past or future week.
5. WHEN the member returns to a week the app has already loaded THEN the app SHALL show its entries immediately and refresh them in the background.
6. WHEN the member leaves Meals for another tab and comes back, while the app keeps running, THEN the app SHALL show the week they were last viewing.

### Requirement 32: Meals — Plan or Change a Meal

**User Story:** As a member, I want to type what we're having into a slot, so that the plan is there for both of us.

#### Acceptance Criteria

1. The app SHALL let a member enter or change the text of any slot, in any week, past or future.
2. An entry SHALL be free text, for example "Tacos", "Leftover chili" or "Out with friends". It MAY span several lines.
3. The app SHALL save a slot without a Save action, and SHALL NOT send a write for every keystroke. It SHALL save the slot no later than when any of these happens:
   - the member finishes editing (for example by tapping Done)
   - the member moves to another slot, week or tab
   - the app moves to the background
4. The app SHALL trim leading and trailing whitespace from the text before saving.
5. The app SHALL stop accepting text once a slot reaches 500 characters, counting each emoji as one character, as the database does. It SHALL show the number of characters left once fewer than 50 remain.
6. WHEN a member saves a slot THEN the app SHALL show the saved text, and the day's updated planned count, immediately (12.1).
7. IF the trimmed text is the same as when the member started editing the slot THEN the app SHALL NOT send a write. *(Changed during design: it compared with the slot's saved entry, which may have changed on the other phone meanwhile.)*
8. The system SHALL record which member last changed an entry, and when, from the authenticated identity and the server clock (19.7, 19.8).

### Requirement 33: Meals — Clear a Meal

**User Story:** As a member, I want to empty a slot when plans change, so that the week shows only what we're actually having.

#### Acceptance Criteria

1. WHEN a member saves a slot whose trimmed text is empty THEN the system SHALL remove that slot's entry, and both phones SHALL show the slot as empty.
2. The app SHALL also offer a one-step Clear action for a planned slot, without a confirmation step, available to VoiceOver as a custom action.
3. IF the other member has already cleared the slot THEN the app SHALL treat the clear as successful and SHALL NOT show an error.

### Requirement 34: Calendar — Household Calendar

**User Story:** As a member, I want both phones to agree on what "today" and "this week" mean, so that neither of us plans on the wrong day.

#### Acceptance Criteria

1. The app SHALL determine today, and therefore the current week, from the household's time zone (K13, R20.5), whatever time zone the phone is set to.
2. Each entry SHALL belong to a calendar date, not a moment in time. Its date SHALL NOT shift when the phone's or the household's time zone changes, or when daylight saving time starts or ends.
3. WHEN the household date changes while the app is open, or the app returns to the foreground on a later household date, THEN the app SHALL move the Today marker and update which week is current. It SHALL NOT change the week the member is viewing without their action.
4. Every week SHALL show exactly seven consecutive dates, including a week with a daylight-saving change and a week that spans two months or two years.
5. IF the app can't interpret the household's time zone THEN it SHALL use the phone's time zone instead and report a warning once, with no personal data ([Requirement 26](../mvp/1-requirements.md#requirement-26-delivery--error-reporting-and-privacy)).

### Requirement 35: Sync — Meal Sync, Conflicts and Offline

**User Story:** As a member, I want meal changes to reach the other phone quickly and settle cleanly when we both edit, so that we're never looking at different plans.

#### Acceptance Criteria

1. Requirements 11–14 SHALL apply to meal entries as they apply to grocery items. Saving and clearing a slot count as changes wherever those requirements list grocery actions, for example live updates (11.2), instant feedback (12.1) and holding changes while offline (13.2).
2. WHILE a member is editing a slot, the app SHALL NOT replace the text in that field, or close the editor, because of incoming changes, reloads or the result of an earlier save.
3. IF both members save the same slot at about the same time THEN the last save SHALL win, and both phones SHALL end up showing the same text (K15).
4. IF both members save the same empty slot for the first time at about the same moment THEN exactly one entry SHALL exist for that slot afterwards, and neither member SHALL see an error.
5. IF saving a slot fails THEN the app SHALL restore the slot's last saved text and show a message with Retry (12.2). Retry SHALL send the text the member entered, so that it isn't lost.
6. WHEN entries change on the other phone THEN the app SHALL update the weeks it has loaded without moving the member's scroll position.
7. IF the backend returns an entry whose meal type the app doesn't recognize THEN the app SHALL leave it out of the display and report it once (14.8).

### Requirement 36: App — Visual Identity for Meals

**User Story:** As the owner, I want Meals to keep the legacy planner's look, so that it still feels like Kitchin.

#### Acceptance Criteria

1. Meals SHALL use terracotta (`accent`) for its active tab and primary actions (R16.3), with white text on terracotta always bold (N13, DD19).
2. Each meal type SHALL use its legacy icon and colour (SPEC §4.6): breakfast ☕ terracotta, lunch ☀️ sunset blush, dinner 🌙 desert teal.
3. Each day SHALL carry its legacy accent colour on its card edge: Monday desert teal, Tuesday night horizon, Wednesday cactus flower, Thursday sunset blush, Friday sagebrush, Saturday pueblo sand, Sunday terracotta. The accent is decoration only; the weekday name always appears as text.
4. Text and icons SHALL meet N13. Where a legacy colour can't, it SHALL be used only as a tint or decoration behind content that does. Measured against white, sunset blush (1.93:1), sagebrush (2.03:1) and pueblo sand (1.40:1) fall short of the 3:1 that icons need.
5. Day cards SHALL follow the MVP look: rounded white cards on the sand background (16.2), with colours taken only from theme tokens (16.7).

### Requirement 37: Groceries — Add Groceries While Planning (Optional)

**User Story:** As a member, I want to add what a meal needs to our grocery list without leaving Meals, so that planning and shopping stay connected.

This requirement applies only if the owner confirms K17. Other apps link meals to the list through recipe ingredients, and lists that rebuild themselves when the plan changes are a common complaint (research.md §6). This shortcut adds items only when the member chooses to.

#### Acceptance Criteria

1. WHERE the shortcut is included, Meals SHALL offer an Add to groceries action that opens the add-item sheet (DD10) over Meals.
2. WHERE the shortcut is included, items added from Meals SHALL follow Requirements 5 and 6 exactly, including the duplicate check and quick-add, and SHALL appear on Groceries like any other item.
3. WHERE the shortcut is included, WHEN the member closes the sheet THEN the app SHALL return to the same week and scroll position in Meals.
4. The shortcut SHALL NOT read or parse meal text, prefill the item from it, or link a grocery item to a meal.

### Requirement 38: Data Protection — Meal Data Integrity

**User Story:** As a member, I want the plan to stay consistent even when we both edit at once, so that a slot never holds two different meals.

#### Acceptance Criteria

1. Entries SHALL be household data. Requirements 19 (isolation) and 22 (realtime authorization) SHALL apply to them, and the CI isolation tests (27.6) SHALL cover them.
2. The database SHALL allow at most one entry per household, date and meal type.
3. The database SHALL reject an entry if any of these hold:
   - its text is empty, has leading or trailing whitespace, or is longer than 500 characters
   - its meal type isn't one of `breakfast`, `lunch`, `dinner`
4. The database SHALL store each entry's date as a calendar date, with no time or time zone (34.2).
5. Saving a slot SHALL be a single operation that creates the entry if the slot is empty and replaces its text otherwise. Retrying a save, or both phones saving the slot at once, SHALL NOT fail on the uniqueness rule in 38.2 (N5).
6. The database SHALL reject a change to an existing entry's date or meal type. An entry stays in its slot until it's cleared.
7. Meal planning SHALL NOT need a provisioning step. A household starts with no entries, and Requirement 23 is unchanged.

---

## Amendments to the MVP Requirements

Approving this document approves these changes to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md). They were written into that file on 2026-10-19, when this phase's design was approved, marked *(Amended for meal planning.)*

| MVP item | Change |
|---|---|
| Glossary, "Household data" | Now includes meal entries |
| 1.5 | "The main tabs SHALL be **Groceries**, **Meals** and **Settings**, in that order." 1.4 is unchanged: the app still opens on Groceries (K16) |
| 11.2 | Live updates also cover saving and clearing meal slots (35.1) |
| 26.4 | The list of household content that reports must never contain adds "meal entries" |
| Out of Scope (MVP) | Meal planning moves into scope under this document |

---

## Non-Functional Requirements

N1–N20 apply to meal planning unchanged. These add to them.

### Performance

- **N21.** Typing in a slot SHALL keep up with the member's typing, without lag or dropped characters, while saves and live updates happen in the background.
- **N22.** A week SHALL scroll smoothly on the members' iPhones when all 21 slots hold 500 characters.

### Maintainability & Extensibility

- **N23.** Date rules SHALL be pure functions with unit tests (N17). They include today in a given time zone, the dates of a week, the current week across daylight-saving changes and year ends, and the planned count.
- **N24.** Meal planning SHALL be additive (N16): new tables, a new feature module and a new tab. No core table or policy, and no grocery code, SHALL need to change, apart from the tab list in 1.5. The meal library adds a Library tab and a Choose from Meal Library button to the slot editor (meal library N30). *(Amended for the meal library; the tab replaced a Library button in the Meals header on 2026-10-24.)*

---

## Assumptions

1. The MVP is finished and in daily use on both phones before meal planning is implemented. `docs/TASKS.md` suggests a couple of weeks of use first. This document can be approved before then.
2. Both phones are normally in the household's time zone.
3. Entries are short, a few words each. A year of daily planning is at most about 1,100 entries.
4. The household's time zone was set correctly at provisioning. The column defaults to `UTC`, and members can't change it in the app.
5. The app's JavaScript engine can compute dates in a named IANA time zone. Design confirms this (Open Item 6).
6. Both members install the build with Meals within a few days of each other.
7. As meal history builds up, the data matters more. The owner revisits the backup plan (N20, DD6) when this phase ships.

## Constraints

1. Every MVP constraint applies, including no custom server and no Edge Functions.
2. The legacy `kitchin-app` and `kitchin` repositories stay read-only. Their meal data isn't migrated (K2).
3. The new tables must work alongside the TestFlight build installed at the time, which has no Meals tab (R28.5).

## Edge Cases

1. **Both members type into the same empty slot at the same moment.** One entry results, holding the last save, and neither sees an error (35.4).
2. **Both members edit the same slot.** Neither's typing is interrupted. The last save wins and both phones converge (35.2, 35.3). The earlier text is replaced; this is accepted under K15.
3. **One member clears a slot while the other edits it.** Whichever saves last wins (35.3).
4. **A member edits a slot offline, and the other member changes it online meanwhile.** The offline edit is sent when the connection returns and, being last, wins (13.3, K15).
5. **The member switches tab or week, or the app goes to the background, mid-edit.** The text is saved (32.3).
6. **The app is force-quit mid-edit, or while edits are held offline.** Those edits are lost, as accepted in MVP edge case 9.
7. **Midnight passes with Meals open.** The Today marker moves. The member's view stays on the week they were looking at (34.3).
8. **A phone is set to another time zone, for example while travelling.** Today follows the household's time zone, so both phones agree (34.1).
9. **A week with a daylight-saving change.** It still shows seven dates (34.4).
10. **A week that spans New Year**, for example 29 December – 4 January. It shows the right dates and range (34.4, 30.7).
11. **The household's time zone was left at `UTC`.** Today can be off by one near midnight. The owner fixes it in the dashboard; no data changes (34.2).
12. **Text that's only whitespace.** Saving it clears the slot (33.1).
13. **Pasted text longer than 500 characters.** The slot keeps the first 500 characters, and the database rejects anything longer (32.5, 38.3).
14. **A newer build adds a meal type this build doesn't know.** Those entries are left out and reported once (35.7).
15. **One phone still runs a build without Meals.** That member sees no Meals tab until they update. Groceries work as before on both phones (Constraint 3).
16. **A member opens a week far in the past or future.** It shows empty slots wherever nothing was planned (31.4).

## Out of Scope (Meal Planning)

These are deferred and SHALL NOT appear in this phase's design, tasks or implementation:

- Recipes: instructions, servings, prep time, photos, and recipe links or imports. The `kitchin` prototype sketched these. *(Amended for the meal library: free-text ingredients on saved meals moved into scope under [`specs/meal-library/`](../meal-library/1-requirements.md).)*
- Creating grocery items from meal text, and linking grocery items to meals. Requirement 37 only opens the existing add-item sheet.
- Meal types beyond breakfast, lunch and dinner (snacks, dessert), several entries in one slot, custom slots, and markers such as Leftovers or Eating out. Members type these as text.
- Favourite or pinned meals, and suggestions drawn from past entries. *(Amended for the meal library: saved meals moved into scope under [`specs/meal-library/`](../meal-library/1-requirements.md).)*
- Moving, swapping, dragging or copying a meal between slots, and copying or clearing a whole week. Other apps commonly offer these and the saved meals above ([research.md §6](./research.md#6-survey-of-meal-planning-apps)), so they're the first candidates for a later iteration.
- A month view, and a configurable start of the week.
- Assigning who cooks, who's eating, or servings.
- Nutrition, calories and costs.
- Reminders, notifications and home-screen widgets.
- Editing the household's time zone in the app. The owner changes it in the dashboard.
- Migrating meal data from the legacy app.

## Success Criteria

1. Both members see the same week, and a slot saved on one phone appears on the other within about a second.
2. Both members can move to last week and next week, and past entries are still there.
3. Both phones agree on today, including just after midnight. Unit tests cover daylight-saving changes and year ends.
4. Typing in a slot is never interrupted by changes from the other phone.
5. When both members edit the same slot at once, both phones end up showing the same text.
6. A slot edited in airplane mode syncs once connectivity returns.
7. CI proves that an account in another household can't read, change or receive events for meal entries.
8. Error reports never contain meal text.
9. No core table or policy changed (N24).

## Differences from SPEC.md and the Legacy App

| Topic | SPEC.md / legacy | This document |
|---|---|---|
| Days | Legacy: fixed weekdays, one week that never changes | Real dates, and any week (K9, 31.4) |
| Saving | Legacy: a write on every keystroke. SPEC §5.6: debounce saves by 600–800 ms | Automatic, no later than the end of an edit, and never on every keystroke (K14, 32.3). Design may also save during pauses |
| Entry length | SPEC §5.6: up to 2,000 characters | Up to 500 (K12) |
| Clearing a slot | Legacy: stores an empty string | Removes the entry (33.1) |
| One entry per slot | Legacy: not enforced, so duplicates were possible | Enforced by the database (38.2) |
| Showing who edited | SPEC §5.6: show "edited by" | Recorded (32.8). Whether to show it is a design item (Open Item 2) |
| Today | Legacy: not shown | Marked, in the household's time zone (30.6, 34.1) |
| Tab order | Legacy: Meals, then Shopping, opening on Meals | Groceries, Meals, Settings, opening on Groceries (K16) |
| Meal-type and day colours | SPEC §4.6: legacy colours as is | Kept, except where they'd fail contrast (36.4) |
| Grocery link | SPEC §12.3: optionally "add ingredients to groceries" later | A manual shortcut to the add-item sheet. Nothing is created from meal text (37, K17) |

## Open Items for Design Phase

1. How editing works: an inline multi-line field in the slot, or a sheet per slot; what Done looks like; and keeping the field above the keyboard in a long scrolling week.
2. Whether and how a slot shows who last changed it, and whether to say when the other member changed a slot while it was being edited.
3. How the editor keeps the member's typing while reloads and live updates arrive (35.2).
4. Whether to also save during long pauses in typing (32.3).
5. Moving between weeks: buttons only, or a swipe as well, and whether to prefetch the adjacent weeks (31.2, 31.5).
6. Date handling: confirm that `Intl.DateTimeFormat` with a `timeZone` option gives the household date in the app's JavaScript engine on iOS, or choose a small date library.
7. How a save creates or replaces an entry under row-level security (38.5), and how a delayed Retry behaves under last save wins.
8. The table layout: SPEC's single `meal_plan_entries` table, or a parent plan table. With no parent, nothing needs provisioning (38.7).
9. How the lunch icon and the Thursday, Friday and Saturday accents meet N13 (36.4).
10. If K17 holds: where Add to groceries sits (the week header, or each day), and how the add-item sheet's own toasts behave over Meals (37.1).
