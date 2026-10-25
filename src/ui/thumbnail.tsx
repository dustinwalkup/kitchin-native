import { Image } from 'expo-image';
import { type SFSymbol, SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { type DimensionValue, StyleSheet, View } from 'react-native';

import type { ColourToken } from './theme';
import { useTheme } from './use-theme';

export interface ThumbnailProps {
  /** A URL to show, or none for the placeholder. */
  uri?: string;
  /** What caches the image across URL changes, such as its Storage key: signed URLs change hourly. */
  cacheKey?: string;
  /** The placeholder's glyph and its colour, such as the meal type's. */
  symbol?: SFSymbol;
  symbolTint?: ColourToken;
  /** The placeholder glyph's size; by default about a third of the height. */
  symbolSize?: number;
  width: DimensionValue;
  /** Height in points, or an aspect ratio for a thumbnail whose width follows its container. */
  height?: number;
  aspectRatio?: number;
  radius?: number;
  /** What VoiceOver reads. Without it the image is decorative and hidden (N10). */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A photo cropped to fill its frame, or a placeholder: a glyph on the sunken tone (specs/redesign
 * design.md §5.2). The placeholder shows while the photo loads, when there's none, and when it fails
 * to load, so a missing or expired photo never leaves a hole. expo-image keeps photos in memory and
 * on disk by `cacheKey`.
 */
export function Thumbnail({
  uri,
  cacheKey,
  symbol = 'fork.knife',
  symbolTint = 'inkMuted',
  symbolSize,
  width,
  height,
  aspectRatio,
  radius = 10,
  accessibilityLabel,
  testID,
}: ThumbnailProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = uri !== undefined && failed !== uri;
  const glyph = symbolSize ?? Math.max(14, Math.round((height ?? 48) * 0.36));

  return (
    <View
      testID={testID}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      importantForAccessibility={accessibilityLabel === undefined ? 'no-hide-descendants' : 'yes'}
      style={[
        styles.frame,
        { width, height, aspectRatio, borderRadius: radius, backgroundColor: theme.sunken },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
        <SymbolView name={symbol} tintColor={theme[symbolTint]} size={glyph} />
      </View>
      {showImage ? (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          source={{ uri, cacheKey }}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={cacheKey ?? uri}
          onError={() => setFailed(uri)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
