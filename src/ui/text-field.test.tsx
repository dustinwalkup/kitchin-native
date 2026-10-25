import { fireEvent, render, screen } from '@testing-library/react-native';

import { Text } from './text';
import { TextField } from './text-field';
import { themes } from './theme';

const { light } = themes;

describe('TextField', () => {
  it('labels the input for VoiceOver and passes typing through', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Email" value="" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');

    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
  });

  it('keeps font scaling on and caps it at 2×', async () => {
    await render(<TextField label="Email" />);

    expect(screen.getByLabelText('Email')).toHaveProp('allowFontScaling', true);
    expect(screen.getByLabelText('Email')).toHaveProp('maxFontSizeMultiplier', 2);
  });

  it('shows the label above the field in semibold, hidden from VoiceOver, which reads the input', async () => {
    await render(<TextField label="Name" />);

    expect(screen.queryByText('Name')).not.toBeOnTheScreen();
    expect(screen.getByText('Name', { includeHiddenElements: true })).toHaveStyle({
      fontWeight: '600',
      color: light.ink,
    });
  });

  it('DD-R4 edges the input with the soft border on white, since the label identifies it', async () => {
    await render(<TextField label="Email" />);

    expect(screen.getByLabelText('Email')).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.border,
      borderRadius: light.radius.base,
      color: light.ink,
    });
    expect(screen.getByLabelText('Email')).toHaveProp('placeholderTextColor', light.inkMuted);
  });

  it('shows an error in semibold destructive text and outlines the input with it', async () => {
    await render(<TextField label="Password" error="Email or password is incorrect" />);

    expect(screen.getByText('Email or password is incorrect')).toHaveStyle({
      color: light.destructive,
      fontWeight: '600',
    });
    expect(screen.getByLabelText('Password')).toHaveStyle({ borderColor: light.destructive });
  });

  it('adds a muted note after the label, and to the name VoiceOver reads', async () => {
    await render(<TextField label="Description" labelNote="Optional" />);

    expect(screen.getByLabelText('Description (optional)')).toBeOnTheScreen();
    expect(screen.getByText('Optional', { exact: false, includeHiddenElements: true })).toHaveStyle(
      { color: light.inkMuted },
    );
  });

  it('shows a hint below the field', async () => {
    await render(
      <TextField label="Dinner" hint={<Text testID="counter">12 characters left</Text>} />,
    );

    expect(screen.getByTestId('counter')).toHaveTextContent('12 characters left');
  });

  it('replaces the hint with the error', async () => {
    await render(
      <TextField
        label="Name"
        error="Give the meal a name"
        hint={<Text testID="counter">12 characters left</Text>}
      />,
    );

    expect(screen.getByText('Give the meal a name')).toBeOnTheScreen();
    expect(screen.queryByTestId('counter')).not.toBeOnTheScreen();
  });

  it('gives a multi-line field room for a few lines, with text from the top', async () => {
    await render(
      <>
        <TextField label="Ingredients" multiline />
        <TextField label="Name" />
      </>,
    );

    expect(screen.getByLabelText('Ingredients')).toHaveProp('multiline', true);
    expect(screen.getByLabelText('Ingredients')).toHaveStyle({
      minHeight: 88,
      textAlignVertical: 'top',
    });
    expect(screen.getByLabelText('Name')).toHaveStyle({ minHeight: 46 });
  });
});
