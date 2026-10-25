import { fireEvent, render, screen } from '@testing-library/react-native';

import { themes } from '@/ui/theme';

import { MealImage, type MealImageProps } from './meal-image';

// A meal's photo or its placeholder (specs/redesign/design.md §5.2).

const theme = themes.light;
const PATH = 'household-1/photo.jpg';
const SIGNED_URL = 'https://storage.test/photo.jpg?token=1';

const ui = (props: Partial<MealImageProps> = {}) => (
  <MealImage
    testID="meal-image"
    path={PATH}
    uri={SIGNED_URL}
    mealType="dinner"
    width={56}
    height={56}
    {...props}
  />
);

const frame = () => screen.getByTestId('meal-image', { includeHiddenElements: true });
const image = () => screen.queryByTestId('meal-image-image', { includeHiddenElements: true });
// The placeholder's glyph, which shows under the photo while it loads.
const glyphs = (symbol: string) => screen.root!.queryAll((node) => node.props.name === symbol);

describe('MealImage', () => {
  it('shows the photo, cached by its Storage key rather than its hourly URL', async () => {
    await render(ui());

    expect(image()).toHaveProp('source', [{ uri: SIGNED_URL, cacheKey: PATH }]);
    expect(image()).toHaveProp('recyclingKey', PATH);
  });

  it('shows the placeholder, with no photo, until the URL is signed', async () => {
    await render(ui({ uri: undefined }));

    expect(image()).toBeNull();
    expect(glyphs('moon.stars.fill')).toHaveLength(1);
  });

  it('shows no photo for a meal without one, even with a stale URL', async () => {
    await render(ui({ path: null }));

    expect(image()).toBeNull();
  });

  it.each([
    ['breakfast', 'sunrise.fill', theme.breakfast],
    ['lunch', 'sun.max.fill', theme.lunch],
    ['dinner', 'moon.stars.fill', theme.dinner],
  ] as const)(
    "draws the placeholder as the %s glyph in the type's colour",
    async (mealType, symbol, colour) => {
      await render(ui({ path: null, mealType }));

      const placeholder = glyphs(symbol);
      expect(placeholder).toHaveLength(1);
      expect(placeholder[0]).toHaveProp('tintColor', colour);
    },
  );

  it('draws a fork and knife, muted, for a meal with no type', async () => {
    await render(ui({ path: null, mealType: null }));

    const placeholder = glyphs('fork.knife');
    expect(placeholder).toHaveLength(1);
    expect(placeholder[0]).toHaveProp('tintColor', theme.inkMuted);
  });

  it('falls back to the placeholder when the photo fails to load', async () => {
    await render(ui());

    await fireEvent(image()!, 'error', { nativeEvent: { error: 'Failed to load' } });

    expect(image()).toBeNull();
  });

  it('N10 is decorative, hidden from VoiceOver, without a label', async () => {
    await render(ui({ accessibilityLabel: undefined }));

    expect(frame()).toHaveProp('accessibilityElementsHidden', true);
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('N10 reads "Photo of Tacos" where nothing else names the meal', async () => {
    await render(ui({ accessibilityLabel: 'Tacos' }));

    expect(screen.getByRole('image', { name: 'Photo of Tacos' })).toBeOnTheScreen();
  });

  it("N10 stays hidden when there's no photo to describe", async () => {
    await render(ui({ path: null, accessibilityLabel: 'Tacos' }));

    expect(screen.queryByRole('image')).toBeNull();
  });
});
