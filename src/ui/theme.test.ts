import type { CategoryKey } from '@/features/groceries/constants';
import { MEAL_TYPES } from '@/features/meals/constants';

import { BOUNDARY_PAIRS, ICON_PAIRS, TEXT_PAIRS, TINTS, themes } from './theme';

// specs/mvp/4-test-plan.md §3.3, and specs/meals/4-test-plan.md §3.7 from U-THM-07. Contrast follows WCAG 2.2: sRGB relative luminance, then
// (lighter + 0.05) / (darker + 0.05), never rounded up.

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const light = themes.light;

describe('contrast()', () => {
  it('matches WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
  });
});

describe('theme', () => {
  it.each(TEXT_PAIRS)('U-THM-01 $fg on $bg meets $min:1', ({ fg, bg, min }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('U-THM-02 every pair below 4.5:1 is bold only', () => {
    const notBold = TEXT_PAIRS.filter(
      (pair) => contrast(pair.fg, pair.bg) < 4.5 && !(pair.bold && pair.min === 3),
    );

    expect(notBold).toEqual([]);
  });

  it.each(BOUNDARY_PAIRS)('control boundary $fg on $bg meets 3:1 (N13)', ({ fg, bg }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('U-THM-03 palette values equal SPEC §4.6', () => {
    expect(light).toMatchObject({
      primary: '#3d8b82',
      secondary: '#f2a6b3',
      tertiary: '#aabba1',
      accent: '#d16c48',
      sand: '#eed6c4',
      cactus: '#ce5a67',
      ink: '#2b3a42',
      background: '#ffffff',
      screen: '#faf3ed',
      text: '#0a0a0a',
      border: '#e5e5e5',
      destructive: '#e7000b',
      radius: { base: 10, card: 14 },
      category: {
        produce: { bg: '#dcfce7', fg: '#166534' },
        meat: { bg: '#fee2e2', fg: '#991b1b' },
        dairy: { bg: '#dbeafe', fg: '#1e40af' },
        pantry: { bg: '#fef9c3', fg: '#854d0e' },
        frozen: { bg: '#cffafe', fg: '#155e75' },
        bakery: { bg: '#ffedd5', fg: '#9a3412' },
        other: { bg: '#f3f4f6', fg: '#1f2937' },
      },
    });
  });

  it.each(Object.entries(TINTS))(
    'U-THM-04 %s is its source colour over white at the stated alpha',
    (token, { source, alpha }) => {
      const expected = channels(light[source]).map((c) => c * alpha + 255 * (1 - alpha));
      const actual = channels(light[token as keyof typeof TINTS]);

      actual.forEach((channel, i) =>
        expect(Math.abs(channel - expected[i])).toBeLessThanOrEqual(1),
      );
    },
  );

  // Listing the keys in a Record makes the compiler reject this file when a category is added.
  const CATEGORY_KEYS = Object.keys({
    produce: true,
    meat: true,
    dairy: true,
    pantry: true,
    frozen: true,
    bakery: true,
    other: true,
  } satisfies Record<CategoryKey, true>) as CategoryKey[];

  it.each(CATEGORY_KEYS)('U-THM-05 %s has a badge pair', (key) => {
    expect(light.category[key]).toEqual({
      bg: expect.stringMatching(/^#[0-9a-f]{6}$/),
      fg: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
    expect(TEXT_PAIRS).toContainEqual({
      fg: light.category[key].fg,
      bg: light.category[key].bg,
      min: 4.5,
    });
  });

  it('U-THM-06 the dark theme equals the light theme for the MVP', () => {
    expect(themes.dark).toEqual(themes.light);
  });

  it.each(ICON_PAIRS)('U-THM-07 icon $fg on $bg meets 3:1 (N13)', ({ fg, bg }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('U-THM-08 terracotta may carry bold text on white and on the sand screen', () => {
    expect(TEXT_PAIRS).toContainEqual({
      fg: light.accent,
      bg: light.background,
      min: 3,
      bold: true,
    });
    expect(TEXT_PAIRS).toContainEqual({ fg: light.accent, bg: light.screen, min: 3, bold: true });
  });

  // A token change to a meal type can't skip measurement.
  it.each(MEAL_TYPES)('U-THM-09 the $key icon is an ICON_PAIRS entry', ({ glyph, tint }) => {
    expect(ICON_PAIRS).toContainEqual({ fg: light[glyph], bg: light[tint] });
  });
});
