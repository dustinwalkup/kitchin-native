import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { ListRow } from './list-row';
import { themes } from './theme';

const { light } = themes;

// One row of a Group (specs/redesign/design.md §3): a label, then a muted value, an accessory or a
// chevron. VoiceOver reads a row as one element (N10).

/** The SF Symbol names a row draws, such as its chevron. */
const symbols = (testID: string) =>
  screen
    .getByTestId(testID)
    .children.flatMap((child) =>
      typeof child === 'string' || child.props.name === undefined ? [] : [child.props.name],
    );

describe('ListRow', () => {
  it('reads a static row as one element, with its label and value together', async () => {
    await render(<ListRow testID="row" label="Version" value="1.2.0 (7)" />);

    const row = screen.getByTestId('row');
    expect(row).toHaveProp('accessible', true);
    expect(row).toHaveProp('accessibilityLabel', 'Version, 1.2.0 (7)');
    expect(row).not.toHaveProp('accessibilityRole', 'button');
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(symbols('row')).toEqual([]);
  });

  it('shows the label in ink and the value muted at the end', async () => {
    await render(<ListRow label="Environment" value="Development" />);

    expect(screen.getByText('Environment')).toHaveStyle({ color: light.ink, fontWeight: '400' });
    expect(screen.getByText('Development')).toHaveStyle({
      color: light.inkMuted,
      textAlign: 'right',
    });
  });

  it('reads just the label when there is no value', async () => {
    await render(<ListRow testID="row" label="Theme preview" onPress={() => {}} />);

    expect(screen.getByTestId('row')).toHaveProp('accessibilityLabel', 'Theme preview');
  });

  it('makes a pressable row a button with a chevron that calls onPress', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        testID="row"
        label="Week starts on"
        value="Monday"
        accessibilityHint="Changes the first day of the week"
        onPress={onPress}
      />,
    );

    const row = screen.getByRole('button', { name: 'Week starts on, Monday' });
    expect(row).toHaveProp('accessibilityHint', 'Changes the first day of the week');
    expect(symbols('row')).toEqual(['chevron.right']);
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('N11 gives a pressable row a touch target at least 44 pt tall', async () => {
    await render(<ListRow label="Sign out" onPress={() => {}} />);

    const { height } = touchTarget(screen.getByRole('button', { name: 'Sign out' }));
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('can leave the chevron off a button row', async () => {
    await render(
      <ListRow testID="row" label="Send test error" chevron={false} onPress={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Send test error' })).toBeOnTheScreen();
    expect(symbols('row')).toEqual([]);
  });

  it('can show a chevron on a static row', async () => {
    await render(<ListRow testID="row" label="More" chevron />);

    expect(symbols('row')).toEqual(['chevron.right']);
  });

  it('draws the chevron muted', async () => {
    await render(<ListRow testID="row" label="Theme preview" onPress={() => {}} />);

    const [, chevron] = screen.getByTestId('row').children;
    expect(chevron).toHaveProp('tintColor', light.inkMuted);
  });

  it('shows an accessory at the end, such as a checkmark', async () => {
    await render(
      <ListRow
        testID="row"
        label="Sunday"
        chevron={false}
        accessory={<Text testID="check">✓</Text>}
        onPress={() => {}}
      />,
    );

    expect(screen.getByTestId('row').children.at(-1)).toBe(screen.getByTestId('check'));
  });

  it('passes a selected state through to VoiceOver, and stays enabled', async () => {
    await render(
      <ListRow label="Sunday" accessibilityState={{ selected: true }} onPress={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Sunday' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Sunday' })).toBeEnabled();
  });

  it('ignores presses while disabled, says so and dims', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow label="Sign out" disabled accessibilityState={{ busy: true }} onPress={onPress} />,
    );

    const row = screen.getByRole('button', { name: 'Sign out' });
    await fireEvent.press(row);

    expect(row).toBeDisabled();
    expect(row).toBeBusy();
    expect(row).toHaveStyle({ opacity: 0.5 });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws a tinted label in medium accentInk, for an action such as Sign out', async () => {
    await render(<ListRow label="Sign out" tint onPress={() => {}} />);

    expect(screen.getByText('Sign out')).toHaveStyle({
      color: light.accentInk,
      fontWeight: '500',
    });
  });

  it('draws a destructive label in medium red', async () => {
    await render(<ListRow label="Delete household" destructive tint onPress={() => {}} />);

    expect(screen.getByText('Delete household')).toHaveStyle({
      color: light.destructive,
      fontWeight: '500',
    });
  });

  it('lets the label fill the row without a value, so the accessory sits at the end', async () => {
    await render(
      <>
        <ListRow label="Sunday" />
        <ListRow label="Version" value="1.0.0" />
      </>,
    );

    expect(screen.getByText('Sunday')).toHaveStyle({ flexGrow: 1 });
    expect(screen.getByText('Version')).not.toHaveStyle({ flexGrow: 1 });
  });

  it('centres the label of an action row with nothing else in it, such as Sign out', async () => {
    await render(<ListRow label="Sign out" tint centered chevron={false} onPress={() => {}} />);

    const row = screen.getByRole('button', { name: 'Sign out' });
    expect(row).toHaveStyle({ justifyContent: 'center' });
    // The label keeps its own width, so it sits in the middle rather than filling the row.
    expect(screen.getByText('Sign out')).not.toHaveStyle({ flexGrow: 1 });
  });

  it('centres a static row too', async () => {
    await render(<ListRow testID="row" label="No household access" centered />);

    expect(screen.getByTestId('row')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByText('No household access')).not.toHaveStyle({ flexGrow: 1 });
  });

  it('starts the label at the leading edge unless centred', async () => {
    await render(
      <>
        <ListRow testID="pressable" label="Theme preview" onPress={() => {}} />
        <ListRow testID="static" label="Version" value="1.0.0" />
      </>,
    );

    expect(screen.getByTestId('pressable')).not.toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByTestId('static')).not.toHaveStyle({ justifyContent: 'center' });
  });
});
