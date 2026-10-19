import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import type { ColourToken } from './theme';
import { useTheme } from './use-theme';

// iOS text styles (§3.10).
const VARIANTS = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '400' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '400' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export type TextProps = Omit<RNTextProps, 'allowFontScaling' | 'maxFontSizeMultiplier'> & {
  variant?: TextVariant;
  color?: ColourToken;
  bold?: boolean;
};

/**
 * Text that follows the iOS text size setting up to 2×, which covers the largest standard size
 * without letting accessibility sizes break layouts (N12).
 */
export function Text({ variant = 'body', color = 'ink', bold = false, style, ...rest }: TextProps) {
  const theme = useTheme();
  // White on a brand colour meets contrast only in bold (DD19), so onBrand text is always bold.
  const fontWeight = bold || color === 'onBrand' ? '700' : VARIANTS[variant].fontWeight;

  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[VARIANTS[variant], { color: theme[color], fontWeight }, style]}
    />
  );
}
