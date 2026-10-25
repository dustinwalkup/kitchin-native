import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Divider, Group, SectionHeader } from './group';
import { themes } from './theme';

const { light } = themes;

// Inset grouped lists (specs/redesign/design.md DD-R2): rows on one white surface, hairlines
// between them, a small-caps heading above and helper text below.

/** The white surface the rows sit on: the parent of the first row. */
const surface = () => screen.getByTestId('row-a').parent!;

/** The surface's children that are dividers, in order. */
const dividers = () =>
  surface().children.filter(
    (child) => typeof child !== 'string' && child.props.accessibilityElementsHidden === true,
  );

describe('Group', () => {
  it('puts its rows on a white surface with the card radius', async () => {
    await render(
      <Group>
        <View testID="row-a" />
      </Group>,
    );

    expect(surface()).toHaveStyle({
      backgroundColor: light.background,
      borderRadius: light.radius.card,
    });
  });

  it('draws a hairline between rows, never before the first or after the last', async () => {
    await render(
      <Group>
        <View testID="row-a" />
        <View testID="row-b" />
        <View testID="row-c" />
      </Group>,
    );

    const children = surface().children.map((child) =>
      typeof child === 'string' ? child : (child.props.testID ?? 'divider'),
    );
    expect(children).toEqual(['row-a', 'divider', 'row-b', 'divider', 'row-c']);
    for (const divider of dividers()) {
      expect(divider).toHaveStyle({
        height: StyleSheet.hairlineWidth,
        backgroundColor: light.border,
        marginLeft: 16,
      });
    }
  });

  it('skips rows that render nothing, such as a condition that is false', async () => {
    const offline = false;
    await render(
      <Group>
        <View testID="row-a" />
        {offline && <View testID="row-hidden" />}
        {null}
        <View testID="row-b" />
      </Group>,
    );

    expect(dividers()).toHaveLength(1);
    expect(screen.queryByTestId('row-hidden')).not.toBeOnTheScreen();
  });

  it('starts the dividers at its inset', async () => {
    await render(
      <Group inset={56}>
        <View testID="row-a" />
        <View testID="row-b" />
      </Group>,
    );

    expect(dividers()[0]).toHaveStyle({ marginLeft: 56 });
  });

  it('shows its title as a header above the rows, and its footer below them', async () => {
    await render(
      <Group title="Household" footer="Meals shows weeks from this day.">
        <View testID="row-a" />
      </Group>,
    );

    expect(screen.getByRole('header', { name: 'Household' })).toBeOnTheScreen();
    expect(screen.getByText('Meals shows weeks from this day.')).toHaveStyle({
      color: light.inkMuted,
      fontSize: 13,
    });
  });

  it('has no heading or footer without them', async () => {
    await render(
      <Group>
        <View testID="row-a" />
      </Group>,
    );

    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
    expect(screen.root!.children).toHaveLength(1);
  });

  it('takes a style for its section', async () => {
    await render(
      <Group style={{ marginTop: 12 }}>
        <View testID="row-a" />
      </Group>,
    );

    expect(screen.root).toHaveStyle({ marginTop: 12 });
  });
});

describe('Divider', () => {
  it('is a hairline from the edge by default, hidden from VoiceOver', async () => {
    await render(<Divider />);

    expect(screen.root).toHaveStyle({
      height: StyleSheet.hairlineWidth,
      marginLeft: 0,
      backgroundColor: light.border,
    });
    expect(screen.root).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });
});

describe('SectionHeader', () => {
  it('is a small-caps muted header that VoiceOver reads as a heading (N10)', async () => {
    await render(<SectionHeader title="Account" />);

    expect(screen.getByRole('header', { name: 'Account' })).toHaveStyle({
      color: light.inkMuted,
      textTransform: 'uppercase',
    });
  });

  it('places an action beside the title', async () => {
    await render(<SectionHeader title="Recently used" action={<Text>See all</Text>} />);

    expect(screen.getByRole('header', { name: 'Recently used' })).toBeOnTheScreen();
    expect(screen.getByText('See all')).toBeOnTheScreen();
  });
});
