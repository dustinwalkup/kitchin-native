# Kitchin MVP — Implementation Tasks

> **Phase 3 of 4** in the EARS spec-driven process: 1-requirements → 2-design → **3-tasks** → 4-test-plan.
> **Status:** Approved by the owner, 2026-10-18. Amended during test planning, and approved together with `4-test-plan.md`: coverage thresholds (1.2), the security definer lookup helpers (2.2), and the edge case 22 test (4.5).

The tasks are ordered by dependency. Each numbered section is one branch and one PR (CLAUDE.md), and matches a milestone in `docs/TASKS.md`. Each task fits in one focused session. Tests are written with the code, or before it where a task is marked **TDD**. A task is done when its tests pass locally and CI is green.

This list contains only coding work. Owner steps (accounts, dashboards, secrets, Apple, approvals, testing on phones) stay in `docs/TASKS.md`, which remains the owner runbook. The [Owner gates](#owner-gates) table says which owner step must happen before which task. The manual two-device checks belong in `4-test-plan.md`.

**References:**

- `R7.3` is acceptance criterion 7.3 and `N4` is a non-functional requirement, both in [1-requirements.md](./1-requirements.md).
- `§3.5`, `DD15` and `OI-5` are a section, a design decision and an open item in [2-design.md](./2-design.md).

**Sizes:**

| Size | Effort |
|---|---|
| S | Under half a session |
| M | About one session |
| L | A full session; split the task if it grows past that |

---

## Owner gates

| Gate | Owner step in `docs/TASKS.md` | Needed before |
|---|---|---|
| G1 | 0.7: Docker or OrbStack running, Xcode 26.4+ selected, an iOS Simulator runtime installed | Running the app (1.1, 1.8) and the local stack (2.1 onward) |
| G2 | 0.8: bundle-identifier prefix chosen (DD9) | 1.5 |
| G3 | 0.4 and 1.11: **done**. The EAS project `@dustinwalkup/kitchin` exists; 1.5 writes its `owner`, `slug` and `projectId`. Don't run `eas init` | — |
| G4 | 0.3: GitHub CLI signed in | The first PR |
| G5 | 8.9 (moved from 1.14 and 2.10 on 2026-10-18): branch ruleset requiring `app` and `database`. Deferred because the owner commits directly to `main` during the fast-paced development. Secret scanning, push protection and Dependabot alerts are already on | MVP sign-off, after 8.1 |
| G6 | 6.1, 6.2, 6.5: **done**. Org `personal-1yv`, project `kitchin`; the DSN and `SENTRY_AUTH_TOKEN` (Secret) are in EAS `production` | 6.2 |
| G7 | 7.1–7.4: the production project `kitchin` exists (`us-east-2`), its database password is reset, the access token exists, and the GitHub `production` environment has its secrets and variable. Still to do: the Realtime public-access setting in 7.2. The environment's protection rules are deferred to owner step 8.10 (see task 7.1) | Running the workflow from 7.1 (writing it doesn't need the gate) |
| G8 | 7.6–7.9: deploy approved, household provisioned, production EAS variables set | The first production build after 8.1 |
| G9 | "Start now", 8.1 and 8.2: **done**. Apple Developer membership is active, and the owner asked for the placeholder icon (chef hat on desert teal) | 8.1 |

---

## 1. Project foundation (M1)

- [x] **1.1 Scaffold the Expo SDK 58 project** · S
  - Run `npx create-expo-app@latest --template default@sdk-58` in a temporary directory, then move the files into the repo. Merge `.gitignore` rather than overwriting it, and keep `docs/`, `specs/`, `README.md` and `CLAUDE.md`.
  - Run the template's `reset-project`, delete the example screens, and remove `web.output: "server"`. Keep `typedRoutes` and `reactCompiler`.
  - Don't commit the generated `AGENTS.md` or `.claude/settings.json`. Skip them with the template flag, or delete them.
  - Pin Node in `.nvmrc` (22.x, at least 22.13). Set `"strict": true` and the `@/*` → `src/*` alias in `tsconfig.json`.
  - Note whether `react-native-gesture-handler` and `react-native-reanimated` came with the template; add any that are missing with `npx expo install` (OI-10).
  - Done when `npx tsc --noEmit` passes and `npx expo run:ios` opens the empty app in the Simulator (G1).
  - _Requirements: Constraints 1–3, N8_ — _Design: §2.3, DD8, OI-10_

- [x] **1.2 Set up Jest and React Native Testing Library** · S
  - Install the `jest-expo` preset, `@testing-library/react-native` 14 and `expo-router/testing-library`, and add the `test` script.
  - Add one example component test that uses the async API (`await render`, `await fireEvent`).
  - Set the per-path `coverageThreshold` values from 4-test-plan §9 in `jest.config.js`, and run the CI test command with `--coverage`.
  - _Requirements: R27.1_ — _Design: §7_ — _Tests: CI-04_

- [x] **1.3 Add lint, format and import-boundary rules** · S
  - ESLint flat config extending `eslint-config-expo`, plus Prettier. Scripts: `lint`, `format`, `format:check`, `typecheck`.
  - The §2.2 rules:
    - `no-restricted-imports`: no `@/lib/supabase` in `src/app/**` or `**/components/**`, and no React, React Native, Supabase or TanStack imports in `**/domain.ts`.
    - `no-restricted-syntax`: no colour literals outside `src/ui/theme.ts`.
  - A Jest test runs the ESLint Node API over inline fixtures and checks that each rule fires, so a rule can't silently stop working after an upgrade.
  - _Requirements: R16.7, N16, N17_ — _Design: §2.2_

- [x] **1.4 Write the environment guard and validated config (TDD)** · M
  - Write the tests for `src/lib/env-guard.ts` first:
    - `parseVariant`.
    - `assertBackendUrl`:
      - development accepts localhost, 127.0.0.1, the private LAN ranges and `.local` hosts
      - production requires `https://<ref>.supabase.co`
      - production rejects http, private hosts and other domains
    - `assertPublishableKey`:
      - rejects `sb_secret_…`, and any JWT whose role is `service_role` or `supabase_admin`
      - production requires `sb_publishable_`
    - Error messages name the variable and never contain its value.
  - Then `src/lib/env.ts`:
    - It reads the three `EXPO_PUBLIC_*` variables with dot access, and `extra.appVariant` from `expo-constants`.
    - It throws a `ConfigError` at import, and requires the DSN in production.
  - Add `.env.example` with the three names and dummy values.
  - _Requirements: R24.3, R24.4, R24.5, R25.1, R25.2_ — _Design: §3.1, DD22_

- [x] **1.5 Configure the app variants (`app.config.ts`, `eas.json`)** · S
  - `app.config.ts` per §3.1:
    - the variant comes from `APP_VARIANT`
    - `owner: 'dustinwalkup'`, `slug: 'kitchin'` and `extra.eas.projectId` from `docs/TASKS.md` 1.11, the same for both variants
    - name, bundle ID (prefix from G2), scheme and icon are set per variant
    - `orientation: portrait`, `userInterfaceStyle: light`, `supportsTablet: false`, `usesNonExemptEncryption: false`
    - the build-time URL guard warns when the URL is absent and fails when it's wrong
    - `extra.appVariant`
  - Confirm that `app.config.ts` can import `src/lib/env-guard.ts`. If it can't, convert env-guard to CommonJS `.js` with JSDoc types (OI-1).
  - `eas.json` per §3.1: `appVersionSource: remote`; `development` and `production` profiles with `environment` and `APP_VARIANT`; `autoIncrement` and `distribution: store` on production.
  - Placeholder `assets/icon.png`, `assets/icon-dev.png` (with a DEV ribbon) and `assets/splash-icon.png`.
  - Tests:
    - production with a local URL throws
    - development with a local URL produces "Kitchin Dev" and the `.dev` bundle ID
  - _Requirements: R16.6, R24.1, R24.3, R24.4, R24.6, R29.2, R29.3_ — _Design: §3.1, §3.14, DD9, DD22, OI-1_

- [x] **1.6 Port the desert theme with contrast tests (TDD)** · M
  - First, `src/ui/theme.test.ts` checks that:
    - every `TEXT_PAIRS` entry meets its minimum ratio (WCAG relative luminance)
    - each soft tint equals its source colour blended over white at the stated alpha
    - the palette values match SPEC §4.6 exactly
  - Then `src/ui/theme.ts` per §3.10: palette, neutrals, `inkMuted`, `controlBorder`, `onBrand`, soft tints, category badge pairs, radii, spacing, and `{ light, dark }` with dark equal to light.
  - _Requirements: R16.1, R16.4, R16.7, N13_ — _Design: §3.10, DD19_

- [x] **1.7 Build the accessible UI primitives** · M
  - In `src/ui/`:
    - `Text`: iOS text styles, `maxFontSizeMultiplier={2}`
    - `Button`, `Checkbox`, `TextField`, `Chip`, `Banner`, `Pill`
    - `Skeleton`: no shimmer when Reduce Motion is on
    - `Card`, `CategoryBadge`, `LogoTile`, `DevBadge`
    - `Screen`: safe area, screen background, and a slot for the offline banner
  - In `src/lib/toast.tsx`: a provider and `useToast().show({ message, action? })`, with auto-dismiss and `AccessibilityInfo.announceForAccessibility`.
  - Component tests:
    - roles and states (a checked `checkbox`, a disabled chip)
    - every control has a label
    - hit areas are at least 44 pt
    - white-on-brand text is bold
    - `Skeleton` stays static when Reduce Motion is on
  - _Requirements: R16.2, R16.5, N10, N11, N12, N13, N14_ — _Design: §3.10_

- [x] **1.8 Add the route skeleton, DEV badge and theme preview** · S
  - The root `_layout.tsx` gets a provider shell, which section 3 fills in. Plus:
    - a `sign-in.tsx` placeholder
    - `(app)/(tabs)/_layout.tsx` with the Groceries and Settings tabs: SF Symbols `cart.fill` and `gearshape.fill`, bold labels, cactus as the active tint
    - placeholder tab screens
    - `(app)/theme.tsx`, a swatch screen behind `Stack.Protected guard={env.variant === 'development'}`
  - A `DevBadge` overlay in the root layout for the development variant.
  - `renderRouter` tests:
    - the tabs render
    - `/theme` is reachable in development and not in production
    - the DEV badge appears only in development
  - Done when the Simulator shows the placeholder tabs with the DEV badge (G1).
  - _Requirements: R1.5, R15.3, R15.4, R24.2_ — _Design: §2.3, §3.4_

- [x] **1.9 Write the secrets scanner and the CI `app` job** · M
  - Write the tests for `scripts/check-secrets.mjs` first, with fixtures built at runtime:
    - each §3.12 pattern fails the scan
    - prose that mentions "service_role" passes
    - the local anon JWT passes
    - a JWT whose role is `service_role` fails
  - Implement the scanner over `git ls-files`, and add the `check:secrets` script.
  - Add the `app` job to `.github/workflows/ci.yml` per §3.12, with pinned action versions, and add `.github/dependabot.yml` (weekly, for `npm` and `github-actions`).
  - Fill in the "Commands" section of `CLAUDE.md` and the scripts table in `README.md`.
  - Done when the `app` job is green on the PR (then G5).
  - _Requirements: R25.2, R25.3, R27.1, R27.8_ — _Design: §3.12_

## 2. Database foundation (M2)

- [x] **2.1 Add the Supabase CLI and configure the local stack** · S
  - Add `supabase` as a pinned devDependency (2.121.0, or whatever is current then), and run `npx supabase init`.
  - Write `supabase/config.toml` per §4.9:
    - both signup settings off, and anonymous sign-ins off
    - minimum password length 12
    - JWT expiry 3600, with refresh-token rotation
    - `[db.seed] sql_paths`
    - leave `auto_expose_new_tables` unset
  - Done when `npx supabase start` runs locally (G1) and a sign-up request to the local Auth API is refused.
  - _Requirements: R18.1, R18.2, R18.3, R18.4, R24.7_ — _Design: §4.9_

- [x] **2.2 Write the pgTAP test helpers** · S
  - `supabase/seed/00_test_helpers.sql` per §4.9:
    - a `tests` schema with no grants to `anon` or `authenticated`
    - `tests.create_user`: bcrypt password, confirmed, the empty-string token columns GoTrue expects, and an `auth.identities` row
    - `tests.authenticate_as`, `tests.authenticate_as_anon`, `tests.set_topic`
    - the security definer lookups `tests.user_id`, `tests.household_id` and `tests.list_id`, executable by `authenticated` and `anon` (4-test-plan §8.1)
  - A smoke test checks that a created user can be authenticated as, and that `auth.uid()` then returns their ID.
  - _Requirements: R27.6_ — _Design: §4.9, §7_

- [x] **2.3 Write the structural database tests first** · M
  - `supabase/tests/database/00_structure.test.sql`, with every structural check in §7:
    - every `public` table has RLS enabled, and every one except the allowlist has `household_id`
    - no policy applies to `anon` or `public`, and none has a `true` qual
    - `anon` holds no table privilege in `public`
    - `authenticated` holds exactly the §4.4 grants, checked against an expected-privileges table that starts with `households` and `household_members`
    - every definer function in `private` has a fixed `search_path`
    - nothing in `private` is executable by `anon`, and `provision_household` isn't executable by `authenticated`
    - `public` contains no functions, and any views are `security_invoker`
  - These tests fail until 2.4 lands.
  - _Requirements: R19.3, R19.10, R19.11, R23.5, R27.3, R27.4, R27.5_ — _Design: §4.4, §7_

- [x] **2.4 Write the migration `core_households`** · L
  - Create it with `npx supabase migration new core_households`. Contents per §4.3 (first block) and §4.4:
    - the default-privilege revokes and the `private` schema
    - `households`, `household_members` and its index
    - `my_household_ids()`
    - `handle_household_write()` with its trigger
    - `handle_audit_fields()`
    - `provision_household()` without the list insert (DD17)
    - grants, RLS and policies
    - explicit revokes on every function
  - Done when 2.3's structural tests pass.
  - _Requirements: R19.1–R19.8, R19.11, R19.12, R20.1–R20.6, R23.3, R23.5_ — _Design: §3.11, §4.1, §4.3, §4.4, §4.6, DD17_

- [x] **2.5 Seed local users and households** · S
  - `supabase/seed/10_seed_data.sql`:
    - users `member-a` to `member-d` `@example.com`, with local-only throwaway passwords documented in the file
    - households H1 (A and B) and H2 (C), created through `private.provision_household`
    - D gets no membership
  - _Requirements: R25.6_ — _Design: §4.9_

- [x] **2.6 Write behavioural tests for households, memberships and provisioning** · M
  - `10_households.test.sql`:
    - A sees H1 and both H1 memberships, and nothing else.
    - C sees none of H1; D and anon see nothing.
    - A can't insert, update or delete memberships, whether adding themselves to H2 or another user to H1.
    - A can rename H1 and change its time zone; updates to H2 affect 0 rows.
    - Changing `id` or `created_at` fails with `42501`, and an invalid time zone fails with `23514`.
    - Nobody can insert or delete a household.
  - `40_provisioning.test.sql`:
    - an unknown email rolls everything back: no household and no memberships are created
    - mismatched array lengths fail
    - `authenticated` can't execute the function
  - _Requirements: R19.2, R19.3, R19.4, R19.5, R19.9, R20.1–R20.5, R23.3, R23.5_ — _Design: §4.3, §4.6, §7_

- [x] **2.7 Generate types and add the CI `database` job** · S
  - Generate the types with `npx supabase gen types typescript --local > src/types/database.ts`.
  - Add the `database` job to `ci.yml` per §3.12:
    - `npx supabase start -x …`
    - `db advisors --local --type security --fail-on warn`
    - `db lint --local --schema public,private --fail-on error`: only the schemas that ship. The seed-only `tests` lookups name tables that later migrations add, so linting them fails until 4.1 *(owner decision during 2.2)*
    - `test db`
    - the type-drift check
  - Resolve OI-8: if the advisor warns about `private.my_household_ids()`, fix it or record the accepted exception in a migration comment.
  - Done when the `database` job is green (then G5).
  - _Requirements: R27.2, R27.6_ — _Design: §3.12, §1.3 (finding 5), OI-8_

- [x] **2.8 Add the provisioning template script** · S
  - `scripts/provision-household.sql` per §4.6, containing placeholders only.
  - A unit test checks that it contains only `<…>` placeholders and no `@`.
  - _Requirements: R23.2, R23.6, R25.6_ — _Design: §4.6_

## 3. Sign-in and app states (M3)

- [x] **3.1 Write the encrypted session storage (TDD)** · S
  - Write the tests first, with `expo-secure-store`, AsyncStorage and `expo-crypto` mocked:
    - a value round-trips, and every write uses a fresh key
    - the Keychain options include `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
    - a missing key returns `null` and removes both halves
    - plaintext that can't be decrypted, or isn't JSON, returns `null` and cleans up
    - `removeItem` clears both halves
  - Implement `src/lib/secure-session-storage.ts` per §3.2. Install `expo-secure-store`, `expo-crypto`, AsyncStorage and `aes-js`.
  - _Requirements: R3.1, R3.2_ — _Design: §3.2_

- [x] **3.2 Create the Supabase client with foreground-only refresh** · S
  - `src/lib/supabase.ts` per §3.2, typed with the generated `Database`. An AppState listener, registered once from the root layout, starts and stops auto-refresh.
  - Find out whether supabase-js still needs `react-native-url-polyfill` on React Native 0.88 (OI-3).
  - Test: `active` calls `startAutoRefresh`; any other state calls `stopAutoRefresh`.
  - _Requirements: R3.3, R3.4_ — _Design: §3.2, OI-3_

- [x] **3.3 Write the error classification and reporting facade (TDD)** · M
  - Write the tests for `src/lib/errors.ts` first, using fixture error shapes:
    - each of these maps to its §6 category:
      - a network `TypeError` and `AuthRetryableFetchError`
      - `AuthApiError` 400 and 401
      - PostgREST `42501`, and `23505` with each constraint name
      - `23514`, `22001`, `23502` and `23503`
      - `PGRST301`, a 5xx, and an unknown error
    - the constraint name is extracted, and `message`, `details` and `hint` are never kept
    - `isRetryable` and `REPORTABLE` behave as specified
  - Add `src/lib/reporting.ts`: `report`, `reportOnce` (once per app session, by key), `setReportingUser`, and the typed `SafeExtras`. Until 6.2 it only logs, and only in `__DEV__`.
  - _Requirements: R14.1–R14.5, R26.2, R26.3, R26.4_ — _Design: §3.8, §3.9, §6_

- [x] **3.4 Configure the query client, connectivity and focus** · S
  - `src/lib/query-client.ts` per §3.7: NetInfo drives `onlineManager`, and AppState drives `focusManager`. Add `useIsOnline()` and the offline banner inside `Screen`.
  - Tests:
    - going offline shows the banner
    - a focus change refetches a stale query
  - _Requirements: R11.3, R13.1_ — _Design: §3.7_

- [x] **3.5 Write the auth provider (TDD)** · M
  - Write the tests first, with Supabase Auth mocked:
    - `INITIAL_SESSION` resolves `restoring`.
    - Sign-in results map to invalid credentials, offline or server.
    - `SIGNED_OUT` outside a sign-out becomes `signedOut` with reason `expired`.
    - `signOut()` uses `scope: 'local'`. A network error returns `offline` and keeps the session (OI-9).
    - Leaving `signedIn` runs every registered session-end callback, clears the query cache and clears the reporting user.
    - Entering `signedIn` sets the reporting user to the account ID.
  - Implement `src/features/auth/auth-provider.tsx` per §3.3:
    - `onSessionEnd(cb)` registration, which 5.4 uses
    - side effects deferred out of the auth callback
  - _Requirements: R2.5, R2.6, R3.5, R3.6, R3.7, R3.8, R3.9, R26.11_ — _Design: §3.3, DD13, OI-9_

- [ ] **3.6 Write the household provider (TDD)** · M
  - Write the tests first, with the membership API mocked:
    - 0 rows → `none`; 1 row → `ready`
    - 2 rows → `ready` using the oldest, and one `membership_multiple` report
    - paused or a network error → `unreachable`, which recovers once back online
    - `forbidden` or `server` → `unreachable`, and the error is reported
    - no query runs while signed out
  - Implement `src/features/household/api.ts` (the query in §3.3) and `household-provider.tsx`.
  - _Requirements: R1.3, R1.6, R1.7_ — _Design: §3.3_

- [ ] **3.7 Add the root guards, splash and access screens** · M
  - The root `_layout.tsx` gets its providers (query client, toast, auth, household), the `Stack.Protected` guards per §3.3, and the `SplashController`.
  - Screens per §3.4:
    - `sign-in.tsx`: logo tile, autofill attributes, validation, pending state and messages
    - `no-household.tsx`
    - `unreachable.tsx`
  - `renderRouter` tests for every state in §2.4:
    - no flash of the sign-in screen while the session is restoring
    - routing after sign-in
    - "Please sign in again" after the session expires
  - Sign-in form tests:
    - submit stays disabled until the form is valid
    - an unknown email and a wrong password get the same message
    - the offline message
  - Done when, against the local stack, A lands on Groceries, D sees "No household access", and A stays signed in after a relaunch.
  - _Requirements: R1.1–R1.5, R1.7, R2.1–R2.4, R2.7, R2.8, R3.6, R16.5_ — _Design: §2.4, §3.3, §3.4_

- [ ] **3.8 Build the Settings screen** · S
  - Rows:
    - email, version and build (from `expo-application`), and environment
    - Sign out, confirmed with an `Alert`, and the offline message
    - development only: a "Theme preview" link and "Send test error", sent through the reporting facade
  - Component tests:
    - every row renders
    - cancelling the confirmation keeps the member signed in, and confirming calls `signOut`
    - an offline result shows "Signing out needs a connection"
    - the development items are absent in production
  - _Requirements: R3.5, R3.9, R15.1–R15.4_ — _Design: §3.4_

## 4. Grocery list (M4)

- [ ] **4.1 Write the grocery database tests first** · M
  - Extend the expected-grants table in `00_structure.test.sql`: `grocery_lists` gets select only; `grocery_items` gets select, insert, update and delete.
  - `20_grocery_items.test.sql`:
    - Isolation:
      - A reads H1 items only.
      - C's insert with `household_id = H1` fails with `42501`, and C's updates and deletes of H1 items affect 0 rows.
      - A can't move an item to H2, or insert an H1 item that points at an H2 list.
    - Attribution: spoofed `created_by` and `checked_by` values are overwritten.
    - Duplicates: a second open item with the same normalized name fails with `23505`, and succeeds once the first is checked.
    - Validation: untrimmed names, 201-character names and unknown categories fail with `23514`.
    - Checked trigger:
      - checking sets `checked_at` and `checked_by`, and unchecking clears both
      - another member checking it again keeps the first checker
    - Deleting an auth user sets `checked_by` and `created_by` to null without an error. Clear the test's signed-in identity first (reset the role and JWT claims), as GoTrue's account deletion has no `auth.uid()`.
    - A can't set `created_by` to null on an H1 item; it fails with `42501` (owner review of 2.9, 2026-10-18).
    - A can't insert, update or delete `grocery_lists`.
  - _Requirements: R5.6, R5.7, R5.8, R7.1, R7.2, R7.4, R19.2, R19.4–R19.7, R21.1–R21.5_ — _Design: §4.3, §4.4, §7_

- [ ] **4.2 Write the migration `groceries_init`** · M
  - Per §4.3 and §4.4:
    - `grocery_lists` and `grocery_items`, their indexes and the partial unique index
    - `handle_grocery_item_checked()`, with the triggers in order
    - grants, RLS and policies
    - `create or replace provision_household`, now with the list insert
    - `create or replace private.handle_audit_fields()`, tightening its update check. Change the `created_by` clause to `(new.created_by is distinct from old.created_by and (new.created_by is not null or auth.uid() is not null))`. Then only a change with no signed-in user (the `ON DELETE SET NULL` from deleting an account) can clear it, and members can't blank attribution. This comes from the owner's review of 2.9; `core_households` is committed, so it isn't edited.
  - Add a few items per household to `10_seed_data.sql`, and regenerate the types.
  - Done when 4.1 passes and the structural tests stay green.
  - _Requirements: R19.1, R19.6, R21.1–R21.5, R23.2_ — _Design: §4.3, §4.4, §4.6, §5, DD16, DD21_

- [ ] **4.3 Port the grocery constants and write the domain rules (TDD)** · M
  - `constants.ts`: `CATEGORIES` (fixed order, labels, emoji) and the 78 `COMMON_ITEMS`, copied verbatim from `kitchin-app`, plus the empty-state copy.
  - Tests first, then `domain.ts` per §3.5.1:
    - `normalizeName`
    - `charLength`: an emoji counts as one character, as in Postgres
    - `validateItemInput`, `suggestCategory`
    - `hasOpenItemNamed`: ignores case and surrounding whitespace
    - `buildSections`: fixed order; empty sections hidden; open items first, then oldest first, with the id as tie-break
    - `progress`: a `null` percentage when the list is empty, and correct rounding
    - `quickAddGroups`: ✓ only for open matches
    - `parseItemRow`: an unknown category becomes Other and is flagged; a missing field marks the row invalid, naming the field
  - _Requirements: R4.1–R4.4, R4.7, R4.8, R5.2–R5.4, R5.6, R5.7, R6.1, R6.2, R8.2, R14.7, R14.8, N17_ — _Design: §3.5.1_

- [ ] **4.4 Write the grocery API layer** · S
  - `src/features/groceries/api.ts` per §3.5.2, with every error wrapped by `toApiError`.
  - Tests with a stub client:
    - an update that returns zero rows → `not_found`; a delete of zero rows → success
    - clear checked filters on `list_id` and `is_checked`
    - only the changed column is sent
    - raw PostgREST text never appears on a thrown error
  - _Requirements: R9.3, R10.3, R12.4, R12.5, R26.4_ — _Design: §3.5.2, §3.8_

- [ ] **4.5 Write the grocery queries and optimistic mutations (TDD)** · L
  - Write the tests first, with a real `QueryClient` and a mocked `api.ts`:
    - each mutation's result shows immediately
    - a failure reverts only the affected item, and another mutation's change survives; the Retry toast reuses the same ID
    - a duplicate on `grocery_items_one_open_per_name` removes the optimistic row and shows "already on the list"; a duplicate on the primary key counts as success
    - `not_found` removes the item and shows "That item was removed on another device"
    - an uncheck rejected as a duplicate keeps the item checked and shows "already on the list" (edge case 22)
    - mutations in one scope run in order; they pause while `onlineManager` is offline, and resume in order once back online
    - only the last mutation to settle triggers a refetch
  - Implement `hooks.ts` per §3.5.3:
    - the query keys
    - `useGroceryList`: `select` → parse, sections, progress, and an invalid-row report once per row
    - the `useGroceryMutation` factory and the five mutation hooks
  - _Requirements: R5.5, R5.6, R6.3, R6.4, R7.3, R8.3, R8.4, R9.2, R9.3, R10.3, R12.1–R12.6, R13.2, R13.3, R14.8, N2, N5_ — _Design: §3.5.3, DD14, DD15_

- [ ] **4.6 Build the Groceries screen: list, progress and states** · M
  - `groceries.tsx` with:
    - `ProgressHeader`, `CategorySectionHeader`, and a read-only `ItemRow`
    - `SkeletonRows`, `LoadError`, the "Waiting for connection…" state and `GroceriesEmptyState`
    - pull to refresh
  - Component tests, with the hooks mocked:
    - sections appear in order, and empty sections are hidden
    - each section shows its open-count badge
    - checked styling: strikethrough, checkbox state, `inkMuted`
    - the progress text and percentage, with no percentage when empty
    - skeleton rows on the first load
    - an error shows Retry and keeps cached items
    - pull to refresh calls `refetch`
    - `testID`s are static
  - Render 300 items in the Simulator and check that scrolling is smooth (N3).
  - _Requirements: R4.1–R4.11, R13.1, R26.7, N3, N10, N12_ — _Design: §3.4_

- [ ] **4.7 Add the item interactions: check, quantity, delete and clear** · M
  - `ItemRow`:
    - tapping the row checks or unchecks the item
    - a separate quantity button (at least 44 pt) opens the inline `QuantityEditor`; Return or blur saves, and an empty value clears it
    - swiping left deletes, using `ReanimatedSwipeable`
    - the VoiceOver label, plus custom actions "Edit quantity" and "Delete" (OI-13)
  - `ClearCheckedButton`, with an `Alert` confirmation that states the count.
  - Component tests:
    - each interaction calls the right hook with the right variables
    - repeated taps send explicit states, not toggles
    - Clear checked is disabled when nothing is checked, and cancelling changes nothing
    - the accessibility actions fire
  - _Requirements: R7.3, R7.5, R8.1–R8.3, R9.1, R9.2, R10.1, R10.2, R10.5, N10, N11_ — _Design: §3.4, DD11, OI-13_

- [ ] **4.8 Build the add-item sheet and quick-add** · M
  - `(app)/add-item.tsx` as a form sheet, per §3.4:
    - name, category chips, quantity and Add
    - the category follows `suggestCategory` until the member picks one
    - an inline "already on the list" message disables Add
    - after Add, the fields clear, focus returns to Name, and VoiceOver announces the item
    - quick-add chips come from `quickAddGroups`
    - a "＋" button on Groceries opens the sheet
  - Test the form sheet with the keyboard on a device. If it misbehaves, fall back to `presentation: 'modal'` (OI-5).
  - Component tests:
    - validation messages
    - the category suggestion, and a manual pick overriding it
    - the duplicate message
    - adding several items in a row
    - disabled ✓ chips
    - a chip tap adds the item with its category and no quantity
  - _Requirements: R5.1–R5.6, R6.1–R6.3_ — _Design: §3.4, DD10, OI-5_

## 5. Live updates (M5)

- [ ] **5.1 Write the realtime database tests first** · M
  - `30_realtime.test.sql`:
    - Create today's `realtime.messages` partition inside the test if it's missing (OI-7). Then, as `postgres`, insert one broadcast message per household topic.
    - With topic `household:H1`, A sees the H1 message; with `household:H2`, A sees nothing.
    - C sees nothing for H1, and anon sees nothing.
    - There's no INSERT policy for `authenticated`.
  - A failed broadcast never blocks a write: inside the test, rename `realtime.broadcast_changes`, insert an item as A, and check that the insert succeeded.
  - Extend the structural tests: `broadcast_household_change` is a definer function with a fixed `search_path` that `anon` and `authenticated` can't execute.
  - _Requirements: R22.1, R22.2, R22.3, R22.5, N7_ — _Design: §4.5, §7, OI-7_

- [ ] **5.2 Write the migration `realtime_household_broadcast`** · S
  - Per §4.5:
    - `broadcast_household_change()`, with the exception guard
    - `after` triggers on both grocery tables
    - the `realtime.messages` SELECT policy (without `enable row level security` on that table)
  - Done when 5.1 passes.
  - _Requirements: R11.1, R11.2, R22.1–R22.3, R22.5, N7_ — _Design: §4.5, §5_

- [ ] **5.3 Write the event coalescer (TDD)** · S
  - Write the tests first, with fake timers:
    - a burst of events within 150 ms flushes once
    - a continuous stream flushes within 500 ms
    - each table appears once per flush
  - Implement `src/lib/realtime/coalescer.ts`.
  - _Requirements: R11.4, N17_ — _Design: §3.6_

- [ ] **5.4 Write the household channel lifecycle** · M
  - `src/lib/realtime/household-channel.ts` and `useHouseholdRealtime`, per §3.6. Mount the hook in `(app)/_layout.tsx`, and register `stop()` with `onSessionEnd` (from 3.5).
  - Tests with a fake channel:
    - it joins `household:<id>` with `private: true`, after `setAuth()`
    - statuses map as specified
    - `SUBSCRIBED` after a disconnect calls `onResubscribed`
    - becoming active re-creates a channel that isn't joined
    - a session end removes the channel before the cache is cleared
  - Capture a real broadcast payload from the local stack as a fixture, and confirm that the handler reads `table` (OI-4).
  - _Requirements: R3.5, R11.1, R11.3, R11.6, R13.5_ — _Design: §3.6, OI-4_

- [ ] **5.5 Handle grocery events and show connection state** · S
  - `src/features/groceries/realtime.ts` per §3.5.4, wired through the coalescer.
  - `useReconnectingIndicator` (3 s or more, in the foreground), and the pill in `ProgressHeader`.
  - `reportOnce('realtime_degraded')` after 120 s in the foreground.
  - Tests:
    - an event during a pending grocery mutation doesn't invalidate, and the mutation's settle refetches
    - the pill appears after 3 s and hides on reconnect
    - the degraded report fires once, and never in the background
  - _Requirements: R11.4, R11.5, R13.4, R26.1_ — _Design: §3.5.4, §3.6_

- [ ] **5.6 Add a two-simulator launch script** · S
  - `scripts/two-sims.sh` (exposed as an npm script):
    - boots two named simulators with `xcrun simctl` and installs the current development build on both
    - prints how to sign in as A and B
    - prints the `docker` commands that pause and resume the local Realtime container, for the reconnect check
  - _Requirements: R11.1 (supports the manual checks in 4-test-plan)_ — _Design: §7_

## 6. Error reporting (M6)

- [x] **6.1 Write the report scrubber (TDD)** · M
  - Write the tests for `src/lib/sentry-scrub.ts` first, per §3.9:
    - it removes `request`, every user field except the ID, and `server_name`
    - it strips query strings from fetch, XHR and navigation breadcrumbs, and drops console breadcrumbs
    - it redacts these anywhere in the event: JWTs, `sb_publishable_` and `sb_secret_` keys, `apikey=`, `Bearer` tokens and email addresses
    - it redacts exception values that contain Postgres row markers
    - it leaves the allowed fields intact: category, codes, table names and record UUIDs
  - _Requirements: R26.3, R26.4, R26.5_ — _Design: §3.9_

- [x] **6.2 Wire Sentry, error boundaries and reporting** · M
  - Needs gate G6.
  - Setup:
    - `npx expo install @sentry/react-native`, then add the config plugin with the org and project slugs, and `getSentryExpoConfig` in `metro.config.js`
    - `Sentry.init` per §3.9: no wizard, and `sendDefaultPii: false` set explicitly
    - `Sentry.wrap(RootLayout)`
    - use `expoRouterIntegration` only if the installed version exports it (OI-6)
  - Point `src/lib/reporting.ts` at Sentry: `report`, `reportOnce`, and `setReportingUser` (ID only).
  - Export `ErrorBoundary` from the root and `(app)` layouts. Both render `CrashScreen` and capture the error.
  - Tests:
    - the init options match §3.9
    - the reporting facade forwards only `SafeExtras`
    - a tab screen that throws shows `CrashScreen` while the root stays mounted, and Try again re-renders it
  - _Requirements: R14.6, R14.9, R15.3, R26.1, R26.2, R26.6, R26.8, R26.9, R26.11_ — _Design: §3.9, DD7, OI-6_

## 7. Database deploy pipeline (M7)

- [ ] **7.1 Write the production deploy workflow** · S
  - `.github/workflows/deploy-db.yml` per §3.13:
    - the triggers and the `main` guard
    - the `production` environment
    - a dry run, then the push
    - a post-deploy advisors check with `--fail-on error`
    - concurrency control
  - Validate both workflows with `actionlint` in the CI `app` job.
  - Until owner step 8.10 adds required reviewers to the `production` environment, use only the `workflow_dispatch` trigger and leave out the push trigger. Starting the run by hand is then the owner's approval (R28.2). Without this, every migration pushed to `main` would deploy to production unapproved. After 8.10, add the push trigger back per §3.13.
  - Running the workflow needs G7.
  - _Requirements: R24.8, R28.2, R28.3, R28.4, R28.6_ — _Design: §3.13_

## 8. Release build (M8)

- [ ] **8.1 Finish the release assets and App Store settings** · S
  - Needs gate G9.
  - Replace the placeholder icon with the owner's 1024 × 1024 PNG with no alpha channel. If the owner asks, generate a placeholder chef hat on desert teal instead.
  - Add the splash image, confirm `usesNonExemptEncryption` and `autoIncrement`, and add the privacy-manifest reasons from §3.14.
  - Add a small Node test, run in CI, that reads the PNG header and asserts 1024 × 1024 with no alpha channel.
  - _Requirements: R16.5, R29.3, R29.4, R29.5_ — _Design: §3.14, OI-11_

---

## Requirements coverage matrix

| Requirement | Tasks |
|---|---|
| R1 App states and routing | 1.8, 3.6, 3.7 |
| R2 Sign in | 3.5, 3.7 |
| R3 Session lifetime and sign out | 3.1, 3.2, 3.5, 3.8, 5.4, 6.2 |
| R4 List view | 4.3, 4.5, 4.6 |
| R5 Add an item | 4.1, 4.2, 4.3, 4.5, 4.8 |
| R6 Quick-add | 4.3, 4.5, 4.8 |
| R7 Check and uncheck | 4.1, 4.2, 4.5, 4.7 |
| R8 Edit quantity | 4.3, 4.5, 4.7 |
| R9 Delete an item | 4.4, 4.5, 4.7 |
| R10 Clear checked items | 4.4, 4.5, 4.7 |
| R11 Live updates | 3.4, 5.2, 5.3, 5.4, 5.5, 5.6 |
| R12 Instant feedback and conflicts | 4.4, 4.5 |
| R13 Offline and connection states | 3.4, 4.5, 4.6, 5.4, 5.5 |
| R14 Error handling | 3.3, 4.3, 4.5, 6.2 |
| R15 Settings | 1.8, 3.8, 6.2 |
| R16 Visual identity | 1.5, 1.6, 1.7, 3.7, 8.1 |
| R17 View preference (optional) | Not built (DD18) |
| R18 Account policy | 2.1 (local stack); production settings are owner step 7.2 |
| R19 Household data isolation | 2.3, 2.4, 2.6, 4.1, 4.2 |
| R20 Households and memberships | 2.4, 2.6 |
| R21 Grocery data integrity | 4.1, 4.2 |
| R22 Realtime authorization | 5.1, 5.2, 5.4; 22.4 is owner step 7.2 |
| R23 Provisioning | 2.4, 2.6, 2.8, 4.2; 23.1 and 23.4 are owner step 7.7 |
| R24 Variants and environments | 1.4, 1.5, 1.8, 2.1, 7.1 |
| R25 Secrets and configuration | 1.4, 1.9, 2.5, 2.8. 25.4 is owner steps 6.2 and 7.4; 25.5 is a working rule in CLAUDE.md; 25.7 is owner step 1.14 |
| R26 Error reporting and privacy | 3.3, 3.5, 4.4, 4.6, 5.5, 6.1, 6.2; 26.10 is owner step 6.1 |
| R27 Continuous integration | 1.2, 1.9, 2.2, 2.3, 2.6, 2.7, 4.1, 5.1; 27.7 is gate G5 |
| R28 Production database changes | 7.1. 28.1 and 28.5 are working rules in CLAUDE.md |
| R29 iOS build and distribution | 1.5, 8.1; 29.1 is owner steps 8.4–8.7 |
| N1–N3 Performance | 4.5, 4.6, 5.3, 5.5 |
| N4–N7 Reliability | 4.5, 5.1, 5.2, 5.4 |
| N8–N9 Security and privacy | 1.1, 1.9, 2.3, 2.6, 4.1 |
| N10–N14 Accessibility | 1.6, 1.7, 4.6, 4.7, 4.8 |
| N15 Per-device preferences | Nothing to build in the MVP: no preferences are stored (DD18) |
| N16–N17 Maintainability | 1.3, 2.4, 3.3, 4.3, 5.3, 6.1 |
| N18–N20 Cost and operability | No code. N19 (TestFlight refresh) and N20 (backups) are recurring owner tasks in `docs/TASKS.md` |

## Parallelization opportunities

- **Section 1:** 1.1 → 1.2 → 1.3 come first. Then 1.4, 1.6 and 1.9 can run in parallel; 1.5 follows 1.4, 1.7 follows 1.6, and 1.8 follows 1.5 and 1.7.
- **Section 2** can start once 1.1 is done, in parallel with the rest of section 1. It touches only `supabase/`, except 2.7, which edits `ci.yml` after 1.9. Within it, 2.2 and 2.3 are independent, and 2.4 → 2.5 → 2.6 are sequential.
- **Section 3:** 3.1, 3.3 and 3.4 are independent. 3.2 needs 3.1. 3.5 needs 3.2 and 3.3. 3.6 needs 3.4 and 3.5. 3.7 and 3.8 come last.
- **Section 4:** the database track (4.1 → 4.2) and 4.3 run in parallel. 4.4 needs 4.2's types; 4.5 needs 4.3 and 4.4. After 4.5, 4.6 comes first, then 4.7 and 4.8 in parallel.
- **Section 5:** the database track (5.1 → 5.2) and 5.3 run in parallel. 5.4 needs 5.3; 5.5 needs 5.4 and 4.5. 5.6 is independent.
- **Section 6:** 6.1 can be written any time after 3.3, in parallel with sections 4 and 5. 6.2 waits for G6.
- **Sections 7–8:** 7.1 can be written any time after 2.7. 8.1 waits for G9.
