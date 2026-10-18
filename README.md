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

## Security note

Only the Supabase **publishable** key and the Sentry DSN ship in the app. Both are public by design. Data access is enforced by Postgres Row Level Security. Privileged credentials are never committed to this repository.
