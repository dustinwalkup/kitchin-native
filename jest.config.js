// @ts-check
const fs = require('node:fs');

// Coverage thresholds from specs/mvp/4-test-plan.md §9. Files that no group matches fall
// under `global` ("everything else in src/").
const CORE = { lines: 95, branches: 90 };
const DATA = { lines: 90, branches: 85 };
const REST = { lines: 75, branches: 70 };

const thresholdGroups = [
  {
    threshold: CORE,
    patterns: [
      './src/features/*/domain.ts',
      './src/lib/errors.ts',
      // Task 1.5 may convert env-guard to CommonJS (OI-1).
      './src/lib/env-guard.{ts,js}',
      './src/lib/sentry-scrub.ts',
      './src/lib/realtime/coalescer.ts',
      './src/lib/secure-session-storage.ts',
      './scripts/check-secrets.mjs',
    ],
  },
  {
    threshold: DATA,
    patterns: [
      './src/features/groceries/hooks.ts',
      './src/features/*/api.ts',
      './src/features/auth/*',
      './src/features/household/*',
      './src/lib/realtime/household-channel.ts',
    ],
  },
];

const TEST_FILE = /(\.test\.[cm]?[jt]sx?|\.d\.ts)$/;

// Jest fails the run when a threshold path matches no files, and most of these modules arrive
// in later tasks. Each pattern starts being enforced once a source file matching it exists.
function hasSourceFile(pattern) {
  return fs
    .globSync(pattern, { cwd: __dirname, withFileTypes: true })
    .some((entry) => entry.isFile() && !TEST_FILE.test(entry.name));
}

/** @type {Record<string, { lines: number, branches: number }>} */
const coverageThreshold = { global: REST };
for (const { threshold, patterns } of thresholdGroups) {
  for (const pattern of patterns) {
    if (hasSourceFile(pattern)) coverageThreshold[pattern] = threshold;
  }
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Generated native projects (CNG) contain JavaScript that Jest must not crawl.
  modulePathIgnorePatterns: ['<rootDir>/ios/', '<rootDir>/android/'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    'scripts/check-secrets.mjs',
    '!src/types/database.ts',
    '!src/app/**/_layout.tsx',
    '!src/test/**',
    '!**/__tests__/**',
    '!**/__fixtures__/**',
    '!**/*.test.{js,jsx,ts,tsx,mjs}',
    '!**/*.d.ts',
  ],
  coverageThreshold,
};
