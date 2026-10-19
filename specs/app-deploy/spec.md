# Kitchin App Deploys — Mini-spec

> Builds, TestFlight submissions and over-the-air (OTA) updates from one manually started GitHub Actions workflow, with the same controls as hoador's EAS Deploy.
> **Status:** Draft for owner review, 2026-10-19. The owner asked for it on 2026-10-19. `docs/TASKS.md` ("After the MVP") allows a mini-spec for EAS Update, so this one file holds all four phases. Task 14.1 is implemented alongside it and left uncommitted; approving this document approves that work.

## 1. Requirements

### Requirement 39: Delivery — App Deploy Workflow

**User Story:** As the owner, I want to ship a new build or a JavaScript-only update from GitHub in one step, so that releases don't need my laptop and small fixes reach both phones without waiting for TestFlight.

#### Acceptance Criteria

1. The owner SHALL be able to start, from one manually triggered workflow, any of these: an over-the-air update, a production build, or a production build that's then submitted to TestFlight.
2. IF the workflow is started from any branch other than `main` THEN it SHALL refuse to run.
3. The workflow SHALL pass the same CI checks that gate a merge (R27) before it builds or publishes anything.
4. WHEN an over-the-air update is published THEN installed production builds with a matching runtime SHALL download it in the background and run it from the next launch.
5. An over-the-air update SHALL reach only builds whose native code, native dependencies and native configuration match the ones it was published for. A change to any of those SHALL ship as a new build.
6. IF no finished production build has the update's runtime THEN the workflow SHALL refuse to publish, and SHALL say that a new build is needed.
7. An over-the-air update SHALL carry the production variant and the same public configuration values as a production build (R24, R25.1).
8. WHEN an over-the-air update is published THEN its source maps SHALL be uploaded to error reporting (R26.9).
9. An update or build that depends on a new migration SHALL be shipped only after the database deploy workflow has applied that migration (R28).
10. The build-service token SHALL be stored only as a GitHub secret on the `production` environment.

### Amendments to the MVP Requirements

Approving this document approves these changes to [`specs/mvp/1-requirements.md`](../mvp/1-requirements.md). They're already written into that file, marked *(Amended for app deploys.)*

| MVP item | Change |
|---|---|
| 25.4 | The error-reporting token may also be stored as a GitHub secret on the `production` environment, to upload update source maps. The build-service token is a GitHub secret too |
| 26.9 | Over-the-air updates upload source maps when they're published |
| Out of Scope (MVP) | EAS Update moves into scope under this document |

### Out of Scope

- A staging channel, Android, and staged (percentage) rollouts.
- Publishing or building automatically on push. That waits for the `production` environment's required reviewer (owner step 8.10), as `deploy-db.yml` does.
- An in-app "restart to update" prompt, and showing the update ID in Settings.

## 2. Design

### 2.1 Design Decisions

| ID | Decision | Choice | Why | Criteria |
|---|---|---|---|---|
| DD37 | Runtime version | `runtimeVersion: { policy: 'fingerprint' }` in `app.config.ts` | Any native change gives a new runtime automatically, so an update can't reach a build that can't run it. Hoador uses the same policy | 39.5 |
| DD38 | Channel | The `production` build profile sets `channel: "production"`. Updates publish with `--channel production` | There's one environment and no staging (MVP Out of Scope) | 39.4 |
| DD39 | When an update applies | `expo-updates` defaults: check at launch without waiting (`fallbackToCacheTimeout: 0`), and run the update from the next launch | Launch never waits on the network | 39.4 |
| DD40 | EAS CLI in CI | `npx eas-cli@<pinned>`, with `EXPO_TOKEN` only on the steps that call EAS. No `expo/expo-github-action` | The version is pinned in one place, and no third-party action handles the token | 39.10 |
| DD41 | Pre-publish runtime check | `eas fingerprint:generate --build-profile production`, then `eas build:list --channel production --runtime-version <hash> --status finished` | Fails loudly when an update matches no build. That covers a forgotten native change, and any fingerprint drift between the runner and EAS Build | 39.5, 39.6 |
| DD42 | Non-interactive submit | `submit.production.ios.ascAppId` in `eas.json` | eas-cli refuses to submit non-interactively without it. It's the app's App Store Connect number: not a credential, and not personal data | 39.1 |

### 2.2 Workflow (`.github/workflows/eas-deploy.yml`)

- **Trigger:** `workflow_dispatch` only, with one choice input, `action`: `ota-update` (the default), `build` or `build-and-submit`. Concurrency group `eas-deploy`, never cancelled mid-flight.
- **Jobs:** `guard` (fails off `main`) → `checks` (calls `ci.yml`, so the `app` and `database` jobs) → `ota-update` or `build`. Both of those use the `production` GitHub environment.
- **Variant:** `APP_VARIANT=production` at workflow level. `app.config.ts` then produces the production name and bundle ID, the update manifest's `extra.appVariant` (DD22), and the same fingerprint EAS Build computes (39.7).
- **`ota-update`:** `npm ci` → check that `SENTRY_AUTH_TOKEN` is set → the DD41 runtime check → `eas update --channel production --environment production --platform ios` → `npx sentry-expo-upload-sourcemaps dist`. `eas update` exports into `dist/` with source maps, using the production EAS environment's public values. `metro.config.js` wraps Metro with Sentry, so the bundle and its maps share debug IDs (39.8).
- **`build`:** for `build-and-submit`, check `ascAppId` first (DD42) → `eas build --platform ios --profile production --non-interactive`, plus `--auto-submit` for `build-and-submit`. EAS injects the production environment's values and the Sentry token on the builder, as it does for laptop builds. EAS queues the submission when the build starts, so a runner timeout doesn't cancel it.
- **Secrets:** `EXPO_TOKEN` and `SENTRY_AUTH_TOKEN` are `production` environment secrets. Each is passed only to the steps that need it, never to `npm ci`, matching `deploy-db.yml`. `EXPO_TOKEN` gives full access to the Expo account.

### 2.3 App Configuration

- `expo-updates`, installed with `npx expo install`. Prebuild applies its config plugin automatically, so `plugins` doesn't list it. Local Debug builds (`npx expo run:ios`) still load from Metro.
- `app.config.ts`: `runtimeVersion` (DD37) and `updates.url` = `https://u.expo.dev/<EAS project ID>`, in both variants.
- `eas.json`: `channel: "production"` on the production build profile (DD38), and `ascAppId` on the production submit profile (DD42, task 14.2).
- Build 1 predates `expo-updates`, so it can never receive an update. The first build from this workflow is the first that can.

### 2.4 Shipping Order and Compatibility

- Migrations first: run "Deploy database", then ship the update or build that uses them (39.9).
- Expand → migrate → contract (R28.5) applies to the newest published update as well as to the installed build.
- Native change, new native package, `app.config.ts` change, or the 80-day TestFlight refresh (N19): `build-and-submit`. Anything else: `ota-update`. If you're not sure, try `ota-update`; the DD41 check refuses it when a build is needed.

### 2.5 Cost (N18)

Two members are far inside EAS Update's free 1,000 monthly active users. Actions minutes are free for a public repository. Each build still counts toward EAS's 15 free iOS builds a month.

## 3. Tasks

| Gate | Owner step in `docs/TASKS.md` | Needed before |
|---|---|---|
| G13 | 14.3: **done** 2026-10-19. `EXPO_TOKEN` and `SENTRY_AUTH_TOKEN` in the GitHub `production` environment, and the App Store Connect app ID given to Claude | 14.2, and running the workflow |

- [x] **14.1 Add OTA updates and the EAS Deploy workflow** · M
  - `npx expo install expo-updates`. In `app.config.ts`, add `runtimeVersion` and `updates.url`. In `eas.json`, add `channel: "production"` to the production profile.
  - `.github/workflows/eas-deploy.yml` per §2.2. The CI `app` job's `actionlint` checks it (CI-11).
  - Tests: U-CFG-07 (channel) and U-CFG-08.
  - After pulling this change, rebuild the local development build: `npx expo prebuild --clean --platform ios`, then `npm run ios`.
  - _Requirements: 39.1–39.8, 39.10_ — _Design: §2.2, §2.3, DD37–DD41_

- [x] **14.2 Add the App Store Connect app ID** · S
  - Needs gate G13. Set `submit.production.ios.ascAppId` in `eas.json`, and assert it in U-CFG-07.
  - _Requirements: 39.1_ — _Design: DD42_

## 4. Test Plan

**Automated** (in `app.config.test.ts`, run by CI-04; the workflow is linted by CI-11):

| ID | Asserts | Criteria |
|---|---|---|
| U-CFG-07 (amended) | The production build profile also has `channel: "production"`. After 14.2, the production submit profile has a numeric `ascAppId` | 39.4, 39.1 |
| U-CFG-08 | Both variants: `runtimeVersion: { policy: 'fingerprint' }`, and `updates.url` is `https://u.expo.dev/<EAS project ID>` | 39.4, 39.5 |

**Manual** (owner, after G13):

- [ ] **MT-14-01** Start EAS Deploy on a branch other than `main`. `guard` fails, and nothing else runs. (39.2)
- [ ] **MT-14-02** Start `ota-update` before any build from this workflow exists. The runtime check fails with "No finished production build has runtime …". (39.6)
- [ ] **MT-14-03** Start `build-and-submit`. The checks pass, the build finishes, and it reaches TestFlight. Install it on both phones: Settings shows "Production" and the new build number. (39.1, 39.3)
- [ ] **MT-14-04** After a JS-only change, start `ota-update`. On one phone, open Kitchin, force-quit it, then open it again. The change is there, and the EAS dashboard (Updates → the update) counts the launch. There's still no DEV badge, and Settings still shows "Production". (39.4, 39.7)
- [ ] **MT-14-05** In that run's log, "Upload source maps to Sentry" ends with "Uploaded bundles and sourcemaps to Sentry successfully". (39.8)

**Traceability:** 39.1 → U-CFG-07, MT-14-03 · 39.2 → MT-14-01 · 39.3 → MT-14-03 · 39.4 → U-CFG-07, U-CFG-08, MT-14-04 · 39.5 → U-CFG-08, MT-14-02 · 39.6 → MT-14-02 · 39.7 → MT-14-04 · 39.8 → MT-14-05 · 39.9 → runbook order (§2.4) · 39.10 → review of `eas-deploy.yml`.
