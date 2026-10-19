import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { FormScrollView } from './form-scroll-view';
import { KEYBOARD_TOOLBAR_SPACE } from './keyboard-toolbar';

// Under Jest the library's mock renders KeyboardAwareScrollView as a ScrollView, so the props this
// wrapper sets are readable on it.
describe('FormScrollView', () => {
  it('keeps the focused field clear of the keyboard toolbar, not just the keyboard', async () => {
    await render(
      <FormScrollView testID="scroll">
        <Text>Field</Text>
      </FormScrollView>,
    );

    const scroll = screen.getByTestId('scroll');
    expect(scroll.props.bottomOffset).toBeGreaterThan(KEYBOARD_TOOLBAR_SPACE);
    expect(scroll.props.extraKeyboardSpace).toBe(KEYBOARD_TOOLBAR_SPACE);
    expect(screen.getByText('Field')).toBeOnTheScreen();
  });

  it('lets a screen override a default', async () => {
    await render(<FormScrollView testID="scroll" bottomOffset={100} />);

    expect(screen.getByTestId('scroll').props.bottomOffset).toBe(100);
  });
});
