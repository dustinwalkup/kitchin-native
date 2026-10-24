import { COPY } from '../constants';
import { HeaderAction } from './header-action';

/**
 * "Library" in the Meals header, which opens the Meal Library (R40.1, §3.11). VoiceOver reads
 * "Meal Library". It takes nothing from the week, so no meal text reaches the library.
 */
export function LibraryButton({ onPress }: { onPress: () => void }) {
  return (
    <HeaderAction
      testID="library-button"
      label={COPY.libraryButton}
      accessibilityLabel={COPY.title}
      onPress={onPress}
    />
  );
}
