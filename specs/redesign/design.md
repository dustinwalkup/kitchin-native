# Kitchin redesign — design record

The app-wide UX/UI redesign requested by the owner on 2026-10-25: a warm, minimal design system, and new
experiences for Groceries, Meals, the Meal Library and Settings, with the data changes behind them.

The owner asked for the redesign to be implemented directly rather than taken through the four EARS
phases, so this one document records what was built and why. Numbers here are prefixed `R` (`DD-R4`,
task `R3`) so they never collide with the MVP, meals or meal library numbers. Where the redesign changes
an earlier requirement, §9 lists it.

## 1. Scope

- One design system: tokens, a type scale and shared components in `src/ui/` (§2, §3).
- Groceries for one-handed shopping (§4), the weekly planner, the library, the meal form and a new plan
  sheet (§5), and Settings (§7).
- One additive migration, `20261025210237_redesign_meal_types_images.sql`, and a private Storage bucket
  (§6).

Unchanged: authentication, households and RLS, realtime, offline behaviour, the optimistic mutation
lifecycle, sign-out and the week-start setting. Every screen still reads and writes through
`features/<feature>/hooks.ts` → `api.ts`.

## 2. Palette and tokens

`src/ui/theme.ts` is still the only file with colour literals. One accent, terracotta, used for the
active tab, primary actions, selection and today; sage marks completion.

| Token | Value | Use |
|---|---|---|
| `screen` | `#f8f1e9` | The ivory page, and headers |
| `background` | `#fffefc` | Surfaces: rows, groups, sheets' fields |
| `sunken` | `#f0e8de` | Search fields, segmented tracks, photo placeholders, skeletons |
| `ink` | `#29363b` | Text |
| `inkMuted` | `#5f696c` | Secondary text. The brief's `#707a7d` is 3.9:1 on ivory, under 4.5; this one is 4.64:1 on `sunken` too |
| `border` | `#e9e2da` | Dividers and the soft edge of fields and chips |
| `controlBorder` | `#8f867e` | The checkbox outline, its only boundary (3:1) |
| `accent` | `#d96e4d` | Terracotta fills and icons; text only in bold |
| `accentInk` | `#a84d30` | Terracotta text at any weight (4.97:1 on ivory), and terracotta icons on the ivory page, where `accent` is 2.98:1 |
| `accentSoft` | `#faebe6` | Blush: selected chips and tiles, tag pills, Today |
| `sage` | `#6b8a6e` | Checked boxes and the progress bar. Deeper than the brief's `#7e9a80`, which gives a white tick only 3.08:1; this one gives 3.83:1 |
| `sageInk` / `sageSoft` | `#4a6a4e` / `#eaefeb` | "4 left" counts |
| `destructive` | `#b3382a` | Delete and errors, at any weight |
| `breakfast` / `lunch` / `dinner` | terracotta / `#b8862e` / `#5f7f86` | Meal-type glyphs on white |

`TEXT_PAIRS`, `BOUNDARY_PAIRS` and `ICON_PAIRS` list every pairing that carries text or meaning, and
`theme.test.ts` measures each (N13).

- **DD-R1 One accent.** The desert palette gave Groceries cactus and Meals terracotta, and each grocery
  category its own badge colours. The redesign uses terracotta everywhere and tells categories apart by
  emoji, so colour carries meaning, not decoration.
- **DD-R2 Surfaces, not cards.** Content sits on white surfaces on the ivory page, with no border and
  no shadow; the fill is the edge. Lists divide rows with hairlines (`Group`, `Divider`). The only
  shadow is the floating add button's. `Card` remains, borderless, for content that belongs together.
- **DD-R3 Selection by more than colour.** A selected chip or tile has a blush fill, a terracotta edge
  and a semibold terracotta label; a checked item is ticked, struck through and muted.
- **DD-R4 Quiet field edges.** Text fields, search and chips use the soft `border`. Each has a visible
  label or placeholder, so the edge isn't its only identification; the checkbox, whose outline is,
  keeps a 3:1 `controlBorder`. This supersedes N13's boundary rule for text fields.

## 3. Type and components

`Text` variants name roles: `largeTitle`, `title`, `title2` (a day), `headline` (a meal in the library,
a sheet title), `body` (a grocery or planned meal), `callout`, `subhead` (secondary labels), `footnote`,
`caption` (pills and counts) and `eyebrow` (small-caps section headings). A `weight` prop sets
regular, medium, semibold or bold. Text still scales with Dynamic Type up to 2× (N12).

| Component | File | Notes |
|---|---|---|
| `Button` | `ui/button.tsx` | `primary` (terracotta pill), `secondary` (surface, soft edge), `text`; `small`; `destructive` |
| `Chip` | `ui/chip.tsx` | Filters, quick add, tags; optional leading glyph |
| `Checkbox` / `CheckboxMark` | `ui/checkbox.tsx` | 24 pt box, sage when checked |
| `QuantityStepper` | `ui/quantity-stepper.tsx` | "− 2 +", one adjustable element for VoiceOver, or with a field inside |
| `SegmentedControl` | `ui/segmented-control.tsx` | Tabs with selected state |
| `Group`, `Divider`, `SectionHeader` | `ui/group.tsx` | Inset grouped lists |
| `ListRow` | `ui/list-row.tsx` | Label, value, accessory, chevron |
| `TextField`, `SearchField` | `ui/text-field.tsx`, `ui/search-field.tsx` | Labelled field with note, hint and error |
| `EmptyState` | `ui/empty-state.tsx` | Every loading-failed, offline and empty state |
| `SheetHeader` | `ui/sheet-header.tsx` | Cancel or Done, title, terracotta action with busy state |
| `IconButton` | `ui/icon-button.tsx` | 44 pt glyph button |
| `CountBadge` | `ui/count-badge.tsx` | "4 left", "2/3", "Today" |
| `Thumbnail` | `ui/thumbnail.tsx` | `expo-image` photo with a glyph placeholder for loading, missing and failed |

### 3.4 Navigation chrome

Headers sit on the ivory page with no rule, the title centred. The tab bar is white with a hairline;
the active tab is terracotta with a bold label, the others muted. The grocery sheets, the plan sheet
and the meal form draw `SheetHeader` instead of the native header: on iOS 26 the native header wraps a
filled button in a glass capsule, and one header style across every sheet reads as one app.

## 4. Groceries

### 4.1 The list

- A compact panel: "2 of 8 items", the percentage, a slim sage bar, a Hide checked items switch
  stored per device (`useStoredFlag`) and, once something is checked, Uncheck all and Clear checked at
  either end of one row, each confirmed as before (R10).
- Sections by category with an emoji, a chevron and a sage "N left" count ("Done" at zero). Tapping a
  heading collapses it. Sections aren't cards: the heading sits on the page and the rows on one white
  surface with hairlines.
- Rows: the whole row checks; a checked row is ticked, struck through and moved to the section's end.
- Quantity: a quantity that starts with a count (`2`, `2 lbs`, `12 pack`) shows − and +, which step
  only that count and keep the unit (`stepQuantity`). Steps show at once and save 600 ms after the last
  tap, so quick taps never step from a value still on its way to the server. Any other quantity ("a
  bunch", "1.5 kg") is a button that opens the inline editor. No quantity counts as one.
- Swiping left reveals Edit and Delete; VoiceOver has the same actions plus increase and decrease.
- Hidden checked items leave the counts and progress alone, and a "Show N checked items" button closes
  the list.

### 4.2 Adding

The sheet keeps adding until Done (DD10). Name first; right under it a single scrolling row of
suggestions, which stays above the keyboard: popular staples (`POPULAR_ITEMS`) before typing, the
picked category's common items after choosing one, and catalogue matches while typing. Then a quantity
stepper around a field that takes a unit, and the categories as a four-by-two grid of tiles. "Added
Milk" shows under the header after each add. The catalogue is `COMMON_ITEMS` in `constants.ts`, so it
grows without screen changes. An open item with the same name still can't be added twice (R5.6).

### 4.3 Editing

`/edit-item?id=` is the add form, filled in, with Save and a confirmed Delete item. It sends only the
fields that changed (`useEditItem`), optimistically, and a name another open item has is undone and
explained, as when adding.

## 5. Meals

### 5.1 The week

The week arrows and dates sit on the page, with "Back to this week" when another week shows; the week
still starts on the household's day. Each day is one white surface: "Sun Oct 25", Today as a blush
pill and a terracotta edge, a "2/3" count (sage when complete), and a row per meal: the type's glyph
(sunrise, sun, moon), a muted label column, then the meal. Dinner's name is semibold, so the week's
dinners stand out. A meal copied with a description shows its first line, then the rest in muted
footnote. An empty slot is a quieter "Add dinner" with a plus. A meal chosen from the library shows a
34 pt photo when it has one.

### 5.2 The library

Search, then one scrolling row of filters: All, Breakfast, Lunch, Dinner (one at a time), a hairline,
then the tags (any number). Rows show a 56 pt photo or placeholder, the name, the type as a neutral pill
with its glyph, and the tags as blush pills. Rows are divided by hairlines on the page.

- **DD-R6 Meal type is its own field.** `library_meals.meal_type` is breakfast, lunch, dinner or none,
  chosen with three chips in the form. It drives the type filter and the placeholder glyph. It never
  limits planning: the picker defaults to All, so any meal can go in any slot.
- **DD-R7 The old type tags.** Households provisioned before the redesign have Breakfast, Lunch and
  Dinner starter tags. The migration copies a tag into the meal's type where a meal has exactly one of
  them; a meal with two keeps none. The tags and links stay in the database, but the app no longer
  lists them, and typing one as a new tag explains that it's the meal type.
- **DD-R8 Favourites are a tag.** The starter tag Family Favorite leads the tag lists with a heart,
  rather than adding a second favourites system.
- **DD-R9 Wider search.** Search matches the name, then the description, ingredients and tag names;
  name matches come first.

### 5.3 The form

A wide photo area first (tap to take, choose or remove), then Name (required), Meal type, Description,
Ingredients (one per line, stored as before) and Tags, then Delete meal. Optional fields say so.
Validation, counters, discard confirmation, Retry and Save as new meal behave as before (R42–R46).

### 5.4 The plan sheet

Tapping a slot opens `/meal-picker` as a page sheet titled "Sun, Oct 25 · Dinner". It replaces the
inline editor. It shows what's planned, with Remove from plan and, for a library meal, Edit library
meal; then "Choose from library" or "Enter manually".

- Library: Create a new meal, search and filters, Recently used, and every meal. Choosing saves and
  closes. A meal created from here is chosen for the slot when the form saves, and starts with the
  slot's type.
- Manual: the slot's text in a field; Save writes it. Typed text that hasn't been saved asks before the
  sheet closes.
- The sheet opens on Enter manually for a slot holding typed text, otherwise on the library.

- **DD-R10 Planned meals remember their library meal.** `meal_entries.library_meal_id` links an entry
  to the meal it was chosen from. The entry still stores its own copy of the text, so editing or
  deleting the library meal never changes a plan (K19), and editing the plan never changes the meal.
  Typed text always saves with no link. The link gives planned meals their photos and the picker its
  Recently used list. Deleting the meal clears the link.

## 6. Data

One migration, all additive (R28.5), deployable ahead of the build that uses it.

1. **Beverages.** `grocery_items_category_check` gains `beverages`. The installed build files it under
   Other (R14.7).
2. **Library meals.** `meal_type text` (null or one of the three) and `image_path text` (null, or
   `<household id>/<uuid>.(jpg|png|webp)` under the meal's own household), with the backfill of DD-R7.
3. **Starter tags.** `private.add_starter_tags` now creates Quick & Easy, Family Favorite, High Protein
   and Meal Prep.
4. **Plan link.** `meal_entries.library_meal_id uuid`, a composite foreign key to
   `library_meals (id, household_id)` with `on delete set null (library_meal_id)`, and a partial index.
5. **Photos.** The private bucket `meal-images` (5 MB, JPEG, PNG and WebP), with select, insert and
   delete policies on `storage.objects` for members of the household named by the object's first
   folder. The phone resizes a photo to 1200 px and JPEG 75% before upload, uploads it to a key made
   when it was picked (so Retry reuses it), saves the meal, then removes the photo it replaced. Photos
   are shown through one batch of one-hour signed URLs, re-signed after 45 minutes; `expo-image` caches
   them by key. Deleting a meal removes its photo after the row.

pgTAP: `70_redesign.test.sql` (34 assertions) covers all five; `40_provisioning` and `60_meal_library`
follow the new starter tags and link.

## 7. Settings

Inset grouped lists: Account (Signed in as, Sign out), Household (Week starts on, with its note), About
(Version, Environment) and, in development only, Developer tools (Theme preview, Send test error). The
theme preview shows the new tokens, type scale, badges and icons.

## 8. Accessibility

Every icon-only control has a label; rows are single VoiceOver elements with their actions; selection
and expansion are exposed as states; photos are decorative inside rows that name the meal; the
quantity stepper is adjustable. Touch targets stay at 44 pt or more, through slop where a control is
drawn smaller. Text scales to 2×; the meal label column widens with it.

## 9. Superseded requirements

| Earlier | Now |
|---|---|
| R16.1–R16.4, DD19 palette, DD36, DD57 | §2: one accent, new palette, categories by emoji |
| N13 boundary rule for text fields | DD-R4 |
| R32 inline slot editor, R45 picker hand-off | §5.4 plan sheet |
| R47.7 entries never reference meals | DD-R10 link; K19's copy semantics stay |
| R41.2 Filter by tags toggle, K23 name-only search | §5.2 filter row, DD-R9 |
| R43.8 seven starter tags | four (§6.3) |
| R4.1 seven categories | eight, with Beverages |

## 10. Tasks

- [x] R1 Tokens, type scale and shared components (§2, §3)
- [x] R2 Navigation chrome and sheet headers (§3.4)
- [x] R3 Migration, types, seed and pgTAP (§6)
- [x] R4 Groceries list, add and edit sheets (§4)
- [x] R5 Weekly planner and plan sheet (§5.1, §5.4)
- [x] R6 Library, filters, photos and the meal form (§5.2, §5.3)
- [x] R7 Settings, week start, theme preview and sign-in (§7)
- [x] R8 Jest suites updated for the redesign, CI checks green

## 11. Known limitations

- Photos replaced or deleted while offline, or whose removal fails, are left in the bucket unused. A
  periodic clean-up of unreferenced keys would need a server job.
- The installed TestFlight build doesn't send `library_meal_id`; an edit from it keeps an old link
  until the slot is saved again from the new build.
- The local database keeps households seeded before this change; `npx supabase db reset` (once no
  simulator is signed in) reseeds them with the new starter tags and meal types.
