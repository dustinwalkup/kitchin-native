# CLAUDE.md

A private iOS app shared by two household members: groceries first, then meals, chores and notes.
Stack: Expo + React Native + TypeScript (strict) + Expo Router, with Supabase (Postgres, Auth, Realtime, RLS), TanStack Query, Sentry, GitHub Actions, and EAS → TestFlight.

- `specs/mvp/` is the authoritative spec for the MVP, `specs/meals/` for meal planning and `specs/meal-library/` for the meal library. All three are written with the EARS spec-driven process: `1-requirements.md` → `2-design.md` → `3-tasks.md` → `4-test-plan.md`. Meals numbering continues from the MVP's (R30, N21, DD23, OI-15 and task 9 onwards), and the meal library's continues from both (R40, N25, DD43, OI-20 and task 15 onwards), so a number means one thing across all three. Read the relevant requirement and design section before changing anything they cover, and cite requirement numbers (for example R7.3 or R32.3) in commits and PRs. `specs/redesign/design.md` records the 2026-10-25 app-wide redesign (design system, screens and data) and lists the earlier requirements it supersedes; its numbers carry an `R` prefix (`DD-R4`, task `R3`).
- New features (meals, chores, notes) get their own `specs/<feature>/` folder and go through the same four phases, with explicit owner approval between each phase.
- `docs/SPEC.md` is the research record: legacy assessment, risks, costs and documentation links. Its §3–§11 are superseded by `specs/mvp/2-design.md`.
- `docs/TASKS.md` is the owner runbook. 👤 = an owner-only manual step (stop and give exact instructions). Its M1–M8 🤖 steps are superseded by `specs/mvp/3-tasks.md`. Its Phase 2 🤖 lines mirror `specs/meals/3-tasks.md`, and its Meal library 🤖 lines `specs/meal-library/3-tasks.md`, under the same numbers, so tick both together.

## Status

**Spec phase.** Requirements and design were approved on 2026-10-18, which settles every SPEC §16 decision (`specs/mvp/2-design.md` §1.2). Do not scaffold or implement anything until the owner has approved `3-tasks.md` and `4-test-plan.md`. Update this line when that happens.

## Security rules (non-negotiable)

- Never put a Supabase secret or `service_role` key, a database password, an access token, a signing key or any other private credential in the app, the repo, `.env.example`, or any `EXPO_PUBLIC_*` variable. `EXPO_PUBLIC_*` values are shipped inside the app bundle.
- Never ask the owner to paste a secret into chat. The owner enters secrets in the Supabase, GitHub, Sentry or expo.dev dashboards. Public values (Supabase URL, publishable key, Sentry DSN) may be set with `eas env:set`.
- Configure Sentry by hand. Never run `@sentry/wizard`, which can write auth tokens into project files.
- Do not commit agent or permission config that a template or tool generated (for example `AGENTS.md` or `.claude/settings.json` from `create-expo-app`) without the owner's review.
- Work only against the **local** Supabase stack (`npx supabase start`). Never run `supabase link`, `supabase db push`, or any command that targets the production project. Production migrations deploy only through `.github/workflows/deploy-db.yml`.
- Every table holding household data needs:
  - `household_id`
  - explicit grants to `authenticated` only and **nothing to `anon`**; Supabase no longer auto-exposes tables
  - RLS enabled, with the template policies from `specs/mvp/2-design.md` §4.4
  - the audit and broadcast triggers
  - pgTAP isolation tests (SPEC Appendix B)
- Never use `user_metadata` / `raw_user_meta_data` for authorization. `security definer` functions belong only in the `private` schema, with `set search_path = ''` and explicit `revoke execute … from public, anon`.
- No client code path may create households or write to `household_members`.
- Never log, or send to Sentry, any token, password, email, display name or household content (item names, notes, meal text).
- This repo is public. Never commit real names, emails or other personal data. Placeholders only.

## Workflow

- Agents never run `git commit` (or amend). Leave changes uncommitted in the working tree; the owner reviews and commits them.
- Use a branch and a PR per task group. Keep CI green: lint, format check, typecheck, Jest, `supabase db lint`, `supabase test db`, and the generated-types drift check.
- Change the schema only through `npx supabase migration new <name>`. Never edit a migration that has already merged. Regenerate `src/types/database.ts` after every schema change.
- Migrations must stay backward compatible with the TestFlight build currently installed (expand → migrate → contract).
- Install Expo-managed native packages with `npx expo install <pkg>` so versions stay aligned with the SDK.
- Screens never import `supabase` directly. Go through `src/features/<feature>/hooks.ts` → `api.ts`.
- Use the redesign's palette (`specs/redesign/design.md` §2) through `src/ui/theme.ts` tokens only. Never hard-code hex values in components. Build screens from the shared components in `src/ui/` (§3) rather than one-off styles.
- Use development builds (`npx expo run:ios`), not Expo Go. Expo SDK 58; routes live in `src/app/`.
- React Native Testing Library 14 is async: always `await render(...)` and `await fireEvent...`.

## Commands

Before calling a task done, run the CI `app` job's checks: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run check:secrets`.

- `npm test -- <path>` runs one file; CI runs `npm test -- --ci --coverage`, which fails below the 4-test-plan §9 thresholds. Route tests go in `src/__tests__/`, because every file under `src/app/` becomes a route.
- `npm run format` fixes formatting. `npm run check:secrets` scans tracked and untracked, non-ignored files for credentials.
- `npm run ios` builds the development variant ("Kitchin Dev") and opens it in the Simulator. It needs `.env.local` (copy `.env.example`). Once that build is installed, `npm start` is enough until native dependencies change.
- `ios/` is generated and gitignored. After changing native config in `app.config.ts` (name, bundle ID, icon, plugins), run `npx expo prebuild --clean --platform ios`.
- Local database: `npx supabase start`, then `npx supabase test db`, `npx supabase db lint --local --schema public,private --fail-on error` and `npx supabase db advisors --local --type security --fail-on warn`. Regenerate types with `npx supabase gen types typescript --local > src/types/database.ts`.
