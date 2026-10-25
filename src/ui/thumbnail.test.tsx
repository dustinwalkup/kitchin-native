import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Thumbnail } from './thumbnail';
import { themes } from './theme';

const { light } = themes;

// A photo, or a glyph on the sunken tone while it loads, when there's none and when it fails
// (specs/redesign/design.md §5.2). expo-image renders as a host view under Jest, so its props are
// readable and its onError can be fired.

const URI = 'https://storage.example.test/meal-images/h1/photo.jpg?token=abc';
const ALL = { includeHiddenElements: true } as const;

const frame = () => screen.getByTestId('thumb', ALL);
const image = () => screen.queryByTestId('thumb-image', ALL);
/** The placeholder's glyph, which stays underneath the photo. */
const placeholder = () => {
  const [layer] = frame().children;
  if (typeof layer === 'string') throw new Error('Expected the placeholder layer');
  return layer.children[0];
};

describe('Thumbnail', () => {
  it('shows the placeholder alone when there is no photo', async () => {
    await render(<Thumbnail testID="thumb" width={56} height={56} />);

    expect(image()).not.toBeOnTheScreen();
    expect(placeholder()).toHaveProp('name', 'fork.knife');
    expect(placeholder()).toHaveProp('tintColor', light.inkMuted);
    expect(frame()).toHaveStyle({
      width: 56,
      height: 56,
      borderRadius: 10,
      backgroundColor: light.sunken,
      overflow: 'hidden',
    });
  });

  it('draws the photo over the placeholder, cropped to fill, cached by its key', async () => {
    await render(
      <Thumbnail testID="thumb" uri={URI} cacheKey="h1/photo.jpg" width={56} height={56} />,
    );

    expect(image()).toHaveProp('source', [{ uri: URI, cacheKey: 'h1/photo.jpg' }]);
    expect(image()).toHaveProp('contentFit', 'cover');
    expect(image()).toHaveProp('cachePolicy', 'memory-disk');
    expect(image()).toHaveProp('recyclingKey', 'h1/photo.jpg');
    // The placeholder shows while the photo loads.
    expect(placeholder()).toHaveProp('name', 'fork.knife');
  });

  it('recycles by the URL when there is no cache key', async () => {
    await render(<Thumbnail testID="thumb" uri={URI} width={56} height={56} />);

    expect(image()).toHaveProp('recyclingKey', URI);
  });

  it('falls back to the placeholder when the photo fails to load', async () => {
    await render(<Thumbnail testID="thumb" uri={URI} width={56} height={56} />);

    await act(() => fireEvent(image()!, 'error', { nativeEvent: { error: 'expired' } }));

    expect(image()).not.toBeOnTheScreen();
    expect(placeholder()).toHaveProp('name', 'fork.knife');
  });

  it('tries again when a failed photo’s URL changes, as when it is signed again', async () => {
    await render(<Thumbnail testID="thumb" uri={URI} width={56} height={56} />);
    await act(() => fireEvent(image()!, 'error', { nativeEvent: { error: 'expired' } }));

    const resigned = `${URI}2`;
    await screen.rerender(<Thumbnail testID="thumb" uri={resigned} width={56} height={56} />);

    expect(image()).toHaveProp('source', [{ uri: resigned, cacheKey: undefined }]);
  });

  it('takes the placeholder’s glyph, colour and size', async () => {
    await render(
      <Thumbnail
        testID="thumb"
        symbol="moon.stars.fill"
        symbolTint="dinner"
        symbolSize={32}
        width={56}
        height={56}
      />,
    );

    expect(placeholder()).toHaveProp('name', 'moon.stars.fill');
    expect(placeholder()).toHaveProp('tintColor', light.dinner);
    expect(placeholder()).toHaveProp('size', 32);
  });

  it('sizes the glyph to about a third of the height, and no smaller than 14 pt', async () => {
    await render(<Thumbnail testID="thumb" width={56} height={56} />);
    expect(placeholder()).toHaveProp('size', 20);

    await screen.rerender(<Thumbnail testID="thumb" width={20} height={20} />);
    expect(placeholder()).toHaveProp('size', 14);
  });

  it('sizes a glyph without a height as if 48 pt tall', async () => {
    await render(<Thumbnail testID="thumb" width="100%" aspectRatio={16 / 9} radius={0} />);

    expect(placeholder()).toHaveProp('size', 17);
    expect(frame()).toHaveStyle({ width: '100%', aspectRatio: 16 / 9, borderRadius: 0 });
  });

  it('N10 is decorative and hidden from VoiceOver without a label', async () => {
    await render(<Thumbnail testID="thumb" uri={URI} width={56} height={56} />);

    expect(screen.queryByTestId('thumb')).not.toBeOnTheScreen();
    expect(frame()).toHaveProp('accessible', false);
    expect(frame()).toHaveProp('accessibilityElementsHidden', true);
    expect(frame()).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });

  it('N10 is an image VoiceOver reads when it has a label', async () => {
    await render(
      <Thumbnail testID="thumb" uri={URI} width={56} height={56} accessibilityLabel="Photo" />,
    );

    expect(screen.getByRole('image', { name: 'Photo' })).toBe(screen.getByTestId('thumb'));
    expect(frame()).toHaveProp('importantForAccessibility', 'yes');
  });

  it('gives the photo no test ID without one', async () => {
    await render(<Thumbnail uri={URI} width={56} height={56} accessibilityLabel="Photo" />);

    expect(screen.queryByTestId(/-image$/, ALL)).not.toBeOnTheScreen();
  });
});
