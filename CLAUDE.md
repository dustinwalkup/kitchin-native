# CLAUDE.md

A private iOS app shared by two household members: groceries first, then meals, chores and notes.
Stack: Expo + React Native + TypeScript (strict) + Expo Router, with Supabase (Postgres, Auth, Realtime, RLS), TanStack Query, Sentry, GitHub Actions, and EAS → TestFlight.

- `specs/mvp/` is the authoritative spec, written with the EARS spec-driven process: `1-requirements.md` → `2-design.md` → `3-tasks.md` → `4-test-plan.md`. Read the relevant requirement and design section before changing anything they cover, and cite requirement numbers (for example R7.3) in commits and PRs.
- New features (meals, chores, notes) get their own `specs/<feature>/` folder and go through the same four phases, with explicit owner approval between each phase.
- `docs/SPEC.md` is the research record: legacy assessment, risks, costs and documentation links. Its §3–§11 are superseded by `specs/mvp/2-design.md`.
- `docs/TASKS.md` is the owner runbook. 👤 = an owner-only manual step (stop and give exact instructions). Its 🤖 steps are superseded by `specs/mvp/3-tasks.md`.

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

- Use a branch and a PR per task group. Keep CI green: lint, format check, typecheck, Jest, `supabase db lint`, `supabase test db`, and the generated-types drift check.
- Change the schema only through `npx supabase migration new <name>`. Never edit a migration that has already merged. Regenerate `src/types/database.ts` after every schema change.
- Migrations must stay backward compatible with the TestFlight build currently installed (expand → migrate → contract).
- Install Expo-managed native packages with `npx expo install <pkg>` so versions stay aligned with the SDK.
- Screens never import `supabase` directly. Go through `src/features/<feature>/hooks.ts` → `api.ts`.
- Use the legacy desert palette (SPEC §4.6) through `src/ui/theme.ts` tokens only. Never hard-code hex values in components.
- Use development builds (`npx expo run:ios`), not Expo Go. Expo SDK 58; routes live in `src/app/`.
- React Native Testing Library 14 is async: always `await render(...)` and `await fireEvent...`.

## Commands

_To be filled in during M1._
