/**
 * @jest-environment node
 */

// specs/mvp/4-test-plan.md §3.14. The committed provisioning template must never hold real values:
// the owner fills it in inside the production SQL editor (R23.2, R23.6, R25.6).

// tsconfig keeps Node's global types out of app code. Jest runs this file as CommonJS, so it exists.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>('node:fs');

const template = readFileSync(`${__dirname}/provision-household.sql`, 'utf8');
const code = template.replace(/--.*$/gm, '');

describe('provisioning template', () => {
  it('U-AST-01 contains no @ anywhere, comments included, so no email address', () => {
    expect(template).not.toContain('@');
  });

  it('U-AST-01 passes only <…> placeholders to provision_household', () => {
    expect(code).toContain('private.provision_household(');
    const strings = [...code.matchAll(/'([^']*)'/g)].map(([, value]) => value);
    expect(strings).toEqual([
      '<HOUSEHOLD_NAME>',
      '<IANA_TIME_ZONE>',
      '<EMAIL_1>',
      '<EMAIL_2>',
      '<DISPLAY_NAME_1>',
      '<DISPLAY_NAME_2>',
    ]);
  });

  it('U-AST-01 has no dollar-quoted string that could hide a value from the check above', () => {
    expect(code).not.toContain('$');
  });
});
