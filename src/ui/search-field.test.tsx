import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { SearchField } from './search-field';
import { themes } from './theme';

const { light } = themes;

const LABEL = 'Search meals';

describe('SearchField', () => {
  it('N10 names the field by its placeholder, and passes typing through', async () => {
    const onChangeText = jest.fn();
    await render(
      <SearchField testID="library-search" label={LABEL} value="" onChangeText={onChangeText} />,
    );

    const field = screen.getByLabelText(LABEL);
    expect(field).toBe(screen.getByTestId('library-search'));
    expect(field).toBe(screen.getByPlaceholderText(LABEL));
    await fireEvent.changeText(field, 'taco');

    expect(onChangeText).toHaveBeenCalledWith('taco');
  });

  it('shows the value it is given', async () => {
    await render(<SearchField label={LABEL} value="chili" onChangeText={() => {}} />);

    expect(screen.getByDisplayValue('chili')).toBeOnTheScreen();
  });

  it('R41.1 keeps what was typed as typed: no capitals or corrections', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    const field = screen.getByLabelText(LABEL);
    expect(field).toHaveProp('autoCapitalize', 'none');
    expect(field).toHaveProp('autoCorrect', false);
  });

  it('closes the keyboard on Return and offers the native clear button', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    const field = screen.getByLabelText(LABEL);
    expect(field).toHaveProp('returnKeyType', 'done');
    expect(field).toHaveProp('clearButtonMode', 'while-editing');
  });

  it('N12 scales with Dynamic Type up to 2×', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    expect(screen.getByLabelText(LABEL)).toHaveProp('allowFontScaling', true);
    expect(screen.getByLabelText(LABEL)).toHaveProp('maxFontSizeMultiplier', 2);
  });

  it('draws ink text and a muted placeholder on the sunken track', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    const field = screen.getByLabelText(LABEL);
    expect(field).toHaveStyle({ color: light.ink });
    expect(field).toHaveProp('placeholderTextColor', light.inkMuted);
    expect(field.parent).toHaveStyle({
      backgroundColor: light.sunken,
      borderRadius: light.radius.base,
    });
  });

  it('N11 is a 44 pt tall touch target, on a track as tall', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    const field = screen.getByLabelText(LABEL);
    expect(touchTarget(field).height).toBeGreaterThanOrEqual(44);
    expect(field.parent).toHaveStyle({ minHeight: 44 });
  });

  it('shows a muted magnifying glass, hidden from VoiceOver', async () => {
    await render(<SearchField label={LABEL} value="" onChangeText={() => {}} />);

    const [icon] = screen.getByLabelText(LABEL).parent!.children;
    if (typeof icon === 'string') throw new Error('Expected the icon first');
    expect(icon).toHaveProp('accessibilityElementsHidden', true);
    expect(icon.children[0]).toHaveProp('name', 'magnifyingglass');
    expect(icon.children[0]).toHaveProp('tintColor', light.inkMuted);
  });
});
