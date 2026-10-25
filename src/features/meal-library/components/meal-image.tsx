import { MEAL_TYPES, type MealType } from '@/features/meals/constants';
import { Thumbnail, type ThumbnailProps } from '@/ui/thumbnail';

export interface MealImageProps extends Pick<
  ThumbnailProps,
  'width' | 'height' | 'aspectRatio' | 'radius' | 'symbolSize'
> {
  /** The photo's Storage key, or none. */
  path: string | null;
  /** Its signed URL, once there is one. */
  uri?: string;
  /** The placeholder shows the type's glyph, or a fork and knife for a meal with none. */
  mealType: MealType | null;
  /** The meal's name, for VoiceOver, where the image isn't inside a row that already names it. */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A meal's photo, cropped to its frame, or the placeholder: the meal type's glyph in its colour on
 * the sunken tone (specs/redesign/design.md §5.2). The Storage key caches the photo, since its
 * signed URL changes every hour.
 */
export function MealImage({ path, uri, mealType, accessibilityLabel, ...frame }: MealImageProps) {
  const type = mealType ? MEAL_TYPES.find((t) => t.key === mealType) : undefined;

  return (
    <Thumbnail
      {...frame}
      uri={path === null ? undefined : uri}
      cacheKey={path ?? undefined}
      symbol={type?.symbol ?? 'fork.knife'}
      symbolTint={type?.glyph ?? 'inkMuted'}
      accessibilityLabel={path && accessibilityLabel ? `Photo of ${accessibilityLabel}` : undefined}
    />
  );
}
