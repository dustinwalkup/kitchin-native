# Kitchin Meal Planning — Research

> Supports [1-requirements.md](./1-requirements.md). Gathered 2026-10-19. This plays the role for meal planning that `docs/SPEC.md` plays for the MVP: what the old apps did, what the MVP already provides, and what comparable apps do. It's a record, not a spec. Where it and the requirements disagree, the requirements win.

## 1. Sources

- The legacy web app `kitchin-app`: `src/components/meal-planner.tsx`, `src/hooks/use-meals.ts`, `src/hooks/use-mutations.ts`, `src/lib/constants.ts` and `src/db/schema.ts`.
- The earlier prototype `kitchin`: `src/db/schema.ts`. It was never deployed.
- `docs/SPEC.md` §2 (legacy assessment), §4.6 (visual identity), §5.1 and §5.6 (conventions and the Phase 2 sketch), §12.3 (rebuild order) and Appendix B (new-feature checklist).
- `specs/mvp/1-requirements.md` and `specs/mvp/2-design.md`, plus the code and migrations as built.
- A web survey of established meal-planning apps (§6).

## 2. The Legacy Planner (`kitchin-app`)

**What it did.** Meals was the first tab, and `/` redirected to it. It showed one fixed Monday–Sunday grid, a card per day, with three free-text boxes per day (breakfast, lunch, dinner) and an "n/3" badge. There were no dates, no week navigation and no history. The same seven days were edited forever.

**How it stored data.** A `meal_plans` row held `meals` rows keyed by `day_of_week` and `meal_type`, with the text in `notes`. Every keystroke wrote to the database: `onChange` looked up the slot in memory, then called `updateMeal`, or `createMeal` if the slot had no row yet.

**Defects** (SPEC §2.6, §2.11):

| Defect | Consequence | Carried into |
|---|---|---|
| A write on every keystroke, with no debounce | Write amplification, and the other member's typing can be overwritten character by character | K14, 32.3 |
| No unique key on (plan, day, type) | Two first keystrokes at once could create two rows for one slot | 38.2, 38.5 |
| `mealPlan[0].id` with no plan row | The planner crashed if the default plan didn't exist, and the code that created it was commented out | 38.7: no parent row to provision |
| Weekdays, not dates | No record of past weeks; planning next week meant overwriting this one | K9 |
| An empty slot kept an empty-string row | The data couldn't tell "cleared" from "never planned" | 33.1 |
| Client-clock timestamps without time zone | No reliable "when" | 32.8 (server clock, MVP 19.8) |

**Worth keeping** (SPEC §2.10, §4.6):

- `DAYS`: Monday-first order, short and full labels, and a left-edge accent colour per day.
- `MEAL_TYPES`: breakfast with a coffee icon in terracotta, lunch with a sun in sunset blush, dinner with a moon in desert teal, each on a 10–20 % tint of its colour.
- The copy: "Meal Planning" / "Meals" labels and the "breakfast…" style placeholders.
- Terracotta as the Meals colour, against cactus flower for Shopping.

## 3. The `kitchin` Prototype

The prototype schema went further than the legacy app ever did:

- `meal_plans` with `household_id`, a `week_start_date` (the Monday) and `is_active`
- `meals` with `title`, `description`, `notes`, `prep_time`, `servings`, `image_url` and `recipe_url`
- `meal_templates` with `ingredients` (JSON), `instructions`, `tags`, `is_favorite` and `use_count`

None of it shipped. It shows that recipes and reusable meals were once on the table. The requirements leave them out (K12, Out of Scope) and keep the legacy app's free text, because that's what the household actually used. A later phase can add recipes as new tables without changing entries.

## 4. What the MVP Foundation Already Provides

Meal planning needs almost no new infrastructure. Each row below already exists and is tested.

| Need | What exists | Where |
|---|---|---|
| A household time zone | `households.time_zone`, an IANA name that a trigger validates against `pg_timezone_names`. It defaults to `UTC` and is set at provisioning. The app's household provider already exposes `household.timeZone` | Migration `core_households`; `src/features/household/household-provider.tsx`; MVP K5, 20.5 |
| Table conventions and policies | `household_id`, audit columns, immutability trigger, CHECKs, and the four-policy RLS template. Structural tests fail a table that lacks RLS or `household_id` | 2-design §4.1, §4.4; SPEC Appendix B |
| Live updates | `private.broadcast_household_change()` is generic. A new table needs only a `<table>_90_broadcast` trigger. The household channel passes the table name to feature handlers (`onTableChange`) | 2-design §3.6, §4.5 |
| Ordered, offline-safe writes | TanStack Query mutation scopes run one at a time in order and pause while offline | 2-design §3.5.3, DD2, DD15 |
| Error classification and reporting | `toApiError` categories, the Sentry facade and the scrubber. `CLAUDE.md` already names meal text as never logged | 2-design §3.8, §3.9 |
| Per-device preferences | The `prefs:v1` key is reserved and unused | 2-design §4.8 |
| Theme | The `accent` token is terracotta. DD19 makes white text on brand colours bold | `src/ui/theme.ts`; 2-design §3.10 |

The one thing provisioning creates per household is the grocery list. If meal entries have no parent row (§5), meal planning needs no provisioning change at all (38.7).

## 5. SPEC.md's Phase 2 Sketch

SPEC §5.6 sketches one table:

```
meal_plan_entries(id, household_id, date date,
                  meal_type text check in (breakfast, lunch, dinner),
                  notes text ≤ 2000, …, unique (household_id, date, meal_type))
```

with "upsert on the unique key; debounce saves 600–800 ms; last write wins per cell; show 'edited by'". SPEC §5.1 adds that "which day" is a `date` interpreted in `households.time_zone`.

The requirements follow this sketch, with three refinements:

1. **Saving.** A debounce still writes while the member is mid-thought, and every save can land on the other phone and race with its typing. The requirements instead require a save no later than the end of an edit, including when the app goes to the background, and never one per keystroke (32.3). Design may still add a pause-based save.
2. **Length.** 2,000 characters is a page of text, which a week view can't show without truncating. 500 characters is about 80 words, well beyond any real entry (K12).
3. **Edited by.** The data is recorded either way (32.8). Whether a slot shows it is left to design, as DD12 did for grocery rows.

## 6. Survey of Meal-Planning Apps

Checked 2026-10-19 by web search, covering Paprika, AnyList, Plan to Eat, Samsung Food, Mealime, Cozi and Ollie. Some Paprika and Samsung Food help pages couldn't be fetched, so claims from those rest on search-result text and are marked *(snippet)*. Claims that no primary source confirmed are marked *(unverified)*. Mealime has announced that it shuts down on 21 October 2026 ([mealime.com](https://www.mealime.com/)).

**Calendar.** Every date-based app offers a week view with previous and next controls, and lets the user go back to past dates. Paprika has day, week and month views ([help](https://www.paprikaapp.com/help/ios/)). AnyList has week and month views, plus jumping to any month ([calendar](https://help.anylist.com/articles/meal-planning-calendar-bulk-move-copy-recipe/), [Dec 2025 notes](https://help.anylist.com/articles/release-notes-anylist-dec-2025/)). Plan to Eat shows a week or a month, or the previous week, the current week and the next five weeks ([options](https://learn.plantoeat.com/doc/meal-planner-options)). **All three let the user choose the first day of the week.** Mealime has no calendar and keeps no saved plans ([review](https://www.plantoeat.com/blog/2023/04/mealime-app-review-pros-and-cons/)).

**Slots.** Most apps allow more than three fixed slots:
- Paprika has Breakfast, Lunch, Dinner and Snack, plus custom meal types.
- AnyList gives each entry an optional label, or none at all ([labels](https://help.anylist.com/articles/meal-planning-calendar-add-note/)).
- Plan to Eat allows "as many recipes to each mealtime and day as you would like" ([planner](https://learn.plantoeat.com/help/getting-started-using-the-meal-planner)).
- Cozi, Samsung Food and Ollie use breakfast, lunch, dinner and snacks.

**Entry content.** Every app except Mealime takes free text as well as recipes: a Paprika "Note", an AnyList note, a Plan to Eat "Plan Note", or a Cozi meal name ([Cozi](https://www.cozi.com/getting-started-with-new-cozi-web/)). AnyList and Plan to Eat have a Leftovers marker ([AnyList](https://help.anylist.com/articles/meal-plan-leftovers/), [Plan to Eat](https://learn.plantoeat.com/help/app-planning-leftovers)). No app has an eating-out marker; AnyList suggests a note ([getting started](https://help.anylist.com/articles/getting-started/)).

**Time-savers.**
- Paprika and AnyList move and copy entries by drag and drop. Plan to Eat copies, moves or swaps whole date ranges ([edit planner](https://learn.plantoeat.com/help/edit-planner-copy-move-swap-delete-or-save-a-menu-for-multiple-planned-items)).
- Saved menus or templates: AnyList ([templates](https://help.anylist.com/articles/meal-plan-templates/)), Paprika and Plan to Eat. Samsung Food keeps this behind its paid tier.
- AnyList also has pinned entries, a queue of meals without a date, and a "Forgotten Favorites" list ([pinned](https://help.anylist.com/articles/meal-plan-pinned-entries/), [queue](https://help.anylist.com/articles/meal-plan-queue/)).
- None documents a one-tap "copy last week" *(unverified)*.

**Grocery link.** Every app adds to the grocery list from recipe ingredients ([AnyList](https://help.anylist.com/articles/meal-planning-calendar-add-recipe-ingredients/), [Cozi](https://www.cozi.com/meals-and-recipe-box/)). Free-text entries mostly can't. Plan to Eat notes "will not affect your Shopping List" ([notes](https://learn.plantoeat.com/help/app-add-notes-and-ingredients-to-the-planner)), and Paprika notes and Cozi meal names have no documented way. Only AnyList lets a note carry ingredients.

**Sharing.**
- AnyList shares one plan between separate accounts, "instantly visible to everyone", on its paid Household plan ([sharing](https://help.anylist.com/articles/share-recipes-meal-plan/), [features](https://www.anylist.com/features)).
- Plan to Eat says it doesn't "offer an option or multiple logins" ([FAQ](https://learn.plantoeat.com/help/plan-to-eat-faq)). Mealime and Paprika 3 also expect one shared login *(snippet)*. Paprika 4's beta adds a login per user ([news](https://www.paprikaapp.com/news/)).
- Joining a shared Samsung Food plan replaces each member's own plan *(snippet)*.
- No app shows who planned or edited an entry. Plan to Eat suggests writing it in a note ([blog](https://www.plantoeat.com/blog/2019/07/sharing-plan-to-eat-with-your-household/)).
- None documents what happens when two people edit at once *(unverified)*.

**Glanceable surfaces.** AnyList has a tonight's-dinner widget, upcoming-days widgets, a Lock Screen widget and an iCal feed ([widgets](https://help.anylist.com/articles/anylist-widgets/)). Paprika has a Today widget. Plan to Eat has an iCal feed, and Cozi puts meals in its family calendar ([Cozi](https://www.cozi.com/blog/cozi-meal-planner/)). None documents meal reminders *(unverified)*.

**Complaints from reviews:**
- Over-complexity and a focus on diets ([HN](https://news.ycombinator.com/item?id=32316604)).
- Paprika can't share plans between people (same thread).
- Grocery lists that rebuild when the plan changes and lose checked-off items (Mealime, Ollie).
- Slow sync: an Ollie reviewer has to "refresh the list constantly to see their updates" ([App Store](https://apps.apple.com/us/app/ollie-for-meals-meal-planning/id6480014476?see-all=reviews&platform=iphone)).
- Recipe lock-in (Mealime), and paywalls and ads ([Samsung Food](https://www.androidauthority.com/samsung-food-3517054/)).

### What this means for Kitchin

| Finding | Kitchin's choice | Why |
|---|---|---|
| A dated week view with previous, next and today, keeping history, is universal | Adopted (K9, 30, 31) | — |
| A configurable start of the week is common | Monday, fixed (K10) | Both phones must agree, and there's no household settings screen. Entries are stored by date, so the start day is display only and can become a setting later with no data change |
| Flexible or extra slots, such as snacks | Three fixed slots, one entry each (K11) | Matches the legacy app, and one slot's text can name several dishes. Revisit if the household wants a snack slot |
| Free text everywhere; recipes are the main source of complexity and lock-in | Free text only (K12) | The top complaints are complexity and lock-in |
| Leftovers and eating-out markers | Typed as text | No structured field is needed |
| Move, copy, templates and pinned meals | Out of scope this phase | The first candidates for a later iteration, once there's history to reuse |
| The grocery link depends on recipes, and self-rebuilding lists annoy people | A manual Add to groceries shortcut (37, K17) | Keeps one list that the members control |
| Sharing with separate accounts is rare and often paid; no app shows editors or documents conflicts | Two accounts, live sync, last save wins (K15) and editor protection (35.2) | The MVP foundation already does this |
| Slow sync is a common complaint | N1 applies (35.1) | — |
| Widgets and calendar feeds are common | Out of scope | Already excluded app-wide by the MVP |

## 7. Contrast of the Legacy Meal Colours

Measured with WCAG 2.x relative luminance, against white (cards) and the `screen` background (`#faf3ed`). Icons and other graphics need 3:1 (N13).

| Colour | Legacy use in Meals | On white | On screen |
|---|---|---|---|
| desert teal `#3d8b82` | Dinner icon, Monday | 4.03 | 3.66 |
| terracotta `#d16c48` | Breakfast icon, Sunday, Meals tab | 3.53 | 3.21 |
| cactus flower `#ce5a67` | Wednesday | 3.98 | 3.62 |
| night horizon `#2b3a42` | Tuesday | 11.75 | 10.70 |
| sunset blush `#f2a6b3` | Lunch icon, Thursday | 1.93 | 1.76 |
| sagebrush `#aabba1` | Friday | 2.03 | 1.85 |
| pueblo sand `#eed6c4` | Saturday | 1.40 | 1.27 |

The lunch icon in sunset blush fails 3:1, and the Thursday, Friday and Saturday accents are too light to carry meaning. As decoration beside a text label they're acceptable. The icon needs a darker glyph on a blush tint, or similar. Requirement 36.4 states the rule, and design picks the treatment.

## 8. Questions Left for Design

These are listed as Open Items in [1-requirements.md](./1-requirements.md#open-items-for-design-phase), and [2-design.md §1.2](./2-design.md#12-design-decisions) settles them. The main technical unknown was date handling: the app needs today's date in a named IANA time zone (34.1). Design finding 2 covers what Hermes on iOS supports, and the upsert probe is finding 1.
