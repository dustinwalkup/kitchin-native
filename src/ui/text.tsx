import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import type { ColourToken } from './theme';
import { useTheme } from './use-theme';

// The type scale (specs/redesign/design.md §3): iOS text styles, with weight and spacing doing the
// work that cards and borders used to. Each variant names a role, not a size.
const VARIANTS = {
  /** The sign-in wordmark. */
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.2 },
  /** A screen's own heading, such as an empty state or the crash screen. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  /** A day on Meals, or a group's heading inside a screen. */
  title2: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  /** Meal names in the library, form labels' big siblings, sheet titles. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  /** Grocery and planned-meal names, and ordinary text. */
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  /** Secondary labels: a meal type beside its meal, a setting's value, helper text. */
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Tag pills and counts. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** A small-caps section heading, such as "QUICK ADD" or "ACCOUNT". */
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

const WEIGHTS = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;

export type TextProps = Omit<RNTextProps, 'allowFontScaling' | 'maxFontSizeMultiplier'> & {
  variant?: TextVariant;
  color?: ColourToken;
  /** The same as `weight="bold"`. */
  bold?: boolean;
  weight?: keyof typeof WEIGHTS;
};

/**
 * Text that follows the iOS text size setting up to 2×, which covers the largest standard size
 * without letting accessibility sizes break layouts (N12).
 */
export function Text({
  variant = 'body',
  color = 'ink',
  bold = false,
  weight,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  // White on a brand colour meets contrast only in bold (DD19), so onBrand text is always bold.
  const fontWeight =
    bold || color === 'onBrand'
      ? WEIGHTS.bold
      : weight
        ? WEIGHTS[weight]
        : VARIANTS[variant].fontWeight;

  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[VARIANTS[variant], { color: theme[color], fontWeight }, style]}
    />
  );
}
