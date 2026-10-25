import { MEAL_TYPES } from '@/features/meals/constants';

import { BOUNDARY_PAIRS, ICON_PAIRS, TEXT_PAIRS, TINTS, themes } from './theme';

// specs/mvp/4-test-plan.md §3.3, specs/meals/4-test-plan.md §3.7 from U-THM-07, and the redesign's
// palette (specs/redesign/design.md §2). Contrast follows WCAG 2.2: sRGB relative luminance, then
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

/** The token names that hold `hex`, so a failure names the pair, not two hex values. */
function tokensFor(hex: string): string {
  return (Object.keys(light) as (keyof typeof light)[])
    .filter((key) => light[key] === hex)
    .join(' / ');
}

const named = <T extends { fg: string; bg: string }>(pairs: readonly T[]) =>
  pairs.map((pair) => ({ ...pair, fgName: tokensFor(pair.fg), bgName: tokensFor(pair.bg) }));

describe('contrast()', () => {
  it('matches WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
  });
});

describe('theme', () => {
  it.each(named(TEXT_PAIRS))('U-THM-01 $fgName on $bgName meets $min:1', ({ fg, bg, min }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('U-THM-02 every pair below 4.5:1 is bold only', () => {
    const notBold = TEXT_PAIRS.filter(
      (pair) => contrast(pair.fg, pair.bg) < 4.5 && !(pair.bold && pair.min === 3),
    );

    expect(notBold).toEqual([]);
  });

  it('U-THM-02 marks a pair bold only when it needs to be, at a 3:1 minimum', () => {
    for (const pair of TEXT_PAIRS) {
      expect(pair.bold === true).toBe(pair.min === 3);
    }
  });

  it.each(named(BOUNDARY_PAIRS))(
    'control boundary $fgName on $bgName meets 3:1 (N13)',
    ({ fg, bg }) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    },
  );

  it('measures the checkbox outline, its only boundary, on both surfaces (DD-R4)', () => {
    expect(BOUNDARY_PAIRS).toEqual([
      { fg: light.controlBorder, bg: light.background },
      { fg: light.controlBorder, bg: light.screen },
    ]);
  });

  it('every measured pair is made of theme colours', () => {
    const colours = new Set<string>(
      Object.values(light).filter((value) => typeof value === 'string'),
    );
    const pairs = [...TEXT_PAIRS, ...BOUNDARY_PAIRS, ...ICON_PAIRS];

    expect(pairs.flatMap(({ fg, bg }) => [fg, bg]).filter((c) => !colours.has(c))).toEqual([]);
  });

  it('U-THM-03 palette values equal specs/redesign/design.md §2', () => {
    expect(light).toEqual({
      screen: '#f8f1e9',
      background: '#fffefc',
      sunken: '#f0e8de',
      ink: '#29363b',
      inkMuted: '#5f696c',
      inkDisabled: '#bfc3c4',
      onBrand: '#ffffff',
      border: '#e9e2da',
      controlBorder: '#8f867e',
      accent: '#d96e4d',
      accentInk: '#a84d30',
      accentSoft: '#faebe6',
      sage: '#6b8a6e',
      sageInk: '#4a6a4e',
      sageSoft: '#eaefeb',
      destructive: '#b3382a',
      breakfast: '#d96e4d',
      lunch: '#b8862e',
      dinner: '#5f7f86',
      radius: { sm: 8, base: 10, card: 14, pill: 999 },
      space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    });
  });

  it('U-THM-03 drops the desert palette and the category badge colours (DD-R1)', () => {
    for (const token of [
      'primary',
      'secondary',
      'tertiary',
      'cactus',
      'sand',
      'text',
      'category',
    ]) {
      expect(light).not.toHaveProperty(token);
    }
  });

  it('U-THM-03 uses the one accent for breakfast', () => {
    expect(light.breakfast).toBe(light.accent);
  });

  it('U-THM-04 lists the three tints', () => {
    expect(TINTS).toEqual({
      inkDisabled: { source: 'ink', alpha: 0.3 },
      accentSoft: { source: 'accent', alpha: 0.14 },
      sageSoft: { source: 'sage', alpha: 0.14 },
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

  it('U-THM-06 the dark theme equals the light theme', () => {
    expect(themes.dark).toEqual(themes.light);
  });

  it.each(named(ICON_PAIRS))('U-THM-07 icon $fgName on $bgName meets 3:1 (N13)', ({ fg, bg }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('U-THM-08 terracotta carries text only in bold and only on white; accentInk at any weight', () => {
    const accentText = TEXT_PAIRS.filter((pair) => pair.fg === light.accent);
    expect(accentText).toEqual([{ fg: light.accent, bg: light.background, min: 3, bold: true }]);
    // Terracotta on the ivory page is under 3:1, so it can't carry text there at all.
    expect(contrast(light.accent, light.screen)).toBeLessThan(3);

    for (const bg of [light.background, light.screen, light.accentSoft]) {
      expect(TEXT_PAIRS).toContainEqual({ fg: light.accentInk, bg, min: 4.5 });
    }
  });

  it('white carries text on terracotta only in bold, and on ink and destructive at any weight', () => {
    expect(TEXT_PAIRS.filter((pair) => pair.fg === light.onBrand)).toEqual([
      { fg: light.onBrand, bg: light.accent, min: 3, bold: true },
      { fg: light.onBrand, bg: light.destructive, min: 4.5 },
      { fg: light.onBrand, bg: light.ink, min: 4.5 },
    ]);
  });

  it('measures muted text on the sunken tone: placeholders, counts, segments and the pill', () => {
    expect(TEXT_PAIRS).toContainEqual({ fg: light.inkMuted, bg: light.sunken, min: 4.5 });
    // 4.6465…, truncated rather than rounded up.
    expect(contrast(light.inkMuted, light.sunken)).toBeGreaterThanOrEqual(4.64);
    expect(contrast(light.inkMuted, light.sunken)).toBeLessThan(4.65);
  });

  it('measures muted text on every surface it sits on', () => {
    for (const bg of [light.background, light.screen, light.sunken]) {
      expect(TEXT_PAIRS).toContainEqual({ fg: light.inkMuted, bg, min: 4.5 });
    }
  });

  it('measures terracotta icons on the ivory page in accentInk, since accent is under 3:1 there', () => {
    expect(ICON_PAIRS).toContainEqual({ fg: light.accentInk, bg: light.screen });
    expect(ICON_PAIRS).not.toContainEqual({ fg: light.accent, bg: light.screen });
    // Terracotta glyphs on white, such as the tabs, keep the accent itself.
    expect(ICON_PAIRS).toContainEqual({ fg: light.accent, bg: light.background });
  });

  it('measures the sage count and the checked box', () => {
    expect(TEXT_PAIRS).toContainEqual({ fg: light.sageInk, bg: light.sageSoft, min: 4.5 });
    expect(ICON_PAIRS).toContainEqual({ fg: light.onBrand, bg: light.sage });
  });

  // A token change to a meal type can't skip measurement.
  it.each(MEAL_TYPES)('U-THM-09 the $key glyph on white is an ICON_PAIRS entry', ({ glyph }) => {
    expect(ICON_PAIRS).toContainEqual({ fg: light[glyph], bg: light.background });
  });

  it('U-THM-10 tag pills may carry ink on accentSoft, measured at 10.73:1', () => {
    expect(TEXT_PAIRS).toContainEqual({ fg: light.ink, bg: light.accentSoft, min: 4.5 });
    // 10.7357…, truncated rather than rounded up.
    expect(contrast(light.ink, light.accentSoft)).toBeGreaterThanOrEqual(10.73);
    expect(contrast(light.ink, light.accentSoft)).toBeLessThan(10.74);
  });
});
