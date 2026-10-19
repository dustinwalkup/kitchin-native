# Kitchin MVP — Requirements Document

> **Phase 1 of 4** in the EARS spec-driven process: **1-requirements** → 2-design → 3-tasks → 4-test-plan.
> **Status:** Approved by the owner, 2026-10-18.
> **Amendments proposed during design** (approved together with `2-design.md`): 1.7 added, 2.2 changed, 3.9 added, edge cases 20–21 added. See [2-design.md §1.4](./2-design.md#14-requirement-amendments).
> **Amendment proposed during test planning** (approved together with `4-test-plan.md`): edge case 22 added.
> **Amended for meal planning** (approved with `specs/meals/2-design.md`, 2026-10-19): the glossary, 1.5, 11.2, 26.4 and Out of Scope. See [specs/meals/1-requirements.md](../meals/1-requirements.md#amendments-to-the-mvp-requirements).
> **Amended for app deploys** (proposed with `specs/app-deploy/spec.md`, 2026-10-19, awaiting approval): 25.4, 26.9 and Out of Scope. See [specs/app-deploy/spec.md](../app-deploy/spec.md#amendments-to-the-mvp-requirements).

## Introduction

Kitchin is a private iOS app shared by the two members of one household. It keeps one authoritative copy of household data on both phones: groceries first, then meal planning, chores and notes in later phases. It replaces the legacy `kitchin-app` web app, whose sync server could be read and written by anyone, with no authentication.

The MVP is **one shared grocery list on two iPhones**. Either member can add items (typed or via quick-add), check them off, edit quantities, delete items and clear checked items, and the other phone shows the change within about a second. Only the two provisioned accounts have access, and the database enforces that, not the app. The app ships through TestFlight and reports errors to Sentry without personal data. Every pull request runs lint, type checks, tests and database isolation tests.

The MVP also lays the foundation that every later feature reuses: household-scoped data with row-level security, sign-in, live updates, error handling, CI and the deploy pipeline. Meal planning, chores and notes then each become an additive feature with its own `specs/<feature>/` folder.

**Relationship to the existing docs.** `docs/SPEC.md` holds the research, the legacy assessment and the proposed architecture. `docs/TASKS.md` holds a milestone plan. This document restates what the MVP must do as numbered, testable EARS requirements, and leaves *how* to `2-design.md`, which will be distilled from SPEC.md. `3-tasks.md` and `4-test-plan.md` will cite acceptance criteria by number (for example **7.3**) and non-functional requirements by ID (for example **N4**). Where this document refines SPEC.md, see [Differences from SPEC.md](#differences-from-specmd).

### Glossary

| Term | Meaning |
|---|---|
| **Member** | One of the two people who use the app. Every member belongs to a household. |
| **Owner** | The member who administers the project: provisions accounts, holds production credentials, and approves deploys and builds. |
| **Household** | The unit of sharing. Every record of household data belongs to exactly one household. |
| **Household data** | Any record members create or see through the app: grocery lists and items, and meal entries; chores and notes later. *(Amended for meal planning.)* |
| **The app** | The Kitchin iOS app. |
| **The backend** | The Supabase project: Auth, the Data API, Realtime and the Postgres database. |
| **The database** | Postgres, including its grants, row-level security policies, constraints and triggers. A requirement assigned to the database must hold even when someone calls the Data API directly, without the app. |
| **The system** | The app and the backend together. |
| **Open item / checked item** | A grocery item that has not / has been checked off. |
| **Normalized name** | An item name with leading and trailing whitespace removed, compared case-insensitively. |
| **Development / production variant** | The two builds of the app. Development talks only to the local backend; production talks only to the production backend. |

### Scope

**In scope:**

- Email-and-password sign-in for pre-provisioned accounts, sign-out, and a "No household access" state.
- One shared grocery list per household:
  - grouped by category, with counts and overall progress
  - add an item (name, category, optional quantity)
  - quick-add from common items, without duplicates
  - check and uncheck, recording who and when
  - edit quantity, delete, and clear checked items
- Live updates between the two phones, with offline, reconnecting and error states.
- A Settings screen.
- The legacy desert look, in light appearance only.
- Household isolation enforced by the database and proven by automated tests.
- Error reporting that keeps personal data private.
- CI on every pull request, a production database deploy that needs approval, and TestFlight distribution to both phones.

**Out of scope:** see [Out of Scope (MVP)](#out-of-scope-mvp). The main exclusions are meal planning, chores, notes, multiple lists, push notifications, Sign in with Apple, offline-first sync, dark mode, iPad/Android/web layouts, and migrating legacy data.

### Key Decisions

The requirements below depend on these decisions. Each one is a SPEC §16 recommendation that hasn't been approved yet. **Approving this document approves these decisions.** The other §16 decisions are technical: realtime mechanism, server-state library, styling, Expo SDK, environments, region, bundle identifier, repository visibility, backup method and tracing. They will be settled in `2-design.md`.

| # | Decision | Assumed here | SPEC §16 |
|---|---|---|---|
| K1 | Sign-in method | Email + password. The owner creates both accounts. Public sign-up is disabled everywhere | D1 |
| K2 | Rebuild approach | New Expo project. Port constants, copy and visual identity from `kitchin-app`. **No data migrated** (already decided by the owner) | D4 |
| K3 | Grocery layout | One list grouped by category, plus quick-add. The legacy single-category tab view is optional ([Requirement 17](#requirement-17-app--per-device-view-preference-optional)) | D9 |
| K4 | Duplicate items | At most one open item per normalized name per list, enforced by the database | D12 |
| K5 | Household time zone | Each household stores an IANA time zone now, for the date-based features that come later | D13 |
| K6 | Distribution | TestFlight internal testing | D16 |
| K7 | Appearance | Legacy desert palette, light appearance only | D17 |
| K8 | App names | "Kitchin" (production) and "Kitchin Dev" (development) | D6 (names only) |

---

## Requirements

| Area | Requirements |
|---|---|
| Access | 1 App states and routing · 2 Sign in · 3 Session lifetime and sign out |
| Groceries | 4 List view · 5 Add an item · 6 Quick-add · 7 Check and uncheck · 8 Edit quantity · 9 Delete an item · 10 Clear checked items |
| Sync | 11 Live updates between phones · 12 Instant feedback and conflicting changes · 13 Offline and connection states · 14 Error handling |
| App | 15 Settings · 16 Visual identity · 17 Per-device view preference (optional) |
| Data protection | 18 Account policy · 19 Household data isolation · 20 Households and memberships · 21 Grocery data integrity · 22 Realtime authorization · 23 Provisioning |
| Delivery | 24 App variants and environment separation · 25 Secrets and configuration · 26 Error reporting and privacy · 27 Continuous integration · 28 Production database changes · 29 iOS build and distribution |

### Requirement 1: Access — App States and Routing

**User Story:** As a member, I want the app to open straight to the right screen for my sign-in state, so that I never see a flash of the wrong screen.

#### Acceptance Criteria

1. WHILE the app is restoring the saved session at launch, the app SHALL keep the splash screen visible and SHALL NOT render the sign-in screen or any household screen.
2. WHEN there is no valid session THEN the app SHALL show the sign-in screen.
3. WHEN a member is signed in but has no household membership THEN the app SHALL show a "No household access" screen that explains the account isn't linked to a household and offers Sign out, and SHALL NOT request any household data.
4. WHEN a member is signed in and has a household membership THEN the app SHALL show the main tabs, opening on Groceries.
5. The main tabs SHALL be **Groceries**, **Meals** and **Settings**, in that order. *(Amended for meal planning.)*
6. IF a signed-in account has more than one household membership THEN the app SHALL use the oldest membership and SHALL report a warning that contains no personal data ([Requirement 26](#requirement-26-delivery--error-reporting-and-privacy)).
7. IF a member is signed in but the app can't load their membership because the device is offline or the backend can't be reached THEN the app SHALL show a screen saying it can't reach Kitchin, with Retry, and SHALL try again automatically when connectivity returns. *(Added during design.)*

### Requirement 2: Access — Sign In

**User Story:** As a member, I want to sign in once with my email and password, so that I can reach our shared list on my phone.

#### Acceptance Criteria

1. The sign-in screen SHALL provide an email field, a password field and a Sign in button.
2. The email and password fields SHALL support iOS Password AutoFill, so that a member can fill saved credentials from the keyboard's key icon. *(Changed during design: automatic save prompts and app-matched suggestions require an Associated Domain, which is out of scope for the MVP.)*
3. IF the email is empty or not a plausible email address, or the password is empty, THEN the app SHALL prevent submission and show an inline message, without contacting the backend.
4. WHILE a sign-in request is in progress, the app SHALL disable Sign in and show progress.
5. IF the backend rejects the credentials THEN the app SHALL show one generic message (for example "Email or password is incorrect"). The message SHALL be the same for an unknown email and a wrong password.
6. IF sign-in fails because the device is offline or the backend can't be reached THEN the app SHALL say so in a message distinct from the credentials message.
7. WHEN sign-in succeeds THEN the app SHALL route according to [Requirement 1](#requirement-1-access--app-states-and-routing).
8. The app SHALL NOT offer sign-up, password reset, invitations or joining a household. The owner resets passwords in the backend dashboard.

### Requirement 3: Access — Session Lifetime and Sign Out

**User Story:** As a member, I want to stay signed in until I choose to sign out, with my session protected on the phone, so that the app opens quickly and stays safe if the phone is lost.

#### Acceptance Criteria

1. WHEN sign-in succeeds THEN the app SHALL persist the session, so that relaunching the app, including after a force-quit or a reboot, doesn't require signing in again.
2. The app SHALL store the session encrypted at rest, with the encryption key held in the iOS Keychain and readable only while the device is unlocked.
3. WHILE the app is in the foreground, the app SHALL refresh the session automatically before the access token expires. WHILE the app is in the background, it SHALL NOT refresh the session.
4. The app SHALL send session tokens only to the backend, in request authorization headers. It SHALL NOT log them, display them or include them in error reports.
5. WHEN the member chooses Sign out and confirms THEN the app SHALL:
   - revoke the session on the backend
   - clear all cached household data from memory
   - disconnect live updates
   - clear the member's identity from error reporting
   - show the sign-in screen
6. WHEN the session becomes invalid without the member signing out (for example, the owner revoked it, or it can no longer be refreshed) THEN the app SHALL perform the same clean-up as 3.5 and show the sign-in screen with the message "Please sign in again". The app SHALL NOT report this as an error.
7. WHEN one member signs out THEN the other member's session SHALL be unaffected.
8. The owner SHALL be able to revoke all of a member's sessions from the backend dashboard (for a lost or stolen phone). After revocation, the affected device SHALL lose access to household data no later than the expiry of its current access token (at most 1 hour by default).
9. IF the member confirms Sign out but the app can't reach the backend THEN the app SHALL say that signing out needs a connection, and SHALL stay signed in. *(Added during design.)*

### Requirement 4: Groceries — List View

**User Story:** As a member, I want to see our grocery list grouped by store section with what's left, so that I can shop quickly.

#### Acceptance Criteria

1. WHEN a member opens Groceries THEN the app SHALL show the household's list grouped into sections by category, in this fixed order: Produce 🥬, Meat & Fish 🥩, Dairy & Eggs 🥛, Pantry 🥫, Frozen 🧊, Bakery 🍞, Other 🛒.
2. The app SHALL hide sections that contain no items.
3. Each section header SHALL show the category's emoji, its label, and the number of open items in that section.
4. Within a section, the app SHALL list open items before checked items, and SHALL order each group by when the item was added, oldest first.
5. Each item row SHALL show a checkbox, the full item name (wrapping long names rather than truncating them) and the quantity, when the item has one.
6. The app SHALL show a checked item with a checked checkbox, a struck-through name and muted styling, so that colour alone never conveys checked state.
7. The list header SHALL show the number of checked items out of the total, and the progress percentage `round(checked ÷ total × 100)`.
8. WHEN the list has no items THEN the app SHALL show an empty state ("No items yet" / "Add some items to get started") with a way to add an item, and SHALL NOT show a progress percentage.
9. WHILE the list loads for the first time in a session, the app SHALL show placeholder (skeleton) rows, not a blank screen or a full-screen spinner.
10. IF loading the list fails THEN the app SHALL show "Couldn't load groceries" with a Retry action, and SHALL keep showing previously loaded items if there are any.
11. WHEN the member pulls down on the list THEN the app SHALL reload it from the backend.

### Requirement 5: Groceries — Add an Item

**User Story:** As a member, I want to add an item with its category and an optional quantity, so that it lands in the right section of our list.

#### Acceptance Criteria

1. The app SHALL let a member add an item by entering a name (required), choosing a category (required) and optionally entering a quantity.
2. WHEN the typed name matches a common item (6.1) by normalized name THEN the app SHALL preselect that item's category. Otherwise it SHALL preselect Other. The member SHALL be able to change the selection.
3. The app SHALL trim leading and trailing whitespace from the name and the quantity before saving.
4. IF the trimmed name is empty or longer than 200 characters, or the trimmed quantity is longer than 50 characters, THEN the app SHALL show an inline message and SHALL NOT submit.
5. WHEN a valid item is submitted THEN the app SHALL immediately show it as an open item in its category section ([Requirement 12](#requirement-12-sync--instant-feedback-and-conflicting-changes)).
6. IF an open item with the same normalized name is already on the list, in any category, THEN the system SHALL NOT create a second open item, and the app SHALL tell the member it's already on the list instead of showing an error.
7. IF the only items with the same normalized name are checked THEN the system SHALL add the new item as a separate open item.
8. The system SHALL record which member added the item, and when, from the authenticated identity and the server clock.

### Requirement 6: Groceries — Quick-Add

**User Story:** As a member, I want one-tap chips for common items, so that I can build the list quickly without typing.

#### Acceptance Criteria

1. The app SHALL offer quick-add chips for the common items ported from `kitchin-app` (78 items across the 7 categories), grouped by category.
2. IF an open item with a chip's normalized name is on the list THEN the app SHALL show that chip as already added (✓) and disabled.
3. WHEN the member taps an enabled chip THEN the app SHALL add that item to the chip's category as an open item with no quantity, following 5.5–5.8.
4. IF both members quick-add the same item at nearly the same moment THEN exactly one open item with that name SHALL exist afterwards, and neither member SHALL see an error.

### Requirement 7: Groceries — Check and Uncheck

**User Story:** As a member, I want to check items off as I shop, so that we both know what's already in the cart.

#### Acceptance Criteria

1. WHEN a member checks an open item THEN the system SHALL mark it checked and record the time (server clock) and the member who checked it.
2. WHEN a member unchecks a checked item THEN the system SHALL mark it open and clear the recorded time and member.
3. The app SHALL send the intended state (checked or open), not a toggle, so that repeating the action changes nothing further.
4. IF both members check the same item THEN the item SHALL end up checked, with the first member to check it recorded.
5. WHEN an item's state changes THEN the app SHALL move the item to its correct position within its section (4.4).

### Requirement 8: Groceries — Edit Quantity

**User Story:** As a member, I want to change how much of something we need, so that the list stays accurate.

#### Acceptance Criteria

1. The app SHALL let a member set, change or clear the quantity of any item, open or checked.
2. A quantity SHALL be free text (for example "2", "1 lb" or "a dozen") of at most 50 characters after trimming. An empty value SHALL clear the quantity.
3. WHEN the member confirms an edit THEN the app SHALL show the new quantity immediately and save only the quantity.
4. IF both members edit the same item's quantity at about the same time THEN the last save SHALL win, and both phones SHALL end up showing the same value.

### Requirement 9: Groceries — Delete an Item

**User Story:** As a member, I want to remove an item we no longer need, so that the list only shows what matters.

#### Acceptance Criteria

1. The app SHALL let a member delete a single item, without a confirmation step.
2. WHEN a member deletes an item THEN the app SHALL remove it from the list immediately.
3. IF the other member already deleted the item THEN the app SHALL treat the delete as successful and SHALL NOT show an error.

### Requirement 10: Groceries — Clear Checked Items

**User Story:** As a member, I want to clear everything we've bought in one step, so that the list is ready for the next trip.

#### Acceptance Criteria

1. WHILE the list has at least one checked item, the app SHALL offer Clear checked. WHILE it has none, the action SHALL be disabled or hidden.
2. WHEN the member chooses Clear checked THEN the app SHALL ask for confirmation, stating how many items will be removed.
3. WHEN the member confirms THEN the system SHALL delete, in a single operation, every item that is checked at the moment the backend processes the request.
4. IF the other member unchecks an item before the backend processes the request THEN that item SHALL NOT be deleted.
5. WHEN the member cancels THEN nothing SHALL change.

### Requirement 11: Sync — Live Updates Between Phones

**User Story:** As a member, I want changes made on the other phone to show up on mine almost immediately, so that we can shop from one list together.

#### Acceptance Criteria

1. WHEN a change to household data is saved on one phone THEN the other phone SHALL show the change within 2 seconds (target: about 1 second), provided the app is in the foreground and online.
2. Live updates SHALL cover adding, checking, unchecking, editing, deleting and clearing items, and saving and clearing meal slots. *(Amended for meal planning.)*
3. WHEN the app returns to the foreground, regains connectivity, or re-establishes its live-update connection THEN it SHALL reload household data from the backend, so that any changes it missed appear.
4. WHEN many changes arrive together (for example, the other member clears 20 checked items) THEN the app SHALL apply them as one update, not redraw once per item.
5. WHILE a member's own change is being saved, incoming updates for the same list SHALL NOT make that change flicker or temporarily revert.
6. WHILE live updates are unavailable, the app SHALL remain fully usable for reading and writing, and SHALL rely on the reloads in 11.3 to stay correct.

### Requirement 12: Sync — Instant Feedback and Conflicting Changes

**User Story:** As a member, I want my actions to take effect instantly and be undone cleanly if they fail, so that the app feels fast and never shows a false state.

#### Acceptance Criteria

1. WHEN a member adds, checks, unchecks, edits, deletes or clears items THEN the app SHALL show the result immediately, before the backend confirms it.
2. IF the backend rejects the change or the change fails THEN the app SHALL restore the previous state and show a message with Retry.
3. The app SHALL give each new item a unique ID generated on the phone, so that retrying an add can never create a duplicate.
4. The app SHALL send only the fields a member changed, so that two members editing different fields of one item don't overwrite each other.
5. IF a member edits or checks an item that the other member has just deleted THEN the app SHALL remove the item and show "That item was removed on another device".
6. WHEN the backend confirms a change THEN the app SHALL reconcile its display with the backend's data, so that both phones converge on the same state.

### Requirement 13: Sync — Offline and Connection States

**User Story:** As a member, I want to know when my phone is offline or reconnecting, and not lose what I do meanwhile, so that I can trust the list in a store with poor reception.

#### Acceptance Criteria

1. WHILE the device has no network connection, the app SHALL show the banner "Offline — changes will send when you're back online" and SHALL keep showing the last-loaded list.
2. WHILE the device is offline, the app SHALL accept a member's changes, show them immediately (12.1), and hold them for sending.
3. WHEN connectivity returns while the app is still running THEN the app SHALL send the held changes in the order they were made, then reload the list.
4. WHILE the app is in the foreground and its live-update connection has been down for more than 3 seconds, the app SHALL show a small, non-blocking "Reconnecting…" indicator. It SHALL remove the indicator once reconnected.
5. The app SHALL re-establish the live-update connection automatically, without member action.

### Requirement 14: Sync — Error Handling

**User Story:** As a member, I want clear, calm messages when something goes wrong, so that I know whether to retry, wait or sign in again.

#### Acceptance Criteria

1. IF a request fails because the device is offline or the network timed out THEN the app SHALL show the offline banner (13.1) and retry automatically.
2. IF the session can't be refreshed THEN the app SHALL follow 3.6.
3. IF the database denies access to a request THEN the app SHALL show "You don't have access to that".
4. IF the database rejects a value as invalid THEN the app SHALL show an inline message at the relevant field.
5. IF the backend returns an unexpected error THEN the app SHALL show a brief message with Retry.
6. IF a screen fails to render or an unhandled error occurs THEN the app SHALL show "Something went wrong" with Try again in place of the failed screen, without closing the app.
7. IF the backend returns a grocery item whose category the app doesn't recognize THEN the app SHALL show the item in the Other section.
8. IF the backend returns a record that otherwise breaks the app's expectations (for example, a required field is missing) THEN the app SHALL leave it out of the display and report it once ([Requirement 26](#requirement-26-delivery--error-reporting-and-privacy)).
9. Messages shown to members SHALL use plain language and SHALL NOT show error codes or stack traces.

### Requirement 15: App — Settings

**User Story:** As a member, I want a Settings screen that shows who I'm signed in as and which build I'm running, so that I can sign out and report problems accurately.

#### Acceptance Criteria

1. Settings SHALL show the signed-in account's email, the app version and build number, and the environment (development or production).
2. Settings SHALL offer Sign out, and SHALL ask for confirmation before signing out (3.5).
3. WHERE the app is the development variant, Settings SHALL also offer:
   - a theme preview screen that shows every colour token as a labelled swatch
   - a "Send test error" action that sends a test report ([Requirement 26](#requirement-26-delivery--error-reporting-and-privacy))
4. The production variant SHALL NOT include the theme preview or the test-error action.

### Requirement 16: App — Visual Identity

**User Story:** As the owner, I want the new app to keep the desert look of the old one, so that it still feels like Kitchin.

#### Acceptance Criteria

1. The app SHALL use the legacy desert palette with the exact values in SPEC §4.6: desert teal `#3d8b82`, sunset blush `#f2a6b3`, sagebrush `#aabba1`, terracotta clay `#d16c48`, pueblo sand `#eed6c4`, cactus flower `#ce5a67` and night horizon `#2b3a42`, plus the neutrals and category badge colours listed there.
2. The app SHALL present rounded white cards on a warm sand screen background, with thin sage or blush borders.
3. Groceries SHALL use cactus flower for its primary actions and its progress indicator. Terracotta SHALL be reserved for Meals (a later phase).
4. Each category SHALL use its legacy emoji and badge colour pair from SPEC §4.6.
5. The sign-in screen and the app icon SHALL show the Kitchin chef-hat mark on a desert-teal tile.
6. The app SHALL display in light appearance whatever the device's dark-mode setting (K7).
7. Screens and components SHALL take colours only from shared theme tokens and SHALL NOT contain literal colour values. This lets the palette change, or a dark palette be added, without editing components.
8. Text SHALL meet the contrast requirement in N13.

### Requirement 17: App — Per-Device View Preference (Optional)

**User Story:** As a member, I want to switch my own phone to a one-category-at-a-time view, so that I can focus on one aisle without changing the other member's screen.

This requirement applies only if the owner confirms the single-category view for the MVP (K3). **Design decision DD18: not included in the MVP.**

#### Acceptance Criteria

1. WHERE the single-category view is included, the app SHALL let the member switch between the grouped list and a single-category view, which has horizontal category tabs that each show their open-item count.
2. WHERE the single-category view is included, the app SHALL store the chosen view and the selected category on the device only, keep them across app restarts, and SHALL NOT change the other member's view.

### Requirement 18: Data Protection — Account Policy

**User Story:** As the owner, I want only our two accounts to exist, and to be hard to compromise, so that no one else can get in.

#### Acceptance Criteria

1. The backend SHALL have public sign-up disabled in every environment, including the local development stack.
2. The backend SHALL have anonymous sign-in disabled in every environment.
3. The backend SHALL require passwords of at least 12 characters.
4. IF anyone attempts to create an account through the public Auth API THEN the backend SHALL reject the attempt.
5. The production backend SHALL offer only email-and-password sign-in, with every other provider disabled.
6. The system SHALL NOT use user-editable account metadata for any authorization decision.

### Requirement 19: Data Protection — Household Data Isolation

**User Story:** As a member, I want our household's data to be visible to and changeable by only the two of us, so that our lists stay private even though the code is public.

#### Acceptance Criteria

1. The database SHALL associate every record of household data with exactly one household.
2. The database SHALL let a signed-in user read, create, change or delete household data only in households they belong to.
3. The database SHALL deny every operation on household data to unauthenticated callers, both by withholding table privileges and by row-level policy.
4. IF a request would create a record in, or move a record into, a household the caller doesn't belong to THEN the database SHALL reject it.
5. IF a request tries to change a record's ID, household, creation time or creator after the record is created THEN the database SHALL reject it.
6. The database SHALL make it impossible for a record to reference a parent record in a different household (for example, an item pointing at another household's list).
7. The database SHALL set the creator, last-editor and checker fields from the authenticated identity, and ignore any values the client supplies for them.
8. The database SHALL set all timestamps from the server clock and store them with time zone.
9. An account that exists but has no household membership SHALL be unable to read or change any household data.
10. Every table and view exposed through the Data API SHALL enforce the caller's row-level policies. None SHALL grant access to unauthenticated callers.
11. Privileged database functions SHALL NOT be callable through the API by signed-in users or unauthenticated callers.
12. The database SHALL NOT rely on client-supplied claims, client-side filters or hidden UI for authorization.
13. Every protection in this requirement SHALL hold for a caller who bypasses the app and calls the Data API directly with the publishable key and a valid session for any account.

### Requirement 20: Data Protection — Households and Memberships

**User Story:** As the owner, I want household membership controlled only by me, so that no account can add itself to our household.

#### Acceptance Criteria

1. A member SHALL be able to read the membership records (including display names) of their own household, and of no other household.
2. No signed-in user SHALL be able to create, change or delete a membership record through the API.
3. No signed-in user SHALL be able to create or delete a household through the API.
4. A member SHALL be able to change only their household's name and time zone. IF a request changes any other household field THEN the database SHALL reject it.
5. Each household SHALL store a name of 1–100 characters and an IANA time zone, such as `America/Chicago` (K5).
6. Each membership SHALL store a display name of 1–50 characters.
7. The app SHALL contain no code path that creates households or writes memberships.

### Requirement 21: Data Protection — Grocery Data Integrity

**User Story:** As a member, I want the list to stay consistent even when we both change it at once, so that we never end up with duplicates or impossible data.

#### Acceptance Criteria

1. Each household SHALL have exactly one grocery list in the MVP, created when the household is provisioned.
2. The database SHALL reject an item if any of these hold:
   - its trimmed name is empty or longer than 200 characters
   - its quantity is longer than 50 characters
   - its notes are longer than 1,000 characters
   - its category isn't one of `produce`, `meat`, `dairy`, `pantry`, `frozen`, `bakery`, `other`
3. The database SHALL allow at most one open item per normalized name per list. IF a second open item with the same normalized name is created THEN the database SHALL reject it with a uniqueness error, which the app treats as "already on the list" (5.6).
4. WHEN an item's checked state changes THEN the database itself SHALL set or clear the check time and the checking member, whatever the client sends.
5. The database SHALL reject an item that references a list in another household (19.6).

### Requirement 22: Data Protection — Realtime Authorization

**User Story:** As a member, I want live updates about our household to reach only our two phones, so that nothing about our list leaks to anyone else.

#### Acceptance Criteria

1. The backend SHALL deliver live-update events about household data, including deletions, only to signed-in members of that household.
2. IF a signed-in user who isn't a member tries to subscribe to a household's live updates THEN the backend SHALL refuse the subscription.
3. No client SHALL be able to publish events on a household's live-update channel.
4. The production backend SHALL allow only authorized (private) live-update channels.
5. IF a live-update event can't be delivered THEN the write that produced it SHALL still succeed.
6. IF a member's membership is removed THEN they SHALL stop receiving that household's events no later than the expiry of their current access token, or immediately if their sessions are revoked.

### Requirement 23: Data Protection — Provisioning

**User Story:** As the owner, I want to set up our two accounts and our household once from the dashboard, so that no app code and no laptop secret is involved.

#### Acceptance Criteria

1. The owner SHALL be able to create each account in the backend dashboard as an already-confirmed user, without any email being sent.
2. The owner SHALL be able to create a household, its two memberships and its grocery list in one step from the dashboard SQL editor, using a committed template script that contains only placeholders.
3. IF any part of provisioning fails THEN nothing SHALL be created.
4. Provisioning SHALL NOT require a secret key on the owner's laptop. IF the dashboard can't create confirmed users THEN the owner SHALL be able to use a temporary secret key for a single command and delete the key immediately afterwards.
5. Only the database administrator SHALL be able to run the provisioning function. Signed-in users and unauthenticated callers SHALL NOT.
6. The repository SHALL never contain a filled-in provisioning script, real names or real email addresses.

### Requirement 24: Delivery — App Variants and Environment Separation

**User Story:** As the owner, I want development builds that can never touch production data, so that testing can't damage our real list.

#### Acceptance Criteria

1. The project SHALL produce two app variants, **development** ("Kitchin Dev") and **production** ("Kitchin"), with different bundle identifiers so that both can be installed on one device.
2. WHERE the app is the development variant, every screen SHALL show a visible "DEV" badge.
3. IF a development variant is configured with a backend URL that is neither local nor on a private network THEN both the build and the app's startup SHALL fail with a message saying so.
4. IF a production variant is configured with a local or private-network backend URL THEN the build SHALL fail.
5. IF a required public configuration value is missing or malformed THEN the app SHALL fail at startup with a developer-facing message that names the variable but not its value.
6. Production configuration values SHALL be stored only in the build service's production environment and injected at build time.
7. Development SHALL run against a local backend stack whose auth settings match production ([Requirement 18](#requirement-18-data-protection--account-policy)).
8. Development tooling SHALL NOT be linked to the production backend. Only the deploy workflow ([Requirement 28](#requirement-28-delivery--production-database-changes)) SHALL connect to it.
9. Day-to-day development SHALL use local development builds on the iOS Simulator, which consume no cloud build quota.

### Requirement 25: Delivery — Secrets and Configuration

**User Story:** As the owner, I want no private credential ever to ship in the app or land in the public repository, so that publishing the code is safe.

#### Acceptance Criteria

1. The app bundle SHALL contain only values that are public by design: the backend URL, the publishable key, the error-reporting DSN and the environment name.
2. No private credential SHALL appear in the repository, the app bundle, the example environment file, or any variable whose value is bundled into the app. This covers secret keys, the legacy service-role key, database passwords, access tokens and signing keys.
3. WHEN CI runs THEN it SHALL fail if any tracked file contains a secret-key pattern (for example `sb_secret_`, `service_role` or a private-key header).
4. The build-time error-reporting token SHALL be stored only as a secret-visibility variable in the build service, and as a GitHub secret on the `production` environment for uploading update source maps. The database deploy credentials and the build-service token SHALL be stored only as GitHub secrets. *(Amended for app deploys.)*
5. Production credentials SHALL NOT be stored on the development laptop or given to the coding agent.
6. The repository SHALL contain no real names, email addresses or other personal data.
7. The repository SHALL have secret scanning with push protection enabled.

### Requirement 26: Delivery — Error Reporting and Privacy

**User Story:** As the owner, I want crashes and unexpected errors reported without any of our personal data, so that I can fix problems while our lists stay private.

#### Acceptance Criteria

1. The app SHALL report these to the error-reporting service:
   - crashes and render errors
   - access denials from the database
   - values the database rejected as invalid
   - unexpected backend errors
   - invalid records (14.8), once each
   - the multiple-membership warning (1.6)
   - live updates unavailable for more than 2 minutes in the foreground, once per session
2. The app SHALL NOT report offline or network failures (it records a breadcrumb only), expired sessions, duplicate-item rejections, or items removed on another device.
3. A report SHALL contain only:
   - the error category
   - database and API error codes, and the HTTP status
   - table, feature and operation names
   - record IDs
   - the app version and OS version
   - the live-update connection status
   - the member's account ID
4. Reports and breadcrumbs SHALL NOT contain passwords, tokens, API keys, email addresses, display names, household content (item names, quantities, notes, meal entries), request or response bodies, or URL query strings. *(Amended for meal planning.)*
5. As a final safeguard, the app SHALL scrub every outgoing report and breadcrumb for token, key, `Bearer` and email patterns before sending it.
6. The app SHALL NOT capture screenshots, view hierarchies or session replays. In production it SHALL NOT record console output as breadcrumbs.
7. UI test identifiers SHALL be static and SHALL NOT contain household content.
8. The app SHALL NOT send reports from debug builds. Every report SHALL be tagged with the environment (development or production) and the release.
9. Production builds SHALL upload source maps at build time, and over-the-air updates when they're published, so that reported stack traces are readable. *(Amended for app deploys.)*
10. The error-reporting project SHALL have server-side data scrubbing turned on and IP address storage turned off.
11. WHEN a member signs in THEN the app SHALL identify them to error reporting by account ID only. WHEN they sign out THEN the app SHALL clear that identity.

### Requirement 27: Delivery — Continuous Integration

**User Story:** As the owner, I want every change checked automatically before it merges, so that a mistake in code or security policy can't reach our phones.

#### Acceptance Criteria

1. WHEN a pull request is opened or updated, or a commit is pushed to `main`, THEN CI SHALL run lint, the format check, the type check, unit and component tests, and the secrets check (25.3).
2. On the same triggers, CI SHALL apply every migration to an empty database. CI SHALL fail if any of the following occurs:
   - a migration fails to apply
   - the security advisor reports a warning
   - database lint reports an error
   - a database test fails
   - the committed generated types differ from types generated from the migrations
3. CI SHALL fail if any table exposed through the Data API lacks row-level security, or lacks a `household_id` column (except `households` and `household_members`).
4. CI SHALL fail if any of these hold:
   - a row policy applies to unauthenticated callers
   - a row policy is unconditionally true
   - unauthenticated callers hold any table privilege
   - signed-in users hold more privileges than a table needs
5. CI SHALL fail if any privileged (security-definer) function lacks a fixed search path or can be executed by unauthenticated callers, or if signed-in users can execute the provisioning function.
6. CI SHALL run the cross-household isolation tests defined in `4-test-plan.md` as separate test users in two households. These tests SHALL cover every criterion of Requirements 19–22 that can be tested in the database.
7. The `main` branch SHALL require a pull request and passing CI checks before merge, and SHALL block force pushes.
8. Pull requests for dependency updates SHALL be opened automatically each week, for npm packages and GitHub Actions.

### Requirement 28: Delivery — Production Database Changes

**User Story:** As the owner, I want database changes to reach production only after I approve them, so that nothing changes our live data by accident.

#### Acceptance Criteria

1. Schema changes SHALL be made only through versioned migration files in the repository. A migration that has been merged SHALL NOT be edited.
2. Migrations SHALL reach production only through the deploy workflow, run from `main`, after the owner explicitly approves that run.
3. IF the deploy workflow is started from any branch other than `main` THEN it SHALL refuse to run.
4. The deploy workflow SHALL perform a dry run and list the pending migrations before applying them.
5. Every migration SHALL work with the app build currently installed from TestFlight. Removing or renaming a column, or tightening a constraint, SHALL ship in a later migration, once both phones run a build that no longer depends on the old shape.
6. After a deploy, the production security advisor SHALL report no errors.

### Requirement 29: Delivery — iOS Build and Distribution

**User Story:** As a member, I want to install and update Kitchin on my iPhone through TestFlight, so that we both run the same, current build.

#### Acceptance Criteria

1. The cloud build service SHALL produce production builds and submit them to TestFlight, and both members SHALL install them as internal testers (K6).
2. Each production build SHALL receive a build number higher than the previous one, automatically.
3. Each production build SHALL declare that it uses no non-exempt encryption, so that it is never held for export compliance.
4. Each production build SHALL include the privacy-manifest declarations that Apple requires for the APIs it uses.
5. The app icon SHALL be generated from a 1024 × 1024 source image with no transparency.

---

## Non-Functional Requirements

### Performance

- **N1.** A change saved on one phone SHALL appear on the other phone within 2 seconds (target: about 1 second), provided that phone is in the foreground and online (11.1).
- **N2.** A member's own actions SHALL appear on screen without waiting for the network (12.1).
- **N3.** The grocery list SHALL scroll smoothly with at least 300 items on the members' iPhones.

### Reliability

- **N4.** The database SHALL be the only source of truth. Anything the app shows SHALL be replaceable at any moment by reloading from the backend.
- **N5.** Retrying any write SHALL never create a duplicate, and SHALL never produce a different end state from performing the write once.
- **N6.** Live updates SHALL be best-effort. Correctness SHALL come from the reloads in 11.3, not from receiving every event.
- **N7.** A failure to deliver a live-update event SHALL never cause a write to fail (22.5).

### Security & Privacy

- **N8.** The app SHALL communicate only with the backend and the error-reporting service, and SHALL include no analytics or advertising SDKs.
- **N9.** Security SHALL NOT depend on the source code being secret. Requirements 18–23 and 25 SHALL hold while the repository is public.

### Usability & Accessibility

- **N10.** Every control SHALL have a VoiceOver label. Item rows SHALL announce the item name, the quantity and the checked state.
- **N11.** Touch targets SHALL be at least 44 × 44 points.
- **N12.** The app SHALL respect the iOS text size setting, up to the largest standard (non-accessibility) size, without clipping controls or truncating item names.
- **N13.** Text SHALL meet WCAG 2.2 AA contrast: 4.5:1 for regular text, and 3:1 for large text, icons and control boundaries. Palette values SHALL NOT be changed to achieve this (16.1). Instead, the design SHALL choose where each colour may carry text. Measured against the palette:
  - white on desert teal: 4.03:1
  - white on cactus flower: 3.98:1
  - white on terracotta: 3.53:1
  - night horizon at 60 % opacity on white (the legacy secondary text): 3.57:1

  White labels on those brand colours therefore pass only at large sizes, and secondary text needs a darker tint. All seven category badge pairs pass (6.4:1 or better).
- **N14.** The app SHALL respect the iOS Reduce Motion setting.
- **N15.** UI preferences (such as the view in [Requirement 17](#requirement-17-app--per-device-view-preference-optional)) SHALL be stored on each device and never in shared household data. In the legacy app, one member's view toggle changed the other member's screen.

### Maintainability & Extensibility

- **N16.** Adding a household feature (meal planning, chores, notes) SHALL require only additive changes:
  - new tables that follow the household-data conventions, with the standard access policies, triggers and isolation tests
  - a new feature module
  - a new tab

  No existing core table or policy SHALL need to change.
- **N17.** Rules that depend on neither the UI nor the backend SHALL be implemented as pure functions with unit tests. These include grouping, ordering, progress, validation, duplicate detection, error classification and report scrubbing.

### Cost & Operability

- **N18.** At MVP usage, the only recurring cost SHALL be the Apple Developer Program ($99/year). Every other service SHALL run on its free tier.
- **N19.** A new TestFlight build SHALL be shipped at least every 80 days, because TestFlight builds stop opening after 90 days.
- **N20.** Production household data SHALL be recoverable with no more than one month of loss. Design decides how (D11): manual encrypted dumps on the Free plan, or the Pro plan's daily backups.

---

## Assumptions

1. There are exactly two members and one household. Both members use iPhones that meet the Expo SDK's minimum iOS version.
2. The phones are online most of the time. Brief connection losses happen in stores, so the app is online-first, not offline-first.
3. The list stays small: tens to low hundreds of items.
4. Daily use keeps the Free Supabase project from pausing. Free projects pause after 7 days of low activity.
5. The owner enrolls in the Apple Developer Program as an individual. The other member has an Apple Account that can be added to App Store Connect as an internal tester.
6. The Supabase dashboard can create already-confirmed users. If it can't, 23.4 provides a fallback.
7. Both members keep their passwords in a password manager or iCloud Keychain.
8. TestFlight internal testing stays available for a private app that isn't intended for public release. SPEC §14.2 notes this risk; the fallback is ad hoc distribution.

## Constraints

1. The project brief fixes the stack: Expo + React Native + TypeScript (strict) with Expo Router; Supabase (Postgres, Auth, Realtime, RLS); Sentry; GitHub Actions; and EAS Build/Submit to TestFlight. The MVP has no custom backend server and no Edge Functions.
2. iPhone only, in portrait. iPad, Android and web layouts are not built, though Expo keeps Android possible later.
3. The minimum iOS version is whatever the chosen Expo SDK requires (iOS 16.4 for SDK 58).
4. The repository is public (pending D5), and everything committed while it is public stays public.
5. Supabase no longer exposes new tables to the Data API automatically (for all projects from 2026-10-30). Every table needs explicit grants.
6. Free-tier limits apply:
   - Supabase: pausing, no backups, 500 MB of database, Realtime quotas
   - EAS: 15 iOS builds a month, with no overage
   - Sentry: 5,000 errors a month, one seat
   - GitHub Actions: minutes
7. iOS builds do not run on GitHub-hosted macOS runners, which cost about 10× Linux runners. They run on EAS, started from the laptop.
8. TestFlight builds expire after 90 days.
9. The legacy `kitchin` and `kitchin-app` repositories are read-only references and are not modified. The owner shuts down legacy hosting by hand after about two weeks of reliable use (see `docs/TASKS.md`).
10. The coding agent works only against the local backend stack, never against production.

## Edge Cases

1. **Both members add the same item at the same moment** (typed or quick-add). One open item results. The second member sees "already on the list", or nothing (5.6, 6.4).
2. **Names that differ only in case or surrounding spaces** ("milk " and "Milk"). They count as the same item (5.6).
3. **Re-adding an item that's on the list only as checked.** A new open item is added. The checked one stays until it's cleared (5.7).
4. **Both members check the same item.** It stays checked, and the first member to check it is recorded (7.4).
5. **Both members edit the same quantity.** The last save wins, and both phones converge (8.4).
6. **A member edits or checks an item the other member just deleted.** The item disappears with "That item was removed on another device" (12.5).
7. **A member deletes an item that's already been deleted elsewhere.** The delete succeeds silently (9.3).
8. **Clear checked races with the other member unchecking an item.** The unchecked item survives (10.4).
9. **Changes made offline, then the app is force-quit before reconnecting.** Those changes are lost. This is accepted for the MVP (13.3; see Out of Scope).
10. **The phone is in the background while the other member makes changes.** The changes appear when the app returns to the foreground (11.3).
11. **Live updates are down but the API is reachable.** The app works normally and shows "Reconnecting…". Data refreshes on reconnect (11.6, 13.4).
12. **The owner revokes a lost phone's sessions.** That device returns to sign-in at its next session refresh, and its data access ends no later than the expiry of its access token (3.8).
13. **An account exists with no membership.** It sees "No household access" and no data (1.3, 19.9).
14. **An account has two memberships.** The oldest is used, and a warning is reported (1.6).
15. **The backend is paused (Free-tier inactivity) or unreachable.** The list shows a load error with Retry, and the app doesn't crash (4.10).
16. **A newer build has added a category this build doesn't know.** The item appears under Other (14.7).
17. **A name over 200 characters, or only whitespace.** The app blocks it and the database rejects it (5.4, 21.2).
18. **A migration is deployed while an older TestFlight build is installed.** The older build keeps working (28.5).
19. **A production variant is pointed at the local backend, or a development variant at production.** The build or the app's startup fails (24.3, 24.4).
20. **The app is launched with no connection while signed in.** It shows "Can't reach Kitchin" with Retry, and continues on its own once connectivity returns (1.7). *(Added during design.)*
21. **Sign out while offline.** The app says signing out needs a connection and stays signed in (3.9). *(Added during design.)*
22. **Unchecking an item when an open item with the same name exists.** For example, "Milk" was checked and then re-added. The database rejects the uncheck (21.3), so the item stays checked and the app says "Milk is already on the list" (5.6). *(Added during test planning.)*

## Out of Scope (MVP)

These are deferred and SHALL NOT appear in this spec's design, tasks or implementation:

- Chores and notes (Phases 3–4, each with its own spec folder). Meal planning is now in scope under `specs/meals/`. *(Amended for meal planning.)*
- Multiple grocery lists, prices and budgets, and a household "frequent items" list.
- Editing an item's name or category after it's created (delete and re-add instead), and item notes in the UI (the database column exists).
- Push notifications, Sign in with Apple, email codes or magic links, self-service password reset, and Face ID app lock.
- Associated Domains, which iOS needs for automatic password save prompts and app-matched password suggestions. *(Added during design.)*
- Offline-first sync, and keeping unsent changes across app restarts.
- Dark mode (the theme is built so it can be added later), and iPad, Android and web layouts.
- Analytics and home-screen widgets. EAS Update (over-the-air updates) is now in scope under `specs/app-deploy/`. *(Amended for app deploys.)*
- Household invitations, creating or joining households in the app, and roles or permissions between members.
- An activity feed and attachments.
- End-to-end UI tests in CI, and a staging environment (unless design chooses one under D10).
- Migrating any data from the legacy app.

## Success Criteria

1. Both members install Kitchin from TestFlight, sign in with their production accounts, and see the same list.
2. Adding, checking, editing, deleting or clearing items on one phone shows up on the other within about a second.
3. A change made on a phone in airplane mode syncs once connectivity returns.
4. After a force-quit, either phone reopens still signed in with its data intact. Signing out on one phone leaves the other unaffected.
5. In local and CI tests, an account in a second household can't read, change or receive events for the first household's data, and CI proves this on every pull request.
6. A test error reaches Sentry with no email, IP address, token or item text.
7. Only the approved deploy workflow has ever applied migrations to production.
8. The recurring cost is $99/year.

## Differences from SPEC.md

These are the places where this document refines or changes SPEC.md. `2-design.md` should follow this document.

| Topic | SPEC.md / legacy | This document |
|---|---|---|
| Item order within a category | Not specified (the legacy app used database order) | Open items before checked, oldest first (4.4) |
| Empty categories | The legacy app showed every category | Hidden (4.2) |
| Quick-add chip for an item that's only on the list as checked | The legacy app disabled the chip | The chip stays enabled and adds a new open item, matching the database rule (6.2, 5.7) |
| Default category when adding | Not specified | Preselected from the common-items list, otherwise Other (5.2) |
| Category the app doesn't recognize | Skip the row and report it | Show the item under Other (14.7) |
| Accessibility and contrast | Not covered | N10–N14 |
| Sign-out confirmation | Not specified | Required (15.2) |
| Pull to refresh | Not specified | Added (4.11) |
| Revoked sessions | "Return to sign-in" | Also states the remaining window: data access ends when the access token expires, at most about 1 hour (3.8) |

## Open Items for Design Phase

1. The remaining SPEC §16 decisions: D2 realtime mechanism, D3 server-state layer, D5 repository visibility ★, D6 bundle identifier ★, D7 Supabase region ★, D8 styling, D10 environments, D11 backup method (N20), D14 tracing and D15 Expo SDK. (★ = expensive to reverse.)
2. Where the add-item entry and the quick-add chips live (a sheet, an inline field, or both), and how adding several items in a row works.
3. Whether and how item rows show who added or checked an item. Both are recorded (5.8, 7.1).
4. The delete gesture (swipe, a button, or both), and whether delete offers Undo.
5. Which text sizes may use white on teal or cactus under N13, and the darker tint for secondary text.
6. Whether Sign out revokes only this device's session or all of that member's sessions.
