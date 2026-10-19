# Kitchin MVP — Test Plan

> **Phase 4 of 4** in the EARS spec-driven process: 1-requirements → 2-design → 3-tasks → **4-test-plan**.
> **Status:** Draft, awaiting approval (2026-10-18).

## 1. Requirements Traceability

This plan verifies the MVP from the database up to the two phones. These are the behaviours it has to prove, in order of risk:

1. **Household isolation is enforced by the database.** No account outside a household can read, write or receive events for its data, whatever it sends to the API (R18–R23).
2. **No secret or personal data leaves where it belongs.** That means the bundle, the repo and error reports (R24–R26).
3. **Changes converge.** Optimistic changes roll back cleanly, retries never duplicate, and both phones end up showing the database's state, including after offline periods and dropped live updates (R11–R13, N4–N7).
4. **The grocery rules hold.** Ordering, duplicates, check attribution, clear checked (R4–R10, R21).
5. **The app is usable in a store.** Instant feedback, readable contrast, VoiceOver, large text (R16, N10–N14).

**References:** `R7.3` and `N4` point to [1-requirements.md](./1-requirements.md); `§3.5`, `DD15` and `OI-5` point to [2-design.md](./2-design.md); task numbers point to [3-tasks.md](./3-tasks.md).

**Test IDs.** Tasks and PRs cite tests by ID. The prefixes:

| Prefix | Kind | Runs in | Section |
|---|---|---|---|
| `DB-S` | pgTAP, structural | CI `database` | §2.1 |
| `DB-H` | pgTAP, households and memberships | CI `database` | §2.2 |
| `DB-P` | pgTAP, provisioning | CI `database` | §2.3 |
| `DB-G` | pgTAP, grocery data | CI `database` | §2.4 |
| `DB-R` | pgTAP, realtime | CI `database` | §2.5 |
| `U-*` | Jest unit tests | CI `app` | §3 |
| `C-*` | React Native Testing Library component and route tests | CI `app` | §4 |
| `CI-*` | Pipeline gates | CI | §5 |
| `MT-*` | Manual checks run by the owner, by milestone | Simulator or phones | §6 |

### 1.1 Test Coverage Summary

| Layer | Tool | What it proves |
|---|---|---|
| Database, structural | pgTAP via `supabase test db` | Every table, policy, grant and function follows the security conventions, so a forgotten RLS policy or grant fails CI |
| Database, behavioural | pgTAP, acting as users A–D and anon | Isolation, immutability, attribution, duplicate rules, the checked trigger, realtime authorization, provisioning atomicity |
| Unit | Jest (`jest-expo`) | Pure rules, error mapping, guards, scrubbing, session storage, providers, mutation and sync logic |
| Component and route | RNTL 14 (async API) + `expo-router/testing-library` | Screens, guards, interactions, states and accessibility, with `api.ts` mocked |
| Pipeline | GitHub Actions | Lint, types, formatting, secrets, migrations from scratch, advisors, type drift |
| Manual | Owner, on Simulator and phones | Two-device sync, real network loss, VoiceOver, Dynamic Type, Sentry privacy, production configuration, TestFlight |

### 1.2 Frameworks and Conventions

- **Unit and component tests:** Jest 30 with the `jest-expo` preset, plus `@testing-library/react-native` 14. Its API is async: always `await render(...)`, `await fireEvent...` and `await act(...)`.
- **Route tests:** `renderRouter` from `expo-router/testing-library`.
- **Database tests:** pgTAP files in `supabase/tests/database/`. Each file runs `begin; select plan(n); … select * from finish(); rollback;`, so tests never leave data behind.
- **Mocking:** hooks and components are tested with `api.ts` mocked. `supabase-js` is mocked only in the `api.ts`, auth-provider and channel tests. `domain.ts` is never mocked.
- **Test layout:** each test file sits beside its module (`domain.test.ts` next to `domain.ts`), and describe blocks name the test ID, for example `it('U-DOM-07 orders open before checked, oldest first', …)`.
- **TDD:** tasks marked **TDD** in 3-tasks start red, with the tests listed here, then go green and get refactored.

---

## Part A — Automated Tests

## 2. Database Tests (pgTAP)

These are the highest-risk tests in the project. They run as real roles against the real policies.

**Pattern:**

```sql
begin;
select plan(3);

select tests.authenticate_as('member-c@example.com');      -- role authenticated, sub = C

select is_empty(
  $$ select 1 from public.grocery_items where household_id = tests.household_id('Household One') $$,
  'DB-G-02 C sees no Household One items');

select throws_ok(
  $$ insert into public.grocery_items (household_id, list_id, name)
     values (tests.household_id('Household One'), tests.list_id('Household One'), 'Milk') $$,
  '42501', null, 'DB-G-04 C cannot insert into Household One');

select results_eq(
  $$ with u as (update public.grocery_items set quantity = '9'
                where household_id = tests.household_id('Household One') returning 1)
     select count(*)::int from u $$,
  array[0], 'DB-G-05 C updates to Household One affect 0 rows');

reset role;
select * from finish();
rollback;
```

The lookup helpers (`tests.user_id`, `tests.household_id`, `tests.list_id`) are security definer functions, so they work while the test is acting as a user that RLS would otherwise block (§8.1).

### 2.1 Structural Tests — `00_structure.test.sql` (tasks 2.3, 4.1, 5.1)

| ID | Check | Expected | Req |
|---|---|---|---|
| DB-S-01 | Every table in `public` has row security enabled | No exceptions | R19.10, R27.3 |
| DB-S-02 | Every `public` table except `households` and `household_members` has `household_id uuid not null` | No exceptions | R19.1, R27.3 |
| DB-S-03 | No policy in `public` (or on `realtime.messages`) targets `anon` or `public` | None | R19.3, R27.4 |
| DB-S-04 | No policy's `qual` or `with_check` is `true` | None | R27.4 |
| DB-S-05 | `anon` holds no privilege on any `public` table | `role_table_grants` is empty for `anon` | R19.3, R27.4 |
| DB-S-06 | `authenticated` privileges equal the expected set: `households` {SELECT, UPDATE}; `household_members` {SELECT}; `grocery_lists` {SELECT}; `grocery_items` {SELECT, INSERT, UPDATE, DELETE} | Exact match, so no TRUNCATE, REFERENCES or TRIGGER | R20.2, R20.3, R21.1, R27.4 |
| DB-S-07 | Every security definer function in `private` has `search_path` set in `proconfig` | No exceptions | R27.5 |
| DB-S-08 | `anon` can't execute any function in `private` | None executable | R19.11, R27.5 |
| DB-S-09 | `authenticated` can execute only `private.my_household_ids()` in `private` | Exactly one | R19.11 |
| DB-S-10 | `authenticated` can't execute `private.provision_household(...)` | Not executable | R23.5, R27.5 |
| DB-S-11 | `public` contains no functions, so there's no RPC surface | None | R19.11 |
| DB-S-12 | Every view in `public` has `security_invoker = true` | No exceptions (none in the MVP) | R19.10 |
| DB-S-13 | `anon` has no `USAGE` on schema `private`; `authenticated` has `USAGE` only | As stated | R19.11 |
| DB-S-14 | Every `public` table with `household_id` has the audit trigger; from M5 every grocery table also has the broadcast trigger | No exceptions | N16, R11.1 |
| DB-S-15 | Every `public` table with `household_id` has an index whose first column is `household_id` | No exceptions | N3 |
| DB-S-16 | `private.broadcast_household_change` is security definer with a fixed `search_path`, and neither `anon` nor `authenticated` can execute it (task 5.1) | As stated | R22.3, R27.5 |

The structural queries skip the `tests` schema, which exists only in local and CI databases (§8.1).

### 2.2 Households and Memberships — `10_households.test.sql` (task 2.6)

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-H-01 | A | `select` households | Only H1 | R19.2, R20.1 |
| DB-H-02 | A | `select` household_members | Exactly A and B (H1) | R20.1 |
| DB-H-03 | C | `select` households and household_members | No H1 rows | R19.2, R20.1 |
| DB-H-04 | D (no membership) | `select` every `public` table | 0 rows | R19.9 |
| DB-H-05 | anon | `select` households, household_members | `42501` | R19.3 |
| DB-H-06 | A | Insert membership (A → H2) | `42501` | R20.2 |
| DB-H-07 | A | Insert membership (D → H1) | `42501` | R20.2 |
| DB-H-08 | A | Update own membership's `display_name` | `42501` | R20.2 |
| DB-H-09 | A | Delete a membership | `42501` | R20.2 |
| DB-H-10 | A | Insert a household | `42501` | R20.3 |
| DB-H-11 | A | Delete H1 | `42501` | R20.3 |
| DB-H-12 | A | Update H1 `name` and `time_zone = 'America/Chicago'` | Succeeds; `updated_at` advances | R20.4, R20.5 |
| DB-H-13 | A | Update H2 `name` | 0 rows; H2 unchanged | R19.2, R19.4 |
| DB-H-14 | A | Update H1 `id`, or H1 `created_at` | `42501` | R19.5, R20.4 |
| DB-H-15 | A | Set H1 `time_zone = 'Mars/Olympus'` | `23514` | R20.5 |
| DB-H-16 | A | Set H1 `name` to `''`, or to 101 characters | `23514` | R20.5 |
| DB-H-17 | postgres | Insert a membership with a 51-character `display_name` | `23514` | R20.6 |
| DB-H-18 | A, with JWT claims that add `user_metadata.household_id = H2` and `app_metadata.household_id = H2` | `select` households | Only H1, so metadata is ignored | R18.6, R19.12 |

### 2.3 Provisioning — `40_provisioning.test.sql` (task 2.6, extended by 4.2)

| ID | Action (as postgres unless stated) | Expected | Req |
|---|---|---|---|
| DB-P-01 | Provision with two existing emails | 1 household, 2 memberships, and (from M4) 1 grocery list | R21.1, R23.2 |
| DB-P-02 | Provision where the second email doesn't exist | Exception; the counts of households, memberships and lists are unchanged | R23.3 |
| DB-P-03 | Arrays of different lengths | Exception; nothing created | R23.3 |
| DB-P-04 | Empty arrays | Exception; nothing created | R23.3 |
| DB-P-05 | Emails in a different case from `auth.users` | Succeeds (matching ignores case) | R23.2 |
| DB-P-06 | As A: call `private.provision_household(...)` | `42501` | R23.5 |
| DB-P-07 | As anon: call it | `42501` | R23.5 |

### 2.4 Grocery Data — `20_grocery_items.test.sql` (task 4.1)

**Isolation**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-G-01 | A | `select` grocery_items and grocery_lists | Only H1 rows | R19.2 |
| DB-G-02 | C | `select` H1 items and lists | 0 rows | R19.2 |
| DB-G-03 | anon | `select` grocery_items, grocery_lists | `42501` | R19.3 |
| DB-G-04 | C | Insert an item with `household_id = H1` | `42501` | R19.4 |
| DB-G-05 | C | Update an H1 item by ID | 0 rows; item unchanged | R19.2 |
| DB-G-06 | C | Delete an H1 item by ID | 0 rows; item still exists | R19.2 |
| DB-G-07 | A | Update an own item to set `household_id = H2` | `42501` | R19.4, R19.5 |
| DB-G-08 | A | Insert an H1 item whose `list_id` is H2's list | `23503` | R19.6, R21.5 |
| DB-G-09 | A | Insert, update or delete `grocery_lists` | `42501` | R21.1 |
| DB-G-10 | postgres | After seeding: count lists per household | Exactly 1 each | R21.1 |

**Attribution and timestamps**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-G-11 | A | Insert with `created_by = B`, `created_at = '2000-01-01'` | Stored with `created_by = A` and `created_at ≈ now()` | R5.8, R19.7, R19.8 |
| DB-G-12 | A | Update an item, setting `created_by = B` | `42501` | R19.5 |
| DB-G-30 | A | Update an item, setting `created_by = null` | `42501`; only `ON DELETE SET NULL`, with no signed-in user, may clear it (owner review of 2.9, 2026-10-18) | R19.5 |
| DB-G-13 | A | Update `quantity` | `updated_by = A`; `updated_at` advances | R19.7, R19.8 |
| DB-G-14 | A | Insert with `is_checked = true`, `checked_by = B` | `checked_by = A`; `checked_at` set | R19.7, R21.4 |

**Checked trigger**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-G-15 | A | Check an open item | `checked_at ≈ now()`, `checked_by = A` | R7.1 |
| DB-G-16 | A | Uncheck it | `checked_at` and `checked_by` both null | R7.2 |
| DB-G-17 | A, then B | A checks an item; B then sets `is_checked = true` | `checked_by` stays A; `checked_at` unchanged | R7.4 |
| DB-G-18 | A | Update `quantity` and also send `checked_at = '2000-01-01'`, `checked_by = B` | `checked_at` and `checked_by` unchanged | R21.4 |
| DB-G-19 | postgres | Delete an auth user who created and checked items | Succeeds; their `created_by` and `checked_by` become null | §1.5 (trigger fix) |

**Duplicates and validation**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-G-20 | A | Insert `Milk`, then `MILK` (both open) | Second fails with `23505` on `grocery_items_one_open_per_name` | R5.6, R21.3 |
| DB-G-21 | A | Check `Milk`, then insert `milk` | Succeeds | R5.7 |
| DB-G-22 | A | With checked `Milk` and open `milk`, uncheck `Milk` | `23505` on `grocery_items_one_open_per_name` | R21.3, edge case 22 |
| DB-G-23 | A | Insert ` Milk` or `Milk ` | `23514` | R21.2, DD16 |
| DB-G-24 | A | Insert names of `''`, 200 characters and 201 characters; 200 emoji | `''` and 201 fail with `23514`; 200 characters and 200 emoji succeed | R21.2 |
| DB-G-25 | A | Quantity of 51 characters; quantity `''` | `23514` for both (the app sends `null` for "no quantity") | R21.2 |
| DB-G-26 | A | Notes of 1001 characters | `23514` | R21.2 |
| DB-G-27 | A | Category `snacks` | `23514` | R21.2 |
| DB-G-28 | A | Insert the same client-supplied `id` twice | Second fails with `23505` on `grocery_items_pkey` (the signal that makes retries idempotent) | R12.3, N5 |

**Clear checked**

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-G-29 | A | `delete … where list_id = <H1 list> and is_checked returning id` | Removes exactly the checked H1 items; open items and H2 untouched | R10.3 |

### 2.5 Realtime — `30_realtime.test.sql` (task 5.1)

Setup (as postgres): insert one `broadcast` message on topic `household:<H1>` and one on `household:<H2>`, plus a `presence` message on `household:<H1>` for DB-R-07. They go into today's partition. The test can't create a partition, so it relies on the ones Realtime creates (OI-7).

| ID | Acting as | Action | Expected | Req |
|---|---|---|---|---|
| DB-R-01 | A, topic `household:<H1>` | `select` from `realtime.messages` | Sees the H1 message | R22.1 |
| DB-R-02 | A, topic `household:<H2>` | `select` | Sees nothing | R22.1, R22.2 |
| DB-R-03 | C, topic `household:<H1>` | `select` | Sees nothing | R22.2 |
| DB-R-04 | D, topic `household:<H1>` | `select` | Sees nothing | R19.9, R22.2 |
| DB-R-05 | anon, topic `household:<H1>` | `select` | Nothing or `42501` | R22.2 |
| DB-R-06 | A | Insert into `realtime.messages` on topic `household:<H1>` | `42501` (no INSERT policy) | R22.3 |
| DB-R-07 | A, topic `household:<H1>` | `select` a `presence` message on the H1 topic | Not visible through this policy | R22.1 |
| DB-R-08 | A | Insert, update and delete an H1 item, then read `realtime.messages` as postgres | Three broadcast messages on `household:<H1>` with events `INSERT`, `UPDATE`, `DELETE`; the delete is included | R11.1, R11.2, R22.1 |
| DB-R-09 | A | Update H1's grocery list as postgres, then read messages | A broadcast on `household:<H1>` | R11.2 |
| DB-R-10 | A | With `private.broadcast_household_change` owned by a role that has no `USAGE` on schema `realtime` (set inside the test transaction, OI-7), insert an item | The insert succeeds; the item is stored and no broadcast is sent | R22.5, N7 |

---

## 3. Unit Tests (Jest)

### 3.1 Environment Guard and Config — `env-guard.test.ts`, `env.test.ts` (task 1.4)

| ID | Test | Req |
|---|---|---|
| U-ENV-01 | `parseVariant`: `undefined` gives development; `'production'` gives production; `'staging'` throws | R24.1 |
| U-ENV-02 | Development accepts `http://127.0.0.1:54321`, `http://localhost:54321`, `http://192.168.1.20:54321`, `http://10.0.0.5:54321`, `http://172.16.0.2:54321` and `http://laptop.local:54321` | R24.3 |
| U-ENV-03 | Development rejects `https://abcd.supabase.co`, `http://example.com` and `http://172.32.0.1` | R24.3 |
| U-ENV-04 | Production accepts `https://abcdefghijklmnop.supabase.co` | R24.4 |
| U-ENV-05 | Production rejects `http://abcd.supabase.co`, `https://127.0.0.1`, `https://evil.com/x.supabase.co` and `https://abcd.supabase.co.evil.com` | R24.4 |
| U-ENV-06 | Both variants reject keys starting `sb_secret_`, and JWTs whose role is `service_role` or `supabase_admin` | R25.1 |
| U-ENV-07 | Production requires `sb_publishable_`; development also accepts the local anon JWT | R25.1 |
| U-ENV-08 | Every error message contains the variable's name and never contains the value | R24.5 |
| U-ENV-09 | `env.ts` throws `ConfigError` naming `EXPO_PUBLIC_SUPABASE_URL` when it's missing, and `EXPO_PUBLIC_SENTRY_DSN` when production has no DSN | R24.5 |
| U-ENV-10 | `env.ts` source contains no `process.env[` and no destructuring of `process.env`, so every value is inlined | R25.1 |

### 3.2 App Config — `app.config.test.ts` (task 1.5)

| ID | Test | Req |
|---|---|---|
| U-CFG-01 | Production with a local URL throws | R24.4 |
| U-CFG-02 | Development with a `*.supabase.co` URL throws | R24.3 |
| U-CFG-03 | Development produces name `Kitchin Dev`, bundle ID `<prefix>.kitchin.dev` and scheme `kitchin-dev` | R24.1 |
| U-CFG-04 | Production produces `Kitchin` and `<prefix>.kitchin` | R24.1 |
| U-CFG-05 | Both variants: `owner: 'dustinwalkup'`, `slug: 'kitchin'`, the EAS `projectId`, `userInterfaceStyle: 'light'`, `orientation: 'portrait'`, `supportsTablet: false`, `usesNonExemptEncryption: false` | R16.6, R29.3 |
| U-CFG-06 | A missing URL warns and doesn't throw | §3.1 |
| U-CFG-07 | `eas.json`: `appVersionSource: remote`; the production profile has `autoIncrement`, `distribution: store`, `environment: production` and `APP_VARIANT: production` | R24.6, R29.2 |

### 3.3 Theme — `theme.test.ts` (task 1.6)

| ID | Test | Req |
|---|---|---|
| U-THM-01 | Every `TEXT_PAIRS` entry meets its minimum contrast ratio | N13 |
| U-THM-02 | Every pair below 4.5:1 is marked `bold` | N13, DD19 |
| U-THM-03 | Palette values equal SPEC §4.6 exactly | R16.1 |
| U-THM-04 | Each soft tint equals its source colour blended over white at the stated alpha, within ±1 per channel | R16.1 |
| U-THM-05 | Every `CategoryKey` has a badge pair | R16.4 |
| U-THM-06 | `themes.dark` deep-equals `themes.light` for the MVP | R16.6 |

### 3.4 Lint Rules — `eslint-rules.test.ts` (task 1.3)

| ID | Test | Req |
|---|---|---|
| U-LNT-01 | A colour literal in a component fixture is an error; the same literal in `src/ui/theme.ts` isn't | R16.7 |
| U-LNT-02 | Importing `@/lib/supabase` from `src/app/**` or `**/components/**` is an error | §2.2 |
| U-LNT-03 | Importing `react`, `react-native`, `@supabase/*` or `@tanstack/*` from `**/domain.ts` is an error | N17 |

### 3.5 Secrets Scanner — `check-secrets.test.mjs` (task 1.9)

Fixtures are built at runtime, so the test file never contains a real-looking secret.

| ID | Test | Req |
|---|---|---|
| U-SEC-01 | `sb_secret_` followed by 20+ key characters fails | R25.3 |
| U-SEC-02 | `sbp_` followed by 40 hex characters fails | R25.3 |
| U-SEC-03 | `sntrys_` token fails | R25.3 |
| U-SEC-04 | `ghp_` (and `gho_`, `ghu_`, `ghs_`, `ghr_`) token fails | R25.3 |
| U-SEC-05 | `-----BEGIN PRIVATE KEY-----` and `-----BEGIN RSA PRIVATE KEY-----` fail | R25.2 |
| U-SEC-06 | A JWT whose payload `role` is `service_role` or `supabase_admin` fails | R25.2, R25.3 |
| U-SEC-07 | Prose mentioning "service_role" or `sb_secret_…` (with an ellipsis) passes | R25.3 |
| U-SEC-08 | The local anon JWT passes | R25.3 |
| U-SEC-09 | Findings report the file and line but not the matched value | R25.2 |

### 3.6 Session Storage and Client — `secure-session-storage.test.ts`, `supabase.test.ts` (tasks 3.1, 3.2)

| ID | Test | Req |
|---|---|---|
| U-SES-01 | `setItem` then `getItem` returns the original value | R3.1 |
| U-SES-02 | Two writes use two different Keychain keys | R3.2 |
| U-SES-03 | Keychain calls pass `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` | R3.2 |
| U-SES-04 | Ciphertext present but Keychain key missing → `null`, and both halves removed | R3.2 |
| U-SES-05 | Corrupt ciphertext, or decrypted text that isn't JSON → `null`, and both halves removed | R3.2 |
| U-SES-06 | `removeItem` deletes both halves | R3.5 |
| U-SES-07 | The ciphertext in AsyncStorage contains none of the plaintext token | R3.2 |
| U-SBC-01 | AppState `active` calls `startAutoRefresh`; `background` and `inactive` call `stopAutoRefresh` | R3.3 |
| U-SBC-02 | The client is created with the secure storage, `persistSession`, `autoRefreshToken` and `detectSessionInUrl: false` | R3.1, R3.4 |

### 3.7 Error Classification and Reporting — `errors.test.ts`, `reporting.test.ts` (tasks 3.3, 6.2)

| ID | Input | Expected category (reported?) | Req |
|---|---|---|---|
| U-ERR-01 | `TypeError('Network request failed')`, timeout | `network`, retryable (no) | R14.1, R26.2 |
| U-ERR-02 | `AuthRetryableFetchError` | `network` (no) | R2.6 |
| U-ERR-03 | `AuthApiError` 400 `invalid_credentials` | Used by sign-in as invalid credentials (no) | R2.5 |
| U-ERR-04 | HTTP 401, `PGRST301`, `PGRST303` | `auth_expired` (no) | R14.2, R26.2 |
| U-ERR-05 | Postgres `42501`, HTTP 403 | `forbidden` (yes) | R14.3, R26.1 |
| U-ERR-06 | `23505` with `grocery_items_one_open_per_name` | `conflict_duplicate`, that constraint (no) | R5.6, R26.2 |
| U-ERR-07 | `23505` with `grocery_items_pkey` | `conflict_duplicate`, that constraint (no) | R12.3 |
| U-ERR-08 | `23514`, `22001`, `23502` | `validation` (yes) | R14.4, R26.1 |
| U-ERR-09 | `23503` | `server` (yes) | R14.5 |
| U-ERR-10 | HTTP 500, an unknown `PGRST*`, an unknown thrown value | `server` (yes) | R14.5 |
| U-ERR-11 | A PostgREST error whose `message`, `details` and `hint` contain `Milk` | `ApiError.message` and `meta` don't contain `Milk` | R26.4 |
| U-ERR-12 | `classifyError` on an existing `ApiError` | Returns it unchanged | §3.8 |
| U-REP-01 | `reportOnce('k')` called three times in one session | One report | R26.1 |
| U-REP-02 | `SafeExtras` rejects arbitrary keys (`// @ts-expect-error` type test) | Compile error | R26.3 |
| U-REP-03 | Before 6.2: logs only in `__DEV__`, and sends nothing | As stated | R26.8 |
| U-REP-04 | After 6.2: `report` forwards only category, codes, table, operation, record ID and channel status; `setReportingUser` sets `{ id }` only | As stated | R26.3, R26.11 |

### 3.8 Auth and Household Providers — `auth-provider.test.tsx`, `household-provider.test.tsx` (tasks 3.5, 3.6)

| ID | Test | Req |
|---|---|---|
| U-AUTH-01 | `INITIAL_SESSION` with a session → `signedIn`; without one → `signedOut` (`reason: 'none'`) | R1.1, R1.2 |
| U-AUTH-02 | `signIn` trims the email; a 400 maps to `invalid_credentials` | R2.5 |
| U-AUTH-03 | A network failure during `signIn` maps to `offline` | R2.6 |
| U-AUTH-04 | Any other failure maps to `server` | R2.6 |
| U-AUTH-05 | A `SIGNED_OUT` event that the member didn't start → `signedOut` with `reason: 'expired'`; nothing is reported | R3.6 |
| U-AUTH-06 | `signOut()` calls `supabase.auth.signOut({ scope: 'local' })` | R3.5, R3.7 |
| U-AUTH-07 | A network error from `signOut` → `{ ok: false, reason: 'offline' }`; the state stays `signedIn` and no teardown runs | R3.9 |
| U-AUTH-08 | Leaving `signedIn` runs every `onSessionEnd` callback, then `queryClient.clear()`, then `setReportingUser(null)`, in that order | R3.5, R3.6, R26.11 |
| U-AUTH-09 | Entering `signedIn` calls `setReportingUser(userId)` | R26.11 |
| U-AUTH-10 | No Supabase call is awaited inside the `onAuthStateChange` callback | §3.3 |
| U-HH-01 | No query runs while signed out | R1.3 |
| U-HH-02 | 0 membership rows → `none` | R1.3 |
| U-HH-03 | 1 row → `ready` with household and member | R1.4 |
| U-HH-04 | 2 rows → `ready` with the older row, and one `membership_multiple` report | R1.6 |
| U-HH-05 | Paused query (offline) or network error → `unreachable`; back online → `ready` without member action | R1.7 |
| U-HH-06 | `forbidden` or `server` error → `unreachable`, and the error is reported | R1.7, R26.1 |

### 3.9 Grocery Domain — `domain.test.ts`, `constants.test.ts` (task 4.3)

| ID | Test | Req |
|---|---|---|
| U-DOM-01 | `CATEGORIES` order is produce, meat, dairy, pantry, frozen, bakery, other, with the legacy labels and emoji | R4.1 |
| U-DOM-02 | `COMMON_ITEMS` has 78 items: 15, 12, 10, 15, 7, 9, 10 per category, with no duplicate normalized names | R6.1 |
| U-DOM-03 | `normalizeName('  Milk ')` is `'milk'` | R5.6 |
| U-DOM-04 | `charLength('🥛')` is 1; 200 emoji give 200 | R5.4 |
| U-DOM-05 | `validateItemInput`: `''` and `'   '` give a name error; 200 characters are ok; 201 give an error; a 51-character quantity gives an error; `'  2 '` becomes `'2'`; `''` becomes `null` | R5.3, R5.4, R8.2 |
| U-DOM-06 | `suggestCategory`: `'milk'` → dairy; `' Bananas '` → produce; `'Half & Half'` → dairy; `'kombucha'` → other | R5.2 |
| U-DOM-07 | `buildSections`: fixed order; empty sections hidden; open before checked; then by `createdAt` ascending; then by `id` | R4.1, R4.2, R4.4 |
| U-DOM-08 | `buildSections`: `openCount` per section counts open items only | R4.3 |
| U-DOM-09 | `progress`: 0 items → `{ 0, 0, null }`; 1 of 3 → 33; 2 of 3 → 67; 1 of 8 → 13 | R4.7, R4.8 |
| U-DOM-10 | `hasOpenItemNamed`: an open `Milk` matches `'milk '`; a list with only a checked `Milk` doesn't match | R5.6, R5.7 |
| U-DOM-11 | `quickAddGroups`: 7 groups and 78 chips; ✓ and disabled only for open matches; a checked-only match stays enabled | R6.1, R6.2 |
| U-DOM-12 | `parseItemRow`: category `snacks` → Other, with `unknownCategory: true` | R14.7 |
| U-DOM-13 | `parseItemRow`: a missing `name`, or a null `id` → invalid, naming the field | R14.8 |
| U-DOM-14 | `parseItemRow` maps snake_case rows to camel-case `GroceryItem` | §4.7 |

### 3.10 Grocery API — `api.test.ts` (task 4.4)

| ID | Test | Req |
|---|---|---|
| U-API-01 | `fetchList` makes one request with embedded items, and returns `listId` and the rows | R4.1 |
| U-API-02 | `insertItem` sends exactly `id, household_id, list_id, name, category, quantity`, with no attribution or timestamp fields | R12.3, R19.7 |
| U-API-03 | `setItemChecked` sends only `is_checked`; an empty `select` result throws `not_found` | R7.3, R12.4, R12.5 |
| U-API-04 | `setItemQuantity` sends only `quantity`; an empty result throws `not_found` | R8.3, R12.4 |
| U-API-05 | `deleteItem` with 0 rows deleted resolves | R9.3 |
| U-API-06 | `clearCheckedItems` filters on `list_id` and `is_checked = true`, and returns the deleted IDs | R10.3 |
| U-API-07 | Every failure throws an `ApiError` carrying table and operation, with no raw server text | R26.4 |

### 3.11 Grocery Queries and Mutations — `hooks.test.tsx` (task 4.5)

These run with a real `QueryClient`, a mocked `api.ts` and a controllable `onlineManager`. This is the sync hot path.

| ID | Test | Req |
|---|---|---|
| U-MUT-01 | Add: the row is in the cache before `insertItem` resolves | R5.5, R12.1, N2 |
| U-MUT-02 | Add fails with `server`: the row is removed; a toast offers Retry; Retry calls `insertItem` with the **same** `id` | R12.2, R12.3 |
| U-MUT-03 | Add fails with `conflict_duplicate` on `grocery_items_one_open_per_name`: the row is removed; the toast says "… is already on the list"; nothing is reported | R5.6, R6.4 |
| U-MUT-04 | Add fails with `conflict_duplicate` on `grocery_items_pkey`: the row is kept; no toast | R12.3, N5 |
| U-MUT-05 | Check is optimistic. While a quantity edit on another item is in flight, the check fails; only that item's `isChecked` and `checkedAt` revert, and the other edit survives | R12.1, R12.2, DD14 |
| U-MUT-06 | Check fails with `not_found`: the item is removed, with "That item was removed on another device" | R12.5 |
| U-MUT-07 | Uncheck fails with `conflict_duplicate` (an open item with that name exists): the item reverts to checked; the toast says "… is already on the list"; nothing is reported | R21.3, edge case 22 |
| U-MUT-08 | Quantity edit is optimistic, and `setItemQuantity` gets only `{ id, quantity }` | R8.3, R12.4 |
| U-MUT-09 | Delete is optimistic; on failure the item comes back in its original section position | R9.2, R12.2 |
| U-MUT-10 | Delete when the item is already gone (0 rows): success, no toast | R9.3 |
| U-MUT-11 | Clear checked removes every checked item at once; on failure they all come back | R10.3, R12.2 |
| U-MUT-12 | Two mutations in the same scope: the second API call starts only after the first settles | R13.3, DD15 |
| U-MUT-13 | Offline: mutations show optimistically and don't call the API; back online, the calls happen in their original order | R13.2, R13.3 |
| U-MUT-14 | Offline, add an item and then check it; back online, the insert happens before the update | R13.3, DD15 |
| U-MUT-15 | Three rapid mutations produce exactly one list refetch, after the last one settles | R11.5, R12.6 |
| U-MUT-16 | A `network` failure is retried up to 3 times; `validation` and `forbidden` aren't retried | R14.1 |
| U-MUT-17 | Checking twice sends `is_checked: true` twice, never a toggle | R7.3 |
| U-MUT-18 | An invalid row is reported once across re-renders and refetches, and left out of `items` | R14.8 |
| U-MUT-19 | `status` is `loading` on the first fetch, `waiting` when paused with no data, `error` on failure with no data, and `ready` otherwise | R4.9, R4.10, R13.1 |

### 3.12 Live Updates — `coalescer.test.ts`, `household-channel.test.ts`, `realtime.test.ts` (tasks 5.3–5.5)

| ID | Test | Req |
|---|---|---|
| U-COA-01 | 20 events within 150 ms flush once | R11.4 |
| U-COA-02 | A continuous stream (an event every 100 ms) flushes at least every 500 ms | R11.4, N1 |
| U-COA-03 | Each table appears once per flush | R11.4 |
| U-COA-04 | Nothing flushes after `stop()` | R3.5 |
| U-CH-01 | `setAuth()` is called before `subscribe`; the channel is `household:<id>` with `private: true` | R22.1 |
| U-CH-02 | The first `SUBSCRIBED` marks connected and doesn't call `onResubscribed` | R11.3 |
| U-CH-03 | `CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED` mark disconnected and record `since` | R13.4 |
| U-CH-04 | `SUBSCRIBED` after a disconnect calls `onResubscribed` | R11.3 |
| U-CH-05 | When the app becomes active with a channel that isn't joined, the channel is re-created | R11.3, R13.5 |
| U-CH-06 | `stop()` calls `removeChannel` | R3.5 |
| U-CH-07 | On session end, the channel is removed before the cache is cleared | R3.5 |
| U-CH-08 | The captured broadcast payload fixture calls `onTableChange('grocery_items')` | R11.1, OI-4 |
| U-RT-01 | An event with no pending mutation invalidates `['household', hid, 'grocery']` once, after coalescing | R11.1, R11.4 |
| U-RT-02 | An event during a pending grocery mutation doesn't invalidate; the mutation's settle refetches | R11.5 |
| U-RT-03 | The reconnecting indicator is false before 3 s of disconnection, true at 3 s, and false after reconnecting | R13.4 |
| U-RT-04 | The indicator stays false while the app is in the background | R13.4 |
| U-RT-05 | `realtime_degraded` is reported once at 120 s in the foreground, and never while backgrounded | R26.1 |

### 3.13 Report Scrubber — `sentry-scrub.test.ts` (task 6.1)

| ID | Input | Expected | Req |
|---|---|---|---|
| U-SCR-01 | An event with `request.headers.Authorization`, `request.data` and cookies | `request` removed | R26.4 |
| U-SCR-02 | `user: { id, email, username, ip_address }` | `user: { id }` | R26.3, R26.11 |
| U-SCR-03 | A fetch breadcrumb to `…/rest/v1/grocery_items?name=eq.Milk&select=*` | URL has no query; only method, URL and status remain | R26.4 |
| U-SCR-04 | A navigation breadcrumb with a query string | Query stripped | R26.4 |
| U-SCR-05 | A console breadcrumb | Dropped | R26.6 |
| U-SCR-06 | A message, tag, extra or context containing a JWT, `sb_publishable_…`, `sb_secret_…`, `apikey=…`, `Bearer …` or an email address | Each redacted | R26.4, R26.5 |
| U-SCR-07 | An exception value containing `Failing row contains (… Milk …)`, `Key (list_id, lower(name))=(…)` or `DETAIL:` | Replaced with `[redacted]` | R26.4 |
| U-SCR-08 | Allowed fields: category, Postgres code, HTTP status, table, operation, record UUID, channel status | Left intact | R26.3 |
| U-SCR-09 | `server_name` | Removed | R26.3 |
| U-SCR-10 | `Sentry.init` options: `sendDefaultPii: false`, `attachScreenshot: false`, `attachViewHierarchy: false`, `tracesSampleRate: 0`, `enabled: false` under `__DEV__`, `environment` = variant, console breadcrumbs off, no Replay integration | R26.6, R26.8 |

### 3.14 Assets and Templates (tasks 2.8, 8.1)

| ID | Test | Req |
|---|---|---|
| U-AST-01 | `scripts/provision-household.sql` contains only `<…>` placeholders and no `@` | R23.6, R25.6 |
| U-AST-02 | `assets/icon.png` header: 1024 × 1024, colour type RGB with no alpha channel | R29.5 |

---

## 4. Component and Route Tests (RNTL 14)

### 4.1 Primitives (task 1.7)

| ID | Test | Req |
|---|---|---|
| C-UI-01 | `Checkbox` has `accessibilityRole="checkbox"` and `accessibilityState.checked` | N10 |
| C-UI-02 | `Checkbox`, `Button` and `Chip` hit areas are at least 44 × 44 pt (size plus `hitSlop`) | N11 |
| C-UI-03 | A disabled `Chip` has `accessibilityState.disabled` and shows ✓ | R6.2, N10 |
| C-UI-04 | A primary `Button` renders `onBrand` text with `fontWeight: '700'` | N13 |
| C-UI-05 | `Text` keeps `allowFontScaling` and sets `maxFontSizeMultiplier={2}` | N12 |
| C-UI-06 | `Skeleton` has no animation when Reduce Motion is on | N14 |
| C-UI-07 | `Toast` announces its message to VoiceOver; its action calls the handler | N10, R12.2 |
| C-UI-08 | `LogoTile` renders the chef-hat icon on the `primary` background | R16.5 |

### 4.2 Routing and Guards — `renderRouter` (tasks 1.8, 3.7)

| ID | Initial state | Expected | Req |
|---|---|---|---|
| C-RTE-01 | Auth `restoring` | No screen rendered; splash not hidden | R1.1 |
| C-RTE-02 | `signedOut` | `sign-in` | R1.2 |
| C-RTE-03 | Signed in, household `none` | `no-household`; no grocery query | R1.3 |
| C-RTE-04 | Signed in, household `ready` | Groceries tab | R1.4 |
| C-RTE-05 | Signed in, household `unreachable` | `unreachable`, with Retry | R1.7 |
| C-RTE-06 | Ready | Exactly two tabs: Groceries and Settings | R1.5 |
| C-RTE-07 | Development variant | `/theme` is reachable and the DEV badge shows; in production, `/theme` is unreachable and there's no badge | R15.3, R15.4, R24.2 |
| C-RTE-08 | Ready, then sign out | `sign-in`; session-end callbacks ran | R3.5 |
| C-RTE-09 | Ready, then session expires | `sign-in` showing "Please sign in again" | R3.6 |

### 4.3 Sign-in — `sign-in.test.tsx` (task 3.7)

| ID | Test | Req |
|---|---|---|
| C-SIGN-01 | Email field has `textContentType="username"`, `autoComplete="email"`, an email keyboard and `autoCapitalize="none"`; password field has `textContentType="password"`, `autoComplete="current-password"` and `secureTextEntry` | R2.1, R2.2 |
| C-SIGN-02 | Sign in is disabled for an empty or invalid email, or an empty password, and no request is made | R2.3 |
| C-SIGN-03 | While pending, Sign in is disabled and shows progress | R2.4 |
| C-SIGN-04 | `invalid_credentials` shows "Email or password is incorrect"; the message is identical whatever caused it | R2.5 |
| C-SIGN-05 | `offline` shows the offline message, which differs from C-SIGN-04 | R2.6 |
| C-SIGN-06 | `reason: 'expired'` shows "Please sign in again" | R3.6 |
| C-SIGN-07 | No sign-up, password-reset or invitation controls exist | R2.8 |
| C-SIGN-08 | The logo tile and the "Kitchin" title render | R16.5 |

### 4.4 Settings — `settings.test.tsx` (task 3.8)

| ID | Test | Req |
|---|---|---|
| C-SET-01 | Shows the signed-in email, version with build number, and the environment | R15.1 |
| C-SET-02 | Sign out opens a confirmation; Cancel keeps the member signed in; Confirm calls `signOut` | R3.5, R15.2 |
| C-SET-03 | An `offline` sign-out result shows "Signing out needs a connection" and stays on Settings | R3.9 |
| C-SET-04 | Development shows "Theme preview" and "Send test error"; production shows neither | R15.3, R15.4 |
| C-SET-05 | "Send test error" calls the reporting facade with a fixed error, with no household content | R15.3, R26.4 |

### 4.5 Groceries Screen — `groceries.test.tsx` (task 4.6)

| ID | Test | Req |
|---|---|---|
| C-GRO-01 | Sections render in fixed order, and empty categories aren't rendered | R4.1, R4.2 |
| C-GRO-02 | Each section header shows the emoji, the label and an "N left" badge | R4.3 |
| C-GRO-03 | Rows show the name (no line limit) and the quantity when present | R4.5 |
| C-GRO-04 | A checked row has a checked checkbox, strikethrough and the `inkMuted` colour | R4.6 |
| C-GRO-05 | The header shows "3 of 12 checked" and "25%" | R4.7 |
| C-GRO-06 | Empty list: "No items yet" and "Add some items to get started", an add action, and no percentage | R4.8 |
| C-GRO-07 | First load shows skeleton rows | R4.9 |
| C-GRO-08 | An error with no data shows "Couldn't load groceries" and Retry; an error with cached data keeps the rows visible | R4.10 |
| C-GRO-09 | Pull to refresh calls `refetch` | R4.11 |
| C-GRO-10 | Paused with no data shows the offline banner and "Waiting for connection…" | R13.1 |
| C-GRO-11 | Every `testID` is static; no `testID` contains an item name | R26.7 |

### 4.6 Item Interactions — `item-row.test.tsx`, `clear-checked.test.tsx` (task 4.7)

| ID | Test | Req |
|---|---|---|
| C-ITEM-01 | Tapping an open row calls `setChecked({ id, isChecked: true })`; tapping a checked row sends `false` | R7.3 |
| C-ITEM-02 | The quantity button opens the editor; Return saves the trimmed value; an empty value saves `null` | R8.1–R8.3 |
| C-ITEM-03 | Blurring the editor saves | R8.3 |
| C-ITEM-04 | Swiping left and pressing Delete calls `deleteItem({ id })` with no confirmation | R9.1 |
| C-ITEM-05 | The row's accessibility label is "Milk, 1 gallon, not checked", and changes to "checked" after checking | N10 |
| C-ITEM-06 | The row exposes "Edit quantity" and "Delete" accessibility actions, and they work | N10, OI-13 |
| C-ITEM-07 | Clear checked is disabled when nothing is checked | R10.1 |
| C-ITEM-08 | Clear checked asks "Clear 4 checked items?"; Cancel calls nothing | R10.2, R10.5 |
| C-ITEM-09 | Confirming calls `clearChecked()` once | R10.3 |
| C-ITEM-10 | The quantity button is at least 44 pt even when it shows only "＋" | N11 |

### 4.7 Add-item Sheet — `add-item.test.tsx` (task 4.8)

| ID | Test | Req |
|---|---|---|
| C-ADD-01 | Name, category chips, quantity and Add render; Name has focus | R5.1 |
| C-ADD-02 | Typing "milk" selects Dairy & Eggs; typing "kombucha" selects Other | R5.2 |
| C-ADD-03 | After the member taps Bakery, typing "milk" keeps Bakery selected | R5.2 |
| C-ADD-04 | An empty name, a 201-character name or a 51-character quantity shows an inline message, and Add doesn't submit | R5.4 |
| C-ADD-05 | With an open "Milk" on the list, typing "milk " shows "Milk is already on the list." and disables Add | R5.6 |
| C-ADD-06 | Add calls `addItem` with the trimmed name, the category and the quantity (or `null`); then the fields clear, focus returns to Name, and VoiceOver announces "Added …" | R5.3, R5.5 |
| C-ADD-07 | Adding three items in a row keeps the sheet open | DD10 |
| C-ADD-08 | Quick-add chips are grouped by category; an open match shows a disabled ✓ chip | R6.1, R6.2 |
| C-ADD-09 | Tapping an enabled chip calls `addItem({ name, category, quantity: null })` | R6.3 |

### 4.8 Errors and Connectivity (tasks 3.4, 5.5, 6.2)

| ID | Test | Req |
|---|---|---|
| C-ERR-01 | A tab screen that throws shows `CrashScreen` ("Something went wrong", Try again); the root layout stays mounted | R14.6 |
| C-ERR-02 | Try again re-renders the screen | R14.6 |
| C-ERR-03 | `CrashScreen` shows no error message, code or stack trace; the error is captured | R14.6, R14.9 |
| C-NET-01 | Offline: every `Screen` shows "Offline — changes will send when you're back online"; online, the banner is gone | R13.1 |
| C-NET-02 | The reconnecting indicator renders the "Reconnecting…" pill in the Groceries header | R13.4 |

---

## 5. CI and Static Checks

| ID | Gate | Command | Req |
|---|---|---|---|
| CI-01 | Lint, including boundary and colour rules | `npm run lint` | R16.7, R27.1 |
| CI-02 | Format | `npm run format:check` | R27.1 |
| CI-03 | Types, strict | `npm run typecheck` | R27.1 |
| CI-04 | Unit and component tests, with coverage thresholds (§9) | `npm test -- --ci --coverage` | R27.1 |
| CI-05 | Secrets scan | `npm run check:secrets` | R25.3 |
| CI-06 | Migrations apply from scratch, then seeds | `npx supabase start -x …` | R27.2 |
| CI-07 | Security advisor | `npx supabase db advisors --local --type security --fail-on warn` | R27.2 |
| CI-08 | Database lint, of the schemas that ship (not the seed-only `tests`) | `npx supabase db lint --local --schema public,private --fail-on error` | R27.2 |
| CI-09 | pgTAP suite (§2) | `npx supabase test db` | R27.2–R27.6 |
| CI-10 | Generated types match the migrations | `gen types` + `git diff --exit-code` | R27.2 |
| CI-11 | Workflow syntax | `actionlint` | R28 |
| CI-12 | Branch protection | PR required, `app` and `database` required, force pushes blocked (gate G5) | R27.7 |

---

## Part B — Manual Acceptance (Owner)

## 6. Manual Tests by Milestone

Run each block at the end of its milestone, before merging that milestone's PR, or at its checkpoint for M7 and M8. Tick each box when it passes. If one fails, open an issue citing the test ID, and fix it before moving on.

### 6.1 M1 — Simulator Smoke (after task 1.8)

- [ ] **MT-1-01** Run `npx expo run:ios`. The app opens with Groceries and Settings tabs and the DEV badge, and the home-screen name is "Kitchin Dev". (R1.5, R24.1, R24.2)
- [ ] **MT-1-02** Open the theme preview and compare it with the legacy app's colours (from `kitchin-app` locally, or SPEC §4.6). The brand colours and category badges match. (R16.1, R16.4)
- [ ] **MT-1-03** Turn on dark mode in the Simulator (Settings → Developer → Dark Appearance). The app stays light. (R16.6)
- [ ] **MT-1-04** Before the first push of app code, check the repo for real names and email addresses. Run `git grep -n -i '<your email or name>'` and `git log --format='%an %ae' | sort -u`. The tracked files contain none; decide whether the commit author metadata is acceptable for a public repo. (R25.6)

### 6.2 M3 — Sign-in Against the Local Stack (after task 3.8)

Start the stack with `npx supabase start`. The seed passwords are in `supabase/seed/10_seed_data.sql`.

- [ ] **MT-3-01** Sign in as A. You land on Groceries. (R1.4, R2.7)
- [ ] **MT-3-02** In Settings, tap Sign out and confirm. You're back on the sign-in screen. (R3.5, R15.2)
- [ ] **MT-3-03** Sign in as D. You see "No household access", with Sign out. (R1.3)
- [ ] **MT-3-04** Try A with a wrong password, then an unknown email. Both show the same message. (R2.5)
- [ ] **MT-3-05** Sign in as A, force-quit and relaunch. You're still signed in, and the sign-in screen never flashes. (R1.1, R3.1)
- [ ] **MT-3-06** With A signed in, run `npx supabase stop` and relaunch. You see "Can't reach Kitchin". Run `npx supabase start`, and the app continues on its own (or after Retry). (R1.7)
- [ ] **MT-3-07** With the stack stopped, try Sign out. You see "Signing out needs a connection", and you stay signed in. (R3.9)
- [ ] **MT-3-08** Settings shows A's email, the version with its build number, and "development". (R15.1)
- [ ] **MT-3-09** Run `curl -s -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: <local publishable key>" -H "Content-Type: application/json" -d '{"email":"new@example.com","password":"a-long-password-123"}'`. Sign-up is refused. (R18.1, R18.4)
- [ ] **MT-3-10** *Optional session-revocation drill.* Set `jwt_expiry = 60` in `supabase/config.toml` and don't commit it. Restart the stack and sign in as A. Run `delete from auth.sessions where user_id = '<A>'` in Studio, then wait 60–90 seconds with the app in the foreground. You're back on sign-in with "Please sign in again". Revert the config afterwards. (R3.6, R3.8)

### 6.3 M4 — Grocery List on the Simulator (after task 4.8)

- [ ] **MT-4-01** Add "Eggs" with quantity "1 dozen". It appears at once under Dairy & Eggs. (R5.1, R5.5)
- [ ] **MT-4-02** Type "bananas": Produce is preselected. Tap Bakery, then keep typing: Bakery stays selected. (R5.2)
- [ ] **MT-4-03** Type "eggs " while Eggs is open on the list. You see "Eggs is already on the list.", and Add is disabled. (R5.6)
- [ ] **MT-4-04** Tap the "Milk" quick-add chip. Milk is added, and the chip now shows ✓ and is disabled. (R6.2, R6.3)
- [ ] **MT-4-05** Check Eggs. It moves to the bottom of its section and is struck through. Uncheck it, and it moves back. (R4.4, R4.6, R7.5)
- [ ] **MT-4-06** Check Milk, add "milk" again, then try to uncheck the first Milk. It stays checked, with "Milk is already on the list". (R21.3, edge case 22)
- [ ] **MT-4-07** Change Eggs' quantity to "2 dozen", then clear it. Both changes show immediately. (R8.1–R8.3)
- [ ] **MT-4-08** Swipe left on an item and delete it. It disappears without a confirmation. (R9.1, R9.2)
- [ ] **MT-4-09** Check three items, then tap Clear checked. The prompt says "Clear 3 checked items?". Cancel changes nothing; Clear removes exactly those three. (R10.1–R10.5)
- [ ] **MT-4-10** Delete everything. You see the empty state, and the header has no percentage. (R4.8)
- [ ] **MT-4-11** Pull down on the list. It reloads. (R4.11)
- [ ] **MT-4-12** Cut the Mac's network (Wi-Fi off, or Network Link Conditioner at 100 % loss). The offline banner appears. Add an item and check another; both show immediately. Restore the network: both are saved, in order, and the banner goes away. (R13.1–R13.3)
- [ ] **MT-4-13** VoiceOver (Accessibility Inspector, or a device). A row reads like "Milk, 1 gallon, not checked"; the actions "Edit quantity" and "Delete" work; a disabled chip is announced as dimmed. (N10)
- [ ] **MT-4-14** Set the largest standard text size (Settings → Accessibility → Display & Text Size → Larger Text, at the largest non-accessibility size). No control is clipped, and names wrap. (N12, R4.5)
- [ ] **MT-4-15** Turn on Reduce Motion. The skeleton has no shimmer, and checking an item doesn't animate. (N14)
- [ ] **MT-4-16** Load 300 items with the snippet in §8.2, then scroll the whole list. It's smooth, with no blank areas that linger. (N3)
- [ ] **MT-4-17** Add a 200-character name: it wraps in full. A 201-character name is blocked. (R4.5, R5.4)
- [ ] **MT-4-18** Run the Accessibility Inspector's contrast audit on Groceries, Add item, Settings and Sign-in. It finds no text-contrast failures. (N13)
- [ ] **MT-4-19** Open the add-item sheet and type with the keyboard up. The fields and the Add button stay reachable (OI-5).

### 6.4 M5 — Two Simulators Against the Local Stack (after task 5.6)

Run `scripts/two-sims.sh`. Sign in as A on simulator 1 and as B on simulator 2.

- [ ] **MT-5-01** Add an item on A. It appears on B within about 1 second, and the reverse works too. (R11.1, N1)
- [ ] **MT-5-02** Check, uncheck, change a quantity, delete and clear checked on A. Each one shows up on B. (R11.2)
- [ ] **MT-5-03** Tap the same quick-add chip on both at nearly the same moment. Exactly one item results, and neither simulator shows an error. (R6.4)
- [ ] **MT-5-04** Check two items. On A, open Clear checked and leave the prompt showing "2". On B, uncheck one of them. Then confirm on A. The item B unchecked survives. (R10.4)
- [ ] **MT-5-05** Take B offline. On A, delete an item; on B, check that item. Bring B back online. B removes it and shows "That item was removed on another device". (R12.5)
- [ ] **MT-5-06** Send B to the home screen. Make three changes on A, wait one minute, then reopen B. B shows all three. (R11.3)
- [ ] **MT-5-07** Stop Realtime with the `docker stop` command that `two-sims.sh` prints. Within about 3 seconds both show "Reconnecting…", and a change on A doesn't reach B live. Start it again with the `docker start` command: the indicator goes away, and B reloads and shows the change. Not `docker pause`: a paused container leaves the socket open, so the app notices only when a heartbeat goes unanswered, 25 to 50 seconds later. (R11.3, R11.6, R13.4, R13.5)
- [ ] **MT-5-08** Change the same item's quantity on A and B at about the same time. Both settle on the same value. (R8.4)
- [ ] **MT-5-09** Check 20 items on A and clear them. B updates in one step, without flickering item by item. (R11.4)
- [ ] **MT-5-10** Sign in as C on simulator 2. It shows none of Household 1's items, and changes on A never appear there. (R19.2, R22.1)

### 6.5 M6 — Error Reporting Privacy (after task 6.2)

- [ ] **MT-6-01** With the DSN in `.env.local`, build in Release configuration (`SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release`; the upload token exists only in EAS) and tap "Send test error". An event arrives in Sentry under environment `development`. (R15.3, R26.8)
- [ ] **MT-6-02** Open that event. The user is a UUID only; there's no email, IP address, token or item text; breadcrumb URLs have no query strings; there are no screenshots or view hierarchy. (R26.3, R26.4, R26.6, R26.11)
- [ ] **MT-6-03** In a debug build (`npx expo run:ios`), tap "Send test error". No event arrives. (R26.8)
- [ ] **MT-6-04** In Sentry project settings, Data Scrubber, the default scrubbers and "Prevent Storing of IP Addresses" are all on. (R26.10)

### 6.6 M7 — Production Configuration (at the M7 checkpoint)

These run against production with only the **publishable** key, which is public. Never use the secret key.

- [ ] **MT-7-01** The deploy waits for your approval; the dry-run step lists the pending migrations; after you approve, the post-deploy advisors step passes. (R28.2, R28.4, R28.6)
- [ ] **MT-7-02** Start "Deploy database" with `workflow_dispatch` on a branch other than `main`. The job is skipped. (R28.3)
- [ ] **MT-7-03** `curl -s -X POST https://<ref>.supabase.co/auth/v1/signup -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{"email":"new@example.com","password":"a-long-password-123"}'` is refused. (R18.1, R18.4)
- [ ] **MT-7-04** `curl -s https://<ref>.supabase.co/rest/v1/grocery_items -H "apikey: <publishable key>"` returns a permission error, not rows. (R19.3)
- [ ] **MT-7-05** In the dashboard: anonymous sign-ins are off; the minimum password length is 12; only the Email provider is enabled; Realtime's "Allow public access" is off. (R18.2, R18.3, R18.5, R22.4)
- [ ] **MT-7-06** After provisioning, Table Editor shows 1 `households` row, 2 `household_members` rows and 1 `grocery_lists` row. (R21.1, R23.2)
- [ ] **MT-7-07** The Security Advisor shows no errors. (R28.6)
- [ ] **MT-7-08** In EAS environment variables (`production`), the URL, publishable key and DSN are present as plaintext, `SENTRY_AUTH_TOKEN` is a **secret**, and the `development` environment holds no production values. (R24.6, R25.4)

### 6.7 M8 — Two Phones on Production (TestFlight acceptance)

This proves the Success Criteria in 1-requirements.

- [ ] **MT-8-01** Install Kitchin from TestFlight on both phones. The name is "Kitchin", there's no DEV badge, and Settings shows "production". (R24.2, R29.1, R15.4)
- [ ] **MT-8-02** Sign in on both phones, using the key icon on the keyboard to fill the saved password. (R2.2)
- [ ] **MT-8-03** Both show the same empty list. Add five items on phone 1; they appear on phone 2 within about 1 second. (SC1, SC2, N1)
- [ ] **MT-8-04** Check, edit, delete and clear on phone 2. Each change shows up on phone 1. (SC2)
- [ ] **MT-8-05** Turn on airplane mode on phone 1. The offline banner appears. Make a change, then turn airplane mode off. The change syncs to phone 2. (SC3, R13.1–R13.3)
- [ ] **MT-8-06** Force-quit both and reopen. Both are still signed in, with the data intact. (SC4, R3.1)
- [ ] **MT-8-07** Sign out on phone 1. It returns to sign-in, and phone 2 is unaffected. (SC4, R3.7)
- [ ] **MT-8-08** In Sentry, the release has source-map artifacts, and there are no unexpected errors. (SC6, R26.9)
- [ ] **MT-8-09** In App Store Connect, the build isn't held for "Missing Compliance", and the app icon is correct. (R29.3, R29.5)
- [ ] **MT-8-10** *Optional lost-phone drill.* In the dashboard, sign phone 2's user out of all sessions. Phone 2 returns to sign-in within about an hour, at its next refresh in the foreground. Sign back in afterwards. (R3.8)
- [ ] **MT-8-11** The Actions history shows that only "Deploy database" has ever applied migrations to production. (SC7, R28.2)

---

## 7. BDD Scenarios

These pin down the behaviours most likely to be misread. Each scenario maps to the automated and manual tests named in its tag.

```gherkin
Feature: One shared grocery list on two phones
  As a household member
  I want changes on either phone to appear on the other
  So that we shop from the same list

  Background:
    Given members A and B belong to Household One
    And both are signed in with the app in the foreground

  @U-MUT-01 @U-RT-01 @MT-5-01
  Scenario: An item added on one phone appears on the other
    When A adds "Eggs" to Dairy & Eggs
    Then A sees "Eggs" immediately
    And B sees "Eggs" within 2 seconds

  @DB-G-20 @U-MUT-03 @MT-5-03
  Scenario: Both members quick-add the same item at the same moment
    When A and B both tap the "Milk" chip at the same moment
    Then exactly one open "Milk" is on the list
    And neither member sees an error

  @DB-G-29 @MT-5-04
  Scenario: Clear checked doesn't remove an item the other member just unchecked
    Given "Bread" and "Butter" are checked
    And A has opened Clear checked, which shows 2 items
    When B unchecks "Butter"
    And A confirms Clear checked
    Then "Bread" is removed
    And "Butter" is still on the list, open
```

```gherkin
Feature: Working through a dropped connection
  @U-MUT-13 @U-MUT-14 @MT-4-12 @MT-8-05
  Scenario: Changes made offline are sent in order
    Given A's phone goes offline
    When A adds "Flour" and then checks "Flour"
    Then A sees "Flour" checked immediately
    And A sees "Offline — changes will send when you're back online"
    When A's phone comes back online
    Then "Flour" is saved first, and then checked
    And B sees "Flour" checked

  @U-MUT-06 @MT-5-05
  Scenario: Editing an item that was deleted on the other phone
    Given A's phone is offline
    And B deletes "Rice"
    When A checks "Rice"
    And A's phone comes back online
    Then "Rice" disappears from A's list
    And A sees "That item was removed on another device"
```

```gherkin
Feature: Only household members can see household data
  @DB-G-02 @DB-G-04 @DB-R-03 @MT-5-10
  Scenario: A member of another household sees nothing
    Given C belongs to Household Two
    When C reads grocery items, or subscribes to Household One's channel
    Then C receives no Household One items or events
    And C's attempt to insert into Household One fails with "42501"

  @DB-H-04 @C-RTE-03 @MT-3-03
  Scenario: An account with no household
    Given D exists but has no membership
    When D signs in
    Then D sees "No household access"
    And the database returns no household data to D
```

---

## 8. Test Data and Mocking

### 8.1 Database Fixtures (task 2.2, 2.5)

| File | Contents |
|---|---|
| `supabase/seed/00_test_helpers.sql` | Schema `tests`, local and CI only. **Invoker** helpers run as postgres: `create_user(email, password)`, `authenticate_as(email)` (sets `role` and `request.jwt.claims`), `authenticate_as_anon()`, `set_topic(household_id)`. **Security definer** helpers work under any role: `user_id(email)`, `household_id(name)`, `list_id(household_name)` — `EXECUTE` granted to `authenticated` and `anon`, so tests can look up IDs while acting as a user that RLS would block. `tests` is never exposed through the Data API and never deployed |
| `supabase/seed/10_seed_data.sql` | `member-a`/`member-b@example.com` in "Household One"; `member-c@example.com` in "Household Two"; `member-d@example.com` with no membership; local-only passwords documented in the file; a few items per household, some checked |

Each test file ends with `rollback`, so the seed stays the same for every file.

### 8.2 Manual-test Data

To load 300 items for MT-4-16, run this in the local Studio SQL editor (local only):

```sql
insert into public.grocery_items (household_id, list_id, name, category)
select h.id, l.id, 'Test item ' || g, (array['produce','meat','dairy','pantry','frozen','bakery','other'])[1 + g % 7]
from public.households h
join public.grocery_lists l on l.household_id = h.id
cross join generate_series(1, 300) g
where h.name = 'Household One';
```

Clear them afterwards with `delete from public.grocery_items where name like 'Test item %';`.

### 8.3 Jest Fixtures and Factories

| Fixture | Location | Used by |
|---|---|---|
| `makeItem(overrides)` and `makeRow(overrides)` | `src/test/factories.ts` | Domain, hooks and component tests |
| `makePostgrestError(code, { constraint?, status? })` | `src/test/factories.ts` | Errors, API and mutation tests. Messages include household text, so U-ERR-11 can prove it gets dropped |
| `makeAuthError(kind)` | `src/test/factories.ts` | Errors and auth tests |
| `makeJwt(payload)` | `src/test/jwt.ts` (base64url, built at runtime) | env-guard and secrets tests |
| Captured broadcast payload | `src/lib/realtime/__fixtures__/broadcast-insert.json` (row values replaced with placeholders) | U-CH-08 |
| A fake channel | `src/test/fake-channel.ts` | Channel tests |

### 8.4 Mock Strategy

| Dependency | Mocked in | Approach |
|---|---|---|
| `supabase-js` | `api.ts`, auth-provider and channel tests only | A small chainable stub returning `{ data, error }` |
| `src/features/*/api.ts` | Hook and component tests | `jest.mock` with per-test resolved and rejected values |
| `expo-secure-store`, AsyncStorage, `expo-crypto` | Session storage tests | In-memory maps; deterministic random bytes |
| NetInfo and `onlineManager` | Hook, banner and household tests | `onlineManager.setOnline(bool)` |
| AppState and `focusManager` | Client, channel and indicator tests | `focusManager.setFocused(bool)` and a mocked AppState emitter |
| Timers | Coalescer and indicator tests | `jest.useFakeTimers()` |
| `@sentry/react-native` | Reporting and boundary tests | `jest.mock`, asserting the arguments of `captureException`, `setUser` and `init` |
| `react-native-reanimated` | Component tests | The library's Jest mock |

`domain.ts`, `errors.ts`, `env-guard.ts`, `sentry-scrub.ts` and the coalescer are never mocked: they are the units under test, or real collaborators.

---

## 9. Coverage Goals

`jest.config.js` enforces these thresholds (task 1.2). CI-04 fails below them.

| Scope | Lines | Branches |
|---|---|---|
| `src/features/*/domain.ts`, `src/lib/errors.ts`, `src/lib/env-guard.ts`, `src/lib/sentry-scrub.ts`, `src/lib/realtime/coalescer.ts`, `src/lib/secure-session-storage.ts`, `scripts/check-secrets.mjs` | 95 % | 90 % |
| `src/features/groceries/hooks.ts`, `src/features/*/api.ts`, `src/features/auth/*`, `src/features/household/*`, `src/lib/realtime/household-channel.ts` | 90 % | 85 % |
| Everything else in `src/` | 75 % | 70 % |

Excluded: `src/types/database.ts` (generated), `src/app/**/_layout.tsx` (covered by route tests rather than line counts), and test files.

**Beyond line coverage:**

- Every acceptance criterion that can be tested automatically has at least one test ID in §10; the rest have an `MT-*` ID.
- Every `public` table appears in a behavioural pgTAP file. Adding a table without one fails review (SPEC Appendix B step 2).

---

## 10. Requirements → Tests Matrix

| Requirement | Automated | Manual |
|---|---|---|
| R1 App states and routing | U-AUTH-01, U-HH-01–06, C-RTE-01–06 | MT-1-01, MT-3-01, MT-3-03, MT-3-05, MT-3-06 |
| R2 Sign in | U-AUTH-02–04, U-ERR-02, U-ERR-03, C-SIGN-01–07 | MT-3-01, MT-3-04, MT-8-02 |
| R3 Session lifetime and sign out | U-SES-01–07, U-SBC-01–02, U-AUTH-05–08, U-CH-06–07, U-COA-04, C-RTE-08–09, C-SET-02–03 | MT-3-02, MT-3-05, MT-3-07, MT-3-10, MT-8-06, MT-8-07, MT-8-10 |
| R4 List view | U-DOM-01, U-DOM-07–09, U-API-01, U-MUT-19, C-GRO-01–09 | MT-4-05, MT-4-10, MT-4-11, MT-4-14, MT-4-17 |
| R5 Add an item | DB-G-11, DB-G-20, DB-G-21, U-DOM-03–06, U-DOM-10, U-MUT-01–03, C-ADD-01–07 | MT-4-01–04, MT-4-17 |
| R6 Quick-add | U-DOM-02, U-DOM-11, U-MUT-03, C-UI-03, C-ADD-08–09 | MT-4-04, MT-5-03 |
| R7 Check and uncheck | DB-G-15–17, U-API-03, U-MUT-05, U-MUT-17, C-ITEM-01 | MT-4-05 |
| R8 Edit quantity | U-DOM-05, U-API-04, U-MUT-08, C-ITEM-02–03 | MT-4-07, MT-5-08 |
| R9 Delete an item | U-API-05, U-MUT-09–10, C-ITEM-04 | MT-4-08 |
| R10 Clear checked items | DB-G-29, U-API-06, U-MUT-11, C-ITEM-07–09 | MT-4-09, MT-5-04 |
| R11 Live updates | DB-R-08–09, U-COA-01–03, U-CH-02, U-CH-04–05, U-CH-08, U-RT-01–02, U-MUT-15 | MT-5-01, MT-5-02, MT-5-06, MT-5-07, MT-5-09 |
| R12 Instant feedback and conflicts | DB-G-28, U-API-02–04, U-MUT-01–11, U-MUT-15 | MT-5-05 |
| R13 Offline and connection states | U-MUT-12–14, U-MUT-19, U-CH-03, U-CH-05, U-RT-03–04, C-GRO-10, C-NET-01–02 | MT-4-12, MT-5-07, MT-8-05 |
| R14 Error handling | U-ERR-01–10, U-DOM-12–13, U-MUT-16, U-MUT-18, C-ERR-01–03 | — |
| R15 Settings | C-RTE-07, C-SET-01–05 | MT-3-02, MT-3-08, MT-6-01, MT-8-01 |
| R16 Visual identity | U-THM-01–06, U-LNT-01, U-CFG-05, C-UI-08, C-SIGN-08 | MT-1-02, MT-1-03 |
| R17 View preference | Not built (DD18) | — |
| R18 Account policy | DB-H-18 (metadata ignored) | MT-3-09, MT-7-03, MT-7-05 |
| R19 Household data isolation | DB-S-01–03, DB-S-05, DB-S-08–09, DB-S-11–13, DB-H-01–05, DB-H-13–14, DB-H-18, DB-G-01–09, DB-G-11–13, DB-G-30 | MT-5-10, MT-7-04 |
| R20 Households and memberships | DB-S-06, DB-H-01–03, DB-H-06–17 | — |
| R21 Grocery data integrity | DB-S-06, DB-G-09–10, DB-G-14, DB-G-18, DB-G-20–27, U-MUT-07 | MT-4-06, MT-7-06 |
| R22 Realtime authorization | DB-S-16, DB-R-01–10, U-CH-01 | MT-5-10, MT-7-05 |
| R23 Provisioning | DB-S-10, DB-P-01–07, U-AST-01 | MT-7-06 |
| R24 Variants and environments | U-ENV-01–09, U-CFG-01–07, C-RTE-07 | MT-1-01, MT-7-08, MT-8-01 |
| R25 Secrets and configuration | U-ENV-06–07, U-ENV-10, U-SEC-01–09, U-AST-01 | MT-1-04, MT-7-08 |
| R26 Error reporting and privacy | U-ERR-11, U-REP-01–04, U-SCR-01–10, U-API-07, U-RT-05, U-AUTH-08–09, C-GRO-11, C-SET-05 | MT-6-01–04, MT-8-08 |
| R27 Continuous integration | CI-01–12, every `DB-*` test | — |
| R28 Production database changes | CI-11 | MT-7-01, MT-7-02, MT-7-07, MT-8-11 |
| R29 iOS build and distribution | U-CFG-05, U-CFG-07, U-AST-02 | MT-8-01, MT-8-09 |
| N1–N3 Performance | U-MUT-01, U-COA-02, DB-S-15 | MT-4-16, MT-5-01, MT-8-03 |
| N4–N7 Reliability | DB-G-28, DB-R-10, U-MUT-04, U-MUT-12–15, U-CH-04 | MT-5-06, MT-5-07 |
| N8–N9 Security and privacy | Every `DB-S-*` test, U-SEC-*, U-SCR-10 | MT-7-03, MT-7-04 |
| N10–N14 Accessibility | U-THM-01–02, C-UI-01–07, C-ITEM-05–06, C-ITEM-10 | MT-4-13–15, MT-4-18 |
| N15 Per-device preferences | Nothing stored in the MVP | — |
| N16–N17 Maintainability | DB-S-14, U-LNT-02–03, the pure-module coverage thresholds (§9) | — |
| N18–N20 Cost and operability | — | Recurring owner tasks in `docs/TASKS.md` |

---

## 11. Risk-Based Prioritization

If time runs short, keep the tests in this order; the top of the list must never be skipped.

1. **Isolation and grants** (`DB-S-*`, `DB-H-*`, `DB-G-01–09`, `DB-R-01–07`). A mistake here exposes household data.
2. **Secrets and environment guards** (`U-SEC-*`, `U-ENV-*`, `U-CFG-01–02`, MT-7-03, MT-7-04). A mistake here leaks credentials or points a build at the wrong database.
3. **Report scrubbing** (`U-SCR-*`, `U-ERR-11`, MT-6-02). A mistake here sends household content to a third party.
4. **Mutation and sync correctness** (`U-MUT-*`, `U-CH-*`, `U-RT-*`, MT-5-*). A mistake here shows a wrong list, the most visible failure.
5. **Grocery rules** (`DB-G-15–29`, `U-DOM-*`).
6. **Screens, accessibility and visual identity** (`C-*`, MT-4-*).

---

## 12. Out of Scope for This Test Plan

- Automated end-to-end UI tests, including Maestro in CI (deferred; macOS runners cost too much).
- Load and stress testing beyond the 300-item scroll check: the real scale is two people.
- Android, iPad, web and dark mode, none of which are built.
- Penetration testing beyond the pgTAP suite, plus the MT-7 checks against production.
- Apple App Review, since internal TestFlight builds aren't reviewed.
- Requirement 17 (DD18) and anything else listed under Out of Scope in 1-requirements.
