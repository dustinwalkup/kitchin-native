import { fireEvent, render, screen } from '@testing-library/react-native';

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

  it('outlines the input with controlBorder', async () => {
    await render(<TextField label="Email" />);

    expect(screen.getByLabelText('Email')).toHaveStyle({ borderColor: light.controlBorder });
  });

  it('shows an error in bold destructive text and outlines the input with it', async () => {
    await render(<TextField label="Password" error="Email or password is incorrect" />);

    expect(screen.getByText('Email or password is incorrect')).toHaveStyle({
      color: light.destructive,
      fontWeight: '700',
    });
    expect(screen.getByLabelText('Password')).toHaveStyle({ borderColor: light.destructive });
  });
});
