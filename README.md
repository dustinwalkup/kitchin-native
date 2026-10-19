# Kitchin

A private, shared household app for iOS, built with React Native, Expo and Supabase. It replaces the earlier `kitchin-app` web app.

**Status:** specification phase. No app code yet.

| Document | What it covers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Assessment of the legacy app, architecture, data model, security (auth, RLS, Realtime), testing, CI, environments, costs, and the decisions awaiting approval |
| [docs/TASKS.md](docs/TASKS.md) | Milestone-by-milestone plan, with manual (owner) steps marked separately from steps Claude Code does |
| [CLAUDE.md](CLAUDE.md) | Rules for AI coding agents working in this repo |

## Stack

Expo · React Native · TypeScript · Expo Router · TanStack Query · Supabase (Postgres, Auth, Realtime, Row Level Security) · Sentry · GitHub Actions · EAS Build/Submit · TestFlight

## Running the app

You need Node (the version in `.nvmrc`), Xcode with an iOS Simulator runtime, and Docker or OrbStack for the local Supabase stack.

1. `npm install`
2. `cp .env.example .env.local`. Every value in it is public and local-only.
3. `npx supabase start`, then put the publishable key that `npx supabase status` prints into `.env.local`.
4. `npm run ios` builds the development variant, "Kitchin Dev", and opens it in the Simulator. The first build takes a few minutes. After that, `npm start` is enough until native dependencies change.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Starts Metro for an installed development build |
| `npm run ios` | Builds the development variant and opens it in the iOS Simulator |
| `npm run two-sims` | Installs that build on two simulators, "Kitchin A" and "Kitchin B", for the live-update checks, and prints the sign-ins and the Realtime stop and start commands |
| `npm test` | Runs Jest. CI adds `--ci --coverage` and fails below the coverage thresholds |
| `npm run lint` | ESLint, including the import-boundary and colour-literal rules |
| `npm run format` / `npm run format:check` | Formats with Prettier, or only checks |
| `npm run typecheck` | Runs `tsc --noEmit` in strict mode |
| `npm run check:secrets` | Fails if any tracked or untracked, non-ignored file holds a credential |

CI (`.github/workflows/ci.yml`) runs `lint`, `format:check`, `typecheck`, `test` and `check:secrets` in its `app` job, and the database checks in its `database` job, on every push to `main` and every pull request.

## Security note

Only the Supabase **publishable** key and the Sentry DSN ship in the app. Both are public by design. Data access is enforced by Postgres Row Level Security. Privileged credentials are never committed to this repository.
