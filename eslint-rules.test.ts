/**
 * @jest-environment node
 */
import { ESLint } from 'eslint';

import config from './eslint.config.js';

// specs/mvp/4-test-plan.md §3.4. Each fixture is linted with the real config as if it lived at the
// given path, so a §2.2 rule that silently stops firing after an upgrade fails here.

// tsconfig keeps Node's global types out of app code. Jest runs this file as CommonJS, so it exists.
declare const __dirname: string;

// Passing the config directly avoids ESLint's dynamic import() of the config file, which Jest's
// CommonJS runtime doesn't support. Fixture paths resolve against `cwd`.
const eslint = new ESLint({ cwd: __dirname, overrideConfigFile: true, overrideConfig: config });

async function countErrors(filePath: string, code: string, ruleId: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === ruleId && message.severity === 2)
    .length;
}

const COMPONENT = 'src/features/groceries/components/item-row.tsx';

describe('ESLint layer rules (§2.2)', () => {
  it.each([
    ['a 6-digit hex', "export const c = '#3d8b82';"],
    ['a 3-digit hex', "export const c = '#FFF';"],
    ['an 8-digit hex', "export const c = '#2b3a42cc';"],
    ['rgb()', "export const c = 'rgb(43, 58, 66)';"],
    ['rgba()', "export const c = 'rgba(43, 58, 66, 0.5)';"],
    ['an rgba() template', 'export const c = (a: number) => `rgba(43, 58, 66, ${a})`;'],
    ['a JSX attribute', 'export const C = () => <Icon color="#ce5a67" />;'],
  ])('U-LNT-01 flags %s in a component', async (_name, code) => {
    expect(await countErrors(COMPONENT, code, 'no-restricted-syntax')).toBe(1);
  });

  it('U-LNT-01 allows the same literals in src/ui/theme.ts', async () => {
    const code = [
      "export const a = '#3d8b82';",
      "export const b = 'rgba(43, 58, 66, 0.5)';",
      'export const c = (x: number) => `rgba(43, 58, 66, ${x})`;',
    ].join('\n');
    expect(await countErrors('src/ui/theme.ts', code, 'no-restricted-syntax')).toBe(0);
  });

  it.each([
    ['a route', 'src/app/(app)/(tabs)/groceries.tsx', '@/lib/supabase'],
    ['a feature component', COMPONENT, '@/lib/supabase'],
    ['a shared component', 'src/components/header.tsx', '@/lib/supabase'],
    ['a feature component, by relative path', COMPONENT, '../../../lib/supabase'],
  ])('U-LNT-02 flags the Supabase client imported from %s', async (_name, filePath, source) => {
    const code = `import { supabase } from '${source}';\nexport const s = supabase;`;
    expect(await countErrors(filePath, code, 'no-restricted-imports')).toBe(1);
  });

  it('U-LNT-02 allows the Supabase client in a feature api.ts', async () => {
    const code = "import { supabase } from '@/lib/supabase';\nexport const s = supabase;";
    expect(await countErrors('src/features/groceries/api.ts', code, 'no-restricted-imports')).toBe(
      0,
    );
  });

  it.each([
    "import { useMemo } from 'react';",
    "import { Platform } from 'react-native';",
    "import { createClient } from '@supabase/supabase-js';",
    "import { useQuery } from '@tanstack/react-query';",
    "import { supabase } from '@/lib/supabase';",
  ])('U-LNT-03 flags `%s` in a domain.ts', async (code) => {
    expect(
      await countErrors('src/features/groceries/domain.ts', code, 'no-restricted-imports'),
    ).toBe(1);
  });

  it('U-LNT-03 allows pure imports in a domain.ts', async () => {
    const code = "import { CATEGORIES } from './constants';\nexport const all = CATEGORIES;";
    expect(
      await countErrors('src/features/groceries/domain.ts', code, 'no-restricted-imports'),
    ).toBe(0);
  });
});
