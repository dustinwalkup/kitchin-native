# Kitchin — Implementation Tasks

> **This is now the owner runbook.** The 🤖 steps below are superseded by [`specs/mvp/3-tasks.md`](../specs/mvp/3-tasks.md), which also lists which 👤 step gates which task. The 👤 steps here are still current.

This was the original step-by-step plan for [`SPEC.md`](./SPEC.md).

| Marker | Meaning |
|---|---|
| 👤 | **You.** Manual: accounts, dashboards, Apple, secrets, approvals, testing on real phones |
| 🤖 | **Claude Code.** Code, config, tests, docs, PRs |
| ✅ | **Checkpoint.** Do it together before moving on |

**Ground rules**

- Each milestone is a branch and one or more PRs. You review and merge. CI must be green.
- **Never paste a secret into a Claude Code chat.** When a step needs a secret, you enter it yourself in the relevant dashboard (Supabase, Sentry, GitHub, or expo.dev → project → Environment variables). Claude Code never needs production credentials.
- Values that are *public by design* (Supabase URL, publishable key, Sentry DSN, project ref, org/project slugs) are safe to give Claude Code.
- Real names and emails go only into the Supabase dashboard, never into the repo (it is public, see D5).

**How to start a milestone with Claude Code**

Open this repo in Claude Code and say: *"Implement M<n> from docs/TASKS.md. Stop at each 👤 step and tell me exactly what to do."*

---

## Start now: long lead time

- [x] 👤 **Enroll in the Apple Developer Program.** Approval can take anywhere from hours to several days, and it blocks M8 (TestFlight).
  1. Make sure your Apple ID has two-factor authentication on.
  2. Go to <https://developer.apple.com/programs/enroll/>, enroll as an **Individual**, and pay $99/year.
  3. Wait for the "Welcome to the Apple Developer Program" email. Nothing else in M0–M7 depends on it.

---

## M0: Decisions, accounts and tools

- [x] 👤 **0.1** Read `SPEC.md`, especially §6, §7, §8 and §16. Reply to Claude with "approve all", or with changes to individual decisions (D1–D17).
- [x] 👤 **0.2** Decide repository visibility (D5). The repo is **public** right now. To make it private: GitHub → `kitchin-native` → Settings → General → Danger Zone → Change visibility. Decided 2026-10-18: stay public (DD3).
- [x] 👤 **0.3** Install the GitHub CLI so Claude Code can open PRs for you:
  ```sh
  brew install gh
  gh auth login          # choose GitHub.com → SSH → your existing key → login with browser
  gh auth status
  ```
- [x] 👤 **0.4** Expo account and EAS CLI (CLI updated to 25.2.0 on 2026-10-18):
  1. Create a free account at <https://expo.dev/signup>.
  2. Update the CLI (you have 18.0.5 installed; 25.x is current, and newer commands like `eas env:set` need it):
     ```sh
     npm install -g eas-cli@latest
     eas login
     eas whoami
     ```
- [ ] 👤 **0.5** Create a Supabase account at <https://supabase.com/dashboard>. Use GitHub sign-in or email, and turn on MFA for the account.
  - Create an **organization** on the Free plan.
  - **Don't create the production project yet** (that's M7). Free projects pause after about a week without use, so creating it now could mean it's paused by the time you need it.
- [x] 👤 **0.6** Create a Sentry account at <https://sentry.io/signup/>. The Developer (free) plan is enough. The project itself is set up in M6.
- [x] 👤 **0.7** Check your local tools. Most are already installed:
  - [x] **Docker:** you have both Docker Desktop and OrbStack. Pick **one** to run (OrbStack is lighter), and make sure `docker info` works. The Supabase local stack needs it.
  - [x] **Xcode:** you have two copies (`Xcode.app` and `Xcode-26.5.0.app`). Expo SDK 58 needs **Xcode 26.4+**.
    1. Choose the one to use: `sudo xcode-select -s /Applications/Xcode-26.5.0.app`, or whichever is 26.4 or newer.
    2. Open it once and accept the license.
    3. In Xcode → Settings → Components, install an **iOS Simulator** runtime.
  - [x] **Node:** v22.19.0 is installed, and SDK 58 needs ≥ 22.13 (even-numbered majors only). Claude will pin it in `.nvmrc` during M1.
  - [x] **Watchman** and **CocoaPods** are installed. Nothing to do.
  - [x] **Supabase CLI:** nothing to install. Claude adds it as a project dev dependency, so run it with `npx supabase …`.
- [x] 👤 **0.8** Decide your bundle-identifier prefix (D6, for example `com.dustinwalkup`) and your Supabase region (D7). Both are effectively permanent. Decided 2026-10-18: `com.dustinwalkup`.

---

## M1: Expo + TypeScript foundation (CI from day one)

- [x] 🤖 **1.1** Scaffold the app with `npx create-expo-app@latest --template default@sdk-58` (per D15), then run the template's `npm run reset-project`.
  - Scaffold into a temporary directory and move the files in, because this repo already has `docs/`, `README.md`, `CLAUDE.md` and `.gitignore`.
  - Merge `.gitignore` entries rather than overwriting them.
  - Remove the template's example screens. Routes live in `src/app/`.
  - The default template now also generates `AGENTS.md` and **`.claude/settings.json`**. Use the template's flag to skip them, or delete them. **Don't commit any agent or permissions config without your review.**
  - Remove the web-only config (`web.output: "server"`). Keep `typedRoutes`. Keep `reactCompiler` unless it causes problems.
- [x] 🤖 **1.2** Pin the Node version in `.nvmrc`. Set `"strict": true` in `tsconfig.json` and add the `@/*` → `src/*` alias.
- [x] 🤖 **1.3** Set up tooling and npm scripts:
  - ESLint (`npx expo lint`, flat config) and Prettier
  - scripts: `lint`, `format`, `format:check`, `typecheck`, `test`, `check:secrets`
- [x] 🤖 **1.4** Set up Jest (`jest-expo`) and React Native Testing Library, with one example test.
- [x] 🤖 **1.5** Write `app.config.ts` with app variants:
  - Driven by `APP_VARIANT`: `development` gives bundle ID `<prefix>.kitchin.dev` and the name "Kitchin Dev"; `production` gives `<prefix>.kitchin` and "Kitchin".
  - Add a "DEV" badge component for the development variant.
  - Add the URL guard from SPEC §11: the build refuses a dev variant pointing at a non-local Supabase URL, and vice versa.
- [x] 🤖 **1.6** Write `eas.json` with `development` (dev client, simulator) and `production` profiles, and set each profile's env (`APP_VARIANT`, `EXPO_PUBLIC_APP_ENV`).
- [x] 🤖 **1.7** Port the legacy **desert palette** exactly, per SPEC §4.6: brand colors, neutrals, category badge colors and radii go in `src/ui/theme.ts` as `{ light, dark }`, with light-only for the MVP per D17.
  - Add basic primitives (Screen, Text, Button, TextField, Checkbox, Banner) that use only theme tokens.
  - Add placeholder routes: `sign-in`, `(app)/(tabs)/groceries`, `(app)/(tabs)/settings`.
  - Add a dev-only "Theme" screen showing every token as a swatch, so you can check the colors against the old app.
- [x] 🤖 **1.8** Add `.env.example` (names and dummy values only) and `src/lib/env.ts`, which validates the required `EXPO_PUBLIC_*` variables.
- [x] 🤖 **1.9** Add `.github/workflows/ci.yml` (the `app` job: lint, format check, typecheck, test, secrets check) and `.github/dependabot.yml` (npm + github-actions, weekly).
- [x] 🤖 **1.10** Update the README with how to run the app and the npm scripts. Fill in the "Commands" section of `CLAUDE.md`.
- [x] 👤 **1.11** Link the project to your Expo account. The EAS project already exists: `@dustinwalkup/kitchin`, ID `e7d10c82-e824-4b06-b34e-295b4152a6c5` (created 2026-10-18). In 1.5, Claude sets `owner: "dustinwalkup"`, `slug: "kitchin"` and `extra.eas.projectId` in `app.config.ts`. Keep the slug the same in both variants; only `name` and the bundle ID change. Don't create a second project with `eas init`. If you need to relink, run `eas init --id e7d10c82-e824-4b06-b34e-295b4152a6c5`.
- [ ] 👤 **1.12** Run the app:
  1. Run `npm install`.
  2. Run `npx expo run:ios`. This builds a development build with your local Xcode and opens it in the iOS Simulator. It's free and uses no EAS quota. The first build takes a few minutes.
  3. Check that the placeholder tabs render with the DEV badge.
  4. After that, `npx expo start` is enough until native dependencies change. We don't use Expo Go.
- [ ] 👤 **1.13** Review and merge the PR.
- [x] 👤 **1.14** Turn on GitHub repo protection: Settings → Code security: enable **Dependabot alerts**, **Secret scanning** and **Push protection**. Done 2026-10-18 (Dependabot security updates are on too).
  - The branch ruleset is deferred to 8.9 (owner decision, 2026-10-18): during the fast-paced development the owner commits directly to `main`. CI still runs on every push to `main`.
- [ ] ✅ **Checkpoint:** the app runs in the Simulator, and CI is green.

---

## M2: Supabase foundation (local stack, core schema, RLS, tests)

- [x] 🤖 **2.1** Add the `supabase` CLI as a dev dependency (pinned) and run `npx supabase init`.
  - In `supabase/config.toml`: `[auth] enable_signup = false` and `[auth.email] enable_signup = false`, anonymous sign-ins disabled, minimum password length 12.
  - Leave the deprecated `auto_expose_new_tables` unset; tables must be granted explicitly (SPEC §7.1).
- [x] 🤖 **2.2** Write the migration `core_households`:
  - `private` schema with revoked grants
  - `households`, `household_members`
  - `private.my_household_ids()`, `private.handle_audit_fields()`, `private.provision_household(...)`
  - explicit grants to `authenticated` only, plus RLS and policies per SPEC §7.3
- [x] 🤖 **2.3** Write `supabase/seed.sql` (local only):
  - users A and B in Household 1, user C in Household 2, user D with **no** household
  - local-only throwaway passwords
- [x] 🤖 **2.4** Write the pgTAP tests: hand-written test helpers in `supabase/tests/`, the structural tests (RLS, `household_id`, grants, function security) and the core-table behavioral tests from SPEC §10.2.
- [ ] 🤖 **2.5** Generate `src/types/database.ts`. Add `src/lib/supabase.ts` (client using the publishable key from env), and a `.env.local` template pointing at the local stack (`.env.local` itself is gitignored).
- [x] 🤖 **2.6** Add the `database` job to `ci.yml`: `supabase db start`, `db advisors --type security`, `db lint`, `test db`, and the types-drift check.
- [x] 🤖 **2.7** Write `scripts/provision-household.sql`, a template with `<EMAIL_1>`-style placeholders. You fill it in inside the dashboard SQL editor in M7. It never contains real values in the repo.
- [x] 👤 **2.8** Try the stack locally (optional but useful):
  1. Make sure Docker/OrbStack is running.
  2. Run `npx supabase start`.
  3. Open Studio at the URL it prints (usually <http://127.0.0.1:54323>) and look at the tables.
  4. Run `npx supabase stop` when you're done.
- [ ] 👤 **2.9** Review the SQL PR carefully. This is the most security-critical code in the project, so ask Claude to explain any policy you're unsure about. Then merge.
- [x] 👤 **2.10** ~~Add `database` to the required status checks in the `main` ruleset.~~ Moved to 8.9, along with the rest of the ruleset.
- [ ] ✅ **Checkpoint:** `npx supabase test db` passes locally and in CI, and the negative tests (user C can't see or modify Household 1) are present and passing.

---

## M3: Authentication

- [ ] 🤖 **3.1** Session storage and refresh:
  - secure session storage adapter (Keychain via `expo-secure-store`, per SPEC §3/§6.3)
  - Supabase client auth options: `detectSessionInUrl: false`, persist, auto-refresh
  - AppState start/stop of auto-refresh
- [ ] 🤖 **3.2** Auth state and routing:
  - `AuthProvider` (session + `onAuthStateChange`) and `HouseholdProvider` (membership lookup)
  - Root `Stack.Protected` guards for: loading → splash, signed out → `sign-in`, no household → `no-household`, otherwise → `(app)`
- [ ] 🤖 **3.3** Screens:
  - Sign-in screen: email + password, iOS autofill (`textContentType`/`autoComplete`), submit disabled while pending, and friendly errors that don't reveal whether an email exists.
  - `no-household` screen with a sign-out button.
  - Settings screen showing the signed-in email, the app version and environment, and a sign-out button that clears the query cache and channels.
- [ ] 🤖 **3.4** Unit tests for the auth/household state transitions and sign-in form validation.
- [ ] 👤 **3.5** Try it on the Simulator with the local stack running. Use the seed credentials, which are documented in `seed.sql`:
  - [ ] sign in as **A**: lands on Groceries (still a placeholder)
  - [ ] sign out, then sign in as **D**: sees "No household access"
  - [ ] a wrong password shows a friendly error
  - [ ] kill and relaunch the app: you're still signed in
- [ ] 👤 **3.6** Review and merge.

---

## M4: Grocery list workflow

- [ ] 🤖 **4.1** Write the migration `groceries_init`:
  - `grocery_lists` and `grocery_items` per SPEC §5.4: composite FK, CHECKs, partial unique index, audit + checked triggers, template policies
  - `provision_household` now also creates the default list
  - seed lists and items for H1/H2
- [ ] 🤖 **4.2** Add pgTAP isolation tests for both grocery tables (SPEC §10.2 #1–11) and regenerate types.
- [ ] 🤖 **4.3** Port the legacy constants: `CATEGORIES` (labels + emoji), `COMMON_ITEMS`, and the copy.
- [ ] 🤖 **4.4** Data layer:
  - `src/lib/errors.ts`, mapping errors to the categories in SPEC §9.1
  - `src/lib/query-client.ts`, wiring TanStack Query to NetInfo (`onlineManager`) and AppState (`focusManager`)
- [ ] 🤖 **4.5** In `src/features/groceries/`, write `api.ts` and `hooks.ts`:
  - list query
  - add, check/uncheck, edit quantity, delete and clear-checked mutations, all optimistic with rollback
  - client UUIDs
  - `23505` treated as "already on the list"; 0-row updates treated as "removed elsewhere"
- [ ] 🤖 **4.6** Build the UI per D9:
  - category-sectioned list with counts and a progress header
  - add-item sheet (name, category picker, quantity) and quick-add chips with de-duplication
  - item row: checkbox, quantity edit, swipe or button to delete; "Clear checked" with confirmation
  - empty, skeleton, error + retry, and offline-banner states
- [ ] 🤖 **4.7** Unit tests for `domain.ts` and component tests for add, check, delete and rollback-on-failure.
- [ ] 👤 **4.8** Use it on the Simulator for a few minutes as user A, then give UX feedback. Claude iterates.
- [ ] 👤 **4.9** Review and merge.

---

## M5: Realtime

- [ ] 🤖 **5.1** Write the migration `realtime_household_broadcast`:
  - `private.broadcast_household_change()`, attached to `grocery_lists` and `grocery_items`
  - the `realtime.messages` SELECT policy for `household:<id>` topics
  - pgTAP tests for that policy (SPEC §10.2 #12)
- [ ] 🤖 **5.2** Write `src/lib/realtime/household-channel.ts`:
  - private channel, auth token, and status tracking
  - coalesced invalidation, deferred while mutations are pending
  - refetch on resubscribe and when the app returns to the foreground
  - "Reconnecting…" pill
- [ ] 🤖 **5.3** Unit tests for coalescing, deferral and the status-to-UI mapping.
- [ ] 🤖 **5.4** Write a short script or doc for running the app on **two simulators at once**, for example an iPhone and an iPad simulator, or two iPhone models.
- [ ] ✅ **5.5** Two-simulator test against the local stack. Sign in as **A** on one simulator and **B** on the other, then check:
  - [ ] Add on A → appears on B within about 1 second, and vice versa
  - [ ] Check/uncheck, quantity edit, delete and "clear checked" all propagate
  - [ ] Both quick-add the same item at nearly the same time → only one copy exists
  - [ ] Send B to the home screen, make 3 changes on A, wait 1 minute, reopen B → B shows all changes
  - [ ] Stop realtime briefly (Claude will give you the `docker` command) → the "Reconnecting…" pill shows → restart → it recovers and refetches
  - [ ] Sign in as **C** on a simulator → sees none of Household 1's items or events
- [ ] 👤 **5.6** Review and merge.

---

## M6: Sentry

- [ ] 👤 **6.1** In Sentry. Steps 1–3 done 2026-10-18 through the API: org `personal-1yv` (US region), team `personal`, project `kitchin`. Only step 4 remains.
  1. **Create Project** → platform **React Native** → name `kitchin`.
  2. Note the **DSN** (public, OK to share with Claude), the **organization slug** and the **project slug**.
  3. Project Settings → **Security & Privacy**: turn on **Data Scrubber** and **Use Default Scrubbers**, and turn on **Prevent Storing of IP Addresses**.
  4. Settings → **Auth Tokens** → create an **Organization Token**, used for uploading source maps at build time. Copy it, but don't share it.
- [ ] 👤 **6.2** Store the Sentry token as an EAS secret. **Enter it yourself on the website**, so it never lands in shell history:
  1. Go to <https://expo.dev> → your `kitchin` project → **Environment variables** → **Add variable**.
  2. Name: `SENTRY_AUTH_TOKEN`. Environment: **production**. Visibility: **Secret**. Paste the token and save.
- [ ] 🤖 **6.3** Install and configure Sentry **by hand. Don't use `@sentry/wizard`**, because it can write the auth token into files:
  - install `@sentry/react-native` (`npx expo install`), the `@sentry/react-native/expo` config plugin (org/project slugs) and `getSentryExpoConfig` in the Metro config
  - `Sentry.expoRouterIntegration()`; `sendDefaultPii: false` set explicitly
  - `Sentry.init` with the SPEC §9.2 settings; `beforeSend`/`beforeBreadcrumb` scrubbers
  - root and `(app)` error boundaries
  - `setUser({ id })` on sign-in, cleared on sign-out
  - a dev-only "Send test error" button in Settings
- [ ] 🤖 **6.4** Unit tests proving the scrubber removes JWTs, `apikey`/`Authorization` headers, query strings, emails and item names from events and breadcrumbs.
- [x] 👤 **6.5** Send the DSN to Claude. It's public, so Claude can put it in `.env.local` and run (done 2026-10-18: `EXPO_PUBLIC_SENTRY_DSN` is in EAS `production`):
  ```sh
  eas env:set --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --environment production --visibility plaintext
  ```
- [ ] ✅ **6.6** Test a real error report:
  1. Sentry is disabled in `__DEV__`, so build a **release-mode** simulator build: `npx expo run:ios --configuration Release`.
  2. Tap "Send test error".
  3. Open the event in Sentry and confirm it has **no** email, IP address, token, or grocery item text.
- [ ] 👤 **6.7** Review and merge.

---

## M7: Production environment and database deploy pipeline

- [x] 👤 **7.1** Create the production Supabase project. **Created 2026-10-18** by Claude with the CLI, at your request:
  - Name `kitchin`, Free plan, Postgres 17, region **East US (Ohio)**, `us-east-2` (D7: central US; Supabase has no central-US region).
  - Project ref: `kbctrdoinofseiventai`.
  - [x] **Remaining:** reset the database password so only you know it. Done 2026-10-18. Claude set a random one it never displayed. Go to <https://supabase.com/dashboard/project/kbctrdoinofseiventai/database/settings> → **Reset database password** → **Generate a password**, then save it in your password manager as "kitchin DB password". Don't share it with Claude.
- [x] 👤 **7.2** Configure Auth in Dashboard → **Authentication**:
  - [x] Sign In / Providers → turn **off** "Allow new users to sign up"
  - [x] Turn **off** anonymous sign-ins
  - [x] Keep the **Email** provider enabled. Password requirements: minimum length **12**.
  - [x] Leave the other providers disabled.
  - [x] Dashboard → **Realtime** → Settings → turn **off "Allow public access"**, so only authorized private channels work. Direct link: <https://supabase.com/dashboard/project/kbctrdoinofseiventai/realtime/settings>.
- [x] 👤 **7.3** Create a Supabase **personal access token** for CI: Dashboard → Account (top right) → **Access Tokens** → Generate. Name it `github-actions-kitchin` and copy it, but don't share it. If the dashboard offers scoping, limit it to this project with the least access needed.
- [x] 👤 **7.4** Set up GitHub so the deploy workflow can reach production. Which steps you follow depends on D5. Done 2026-10-18 (public repo), except the two protection rules, which are deferred to 8.10.
  - **If the repo is public:** repo → Settings → **Environments** → **New environment** → `production`.
    - ~~**Required reviewers:** add yourself.~~ Deferred to 8.10.
    - ~~**Deployment branches:** Selected branches → `main`.~~ Deferred to 8.10.
    - **Environment secrets:** `SUPABASE_ACCESS_TOKEN` (from 7.3) and `SUPABASE_DB_PASSWORD` (from 7.1).
    - **Environment variables:** `SUPABASE_PROJECT_ID`, set to the project ref from 7.1.
  - **If the repo is private (GitHub Free):** environments aren't available.
    - Add the same two values as **repository** secrets: Settings → Secrets and variables → Actions.
    - Add `SUPABASE_PROJECT_ID` as a repository variable.
    - Tell Claude, and the workflow will be **manual-trigger only** (SPEC §10.3).
- [ ] 🤖 **7.5** Add `.github/workflows/deploy-db.yml` (SPEC §10.3).
- [ ] 👤 **7.6** Merge, then start the deploy:
  - **Until 8.10:** the workflow is manual-trigger only, so go to Actions → "Deploy database" → **Run workflow** on `main`. Starting it yourself is the approval (R28.2).
  - **After 8.10:** go to Actions → "Deploy database" → **Review deployments** → approve.

  Then check that the tables exist in Dashboard → Table Editor.
- [ ] 👤 **7.7** Provision the two accounts and the household:
  1. Dashboard → Authentication → **Users** → **Add user** → **Create new user**. Enter your email and a generated password, and tick **Auto Confirm User**. Repeat for your wife's account, and save both passwords in your password managers.
     - **Don't use "Send invitation".** Invited users start unconfirmed, and with signups disabled they can't finish signing in.
     - If there's no auto-confirm option, tell Claude, and use the temporary-secret-key fallback in SPEC §6.2. Delete the key afterwards.
  2. Dashboard → **SQL Editor**: paste `scripts/provision-household.sql`, replace the placeholders with your household name, time zone (for example `America/Chicago`), both emails and display names, and run it. **Don't commit the filled-in version.**
  3. Check in Table Editor that `households` has 1 row, `household_members` has 2, and `grocery_lists` has 1.
- [x] 👤 **7.8** Add the production app config to EAS. These values are public, so you can also give them to Claude to run. Done 2026-10-18 by Claude: both variables are in `production` only, and `development` has none.
  1. Get the **Project URL** and the **publishable key** from Dashboard → Project Settings → **API Keys**. Use the publishable key, **never** the secret or `service_role` key.
  2. Store them in the **production** environment only:
     ```sh
     eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production --visibility plaintext
     eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable key> --environment production --visibility plaintext
     ```
  3. Don't use `eas integrations:supabase:connect`. It writes these values to *every* environment, including development.
- [ ] 👤 **7.9** Dashboard → **Advisors → Security Advisor**: there should be no errors. Show any warnings to Claude.
- [ ] ✅ **Checkpoint:** production schema deployed through CI only, and the household provisioned.

---

## M8: TestFlight

- [x] 👤 **8.1** Confirm your Apple Developer membership is active: <https://developer.apple.com/account> shows "Apple Developer Program".
- [ ] 👤 **8.2** App icon: provide a **1024×1024 PNG** with no transparency, or ask Claude for a simple placeholder (chef hat on desert teal). The legacy 180×180 icon is too small.
- [ ] 🤖 **8.3** Production build config:
  - icon and splash
  - `ios.config.usesNonExemptEncryption: false`. This writes `ITSAppUsesNonExemptEncryption`; the app uses only standard OS HTTPS. Without it, every build shows "Missing Compliance".
  - `ios.privacyManifests` with the required-reason API declarations (Apple emails you after upload if any are missing; forward that email to Claude)
  - `autoIncrement` build numbers in `eas.json`; `distribution: "store"` on the production profile
  - `ios.bundleIdentifier` per D6
- [ ] 👤 **8.4** First production build. This step is interactive, so run it yourself:
  ```sh
  eas build --platform ios --profile production
  ```
  When prompted, log in with your Apple ID and let EAS **create** the bundle identifier, distribution certificate and provisioning profile.
- [ ] 👤 **8.5** Submit it to TestFlight:
  ```sh
  eas submit --platform ios --latest
  ```
  - Let EAS create the **App Store Connect app record** and an **App Store Connect API key**. Only the Account Holder or an Admin can create that key, and you are the Account Holder.
  - Processing takes about 5–15 minutes. Internal builds don't need Beta App Review.
  - Next time, `eas build --platform ios --profile production --auto-submit` does both steps.
- [ ] 👤 **8.6** Add your wife as an internal tester:
  1. App Store Connect → **Users and Access** → **+** → invite her Apple Account email with the **Marketing** role.
     - Internal testers must be App Store Connect users with Account Holder, Admin, App Manager, Developer or Marketing roles.
     - Marketing is the least-privileged of those.
     - Managed Apple Accounts can't be testers.
  2. She accepts the email invite.
  3. App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** → create the group "Household", add both of you, and enable automatic distribution.
- [ ] 👤 **8.7** On both iPhones, install **TestFlight** from the App Store, open the invite, and install **Kitchin**. Sign in with your production accounts.
- [ ] ✅ **8.8** Two-phone acceptance test on production:
  - [ ] Both see the same empty list. Add 5 items on phone 1 → they appear on phone 2 within about 1 second
  - [ ] Check, edit, delete and clear on phone 2 → reflected on phone 1
  - [ ] Airplane mode on phone 1 → offline banner → make one change → airplane mode off → the change syncs
  - [ ] Force-quit and reopen both phones → still signed in, data intact
  - [ ] Sign out on one phone → back to sign-in; the other phone is unaffected
  - [ ] Sentry shows no unexpected errors
- [ ] 👤 **8.9** Turn on the `main` branch ruleset (deferred from 1.14 and 2.10 until the fast-paced development is over; R27.7). After this, changes go through PRs.
  1. Settings → Rules → Rulesets → **New branch ruleset**:
     - Name: "main"
     - Enforcement: Active
     - Target: default branch
     - Enable **Require a pull request before merging** (0 approvals is fine when it's just you)
     - Enable **Require status checks to pass** and add `app` and `database`
     - Keep **Restrict deletions** and **Block force pushes** enabled
- [ ] 👤 **8.10** Turn on the `production` environment's protection rules (deferred from 7.4 until the fast-paced development is over; R28.2, R28.3). Then tell Claude, so it can add the push trigger back to `deploy-db.yml`.
  1. Settings → Environments → `production`.
  2. Tick **Required reviewers**, add yourself, leave **Prevent self-review** unticked, and click **Save protection rules**.
  3. **Deployment branches and tags** → **Selected branches and tags** → **Add deployment branch or tag rule** → Branch `main` → **Add rule**.
- [ ] 🎉 **MVP done.** Use it for a couple of weeks before starting Phase 2.

---

## After the MVP

| Phase | Feature | Process |
|---|---|---|
| 2 | Meal planning (date-based) | Follow SPEC Appendix B. Claude implements; you do the two-phone check, approve the DB deploy, and run the TestFlight build |
| 3 | Chores / tasks | same |
| 4 | Notes (with conflict detection) | same |
| later | Push notifications, Sign in with Apple linking, Face ID lock, EAS Update, widget | Each needs its own mini-spec and approval first |

---

## Recurring maintenance

- [ ] 👤 **Every ~80 days:** ship a new TestFlight build. Builds expire after 90 days, and an expired build stops opening. Run `eas build --platform ios --profile production --auto-submit`.
  - At the same time, renew the Supabase access token `github-actions-kitchin` (created 2026-10-18 with a 90-day expiry): generate a new one, overwrite `SUPABASE_ACCESS_TOKEN` in GitHub → Settings → Environments → `production`, then delete the old token in Supabase. If it expires first, the next database deploy fails at sign-in before any migration runs.
- [ ] 👤 **Monthly (on the Free plan, D11):** take a backup.
  1. Get the connection string from Dashboard → **Connect** (Session pooler).
  2. Run:
     ```sh
     npx supabase db dump --db-url "<connection string>" -f kitchin-schema.sql
     npx supabase db dump --db-url "<connection string>" --data-only -f kitchin-data.sql
     ```
  3. Store both files in an encrypted location, for example an encrypted disk image or your password manager's file storage. **Never in the repo.**
- [ ] 🤖 **Weekly-ish:** review and merge Dependabot PRs once CI is green.
- [ ] 👤 **Yearly:** renew the Apple Developer Program. 🤖 Upgrade the Expo SDK one version at a time.
- [ ] 👤 **Rarely:** a lost phone or a suspected compromise → Dashboard → Authentication → Users → that user → sign out of all sessions and set a new password.
- [ ] 👤 **If you get a Supabase "project will be paused" email** (after about 7 days of low activity, for example a vacation): open the app, or go to the dashboard and click **Resume project** if it already paused. Data is kept.

---

## Legacy decommissioning (after about 2 weeks of reliable use)

- [ ] 👤 **Now, optional:** pause or stop the **Railway** zero-cache service. It is a publicly writable endpoint, and Railway may be billing you.
- [ ] 👤 Delete the Railway project.
- [ ] 👤 Delete or pause the **Vercel** project for `kitchin-app`.
- [ ] 👤 Delete the **Neon** databases (dev + prod).
- [ ] 👤 Archive the `kitchin` and `kitchin-app` GitHub repositories (Settings → General → Archive this repository).
- [ ] 👤 Optionally delete the local `kitchin/` and `kitchin-app/` folders once you no longer want them as a reference.
