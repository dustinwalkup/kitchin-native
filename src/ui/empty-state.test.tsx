import { render, screen } from '@testing-library/react-native';

import { Button } from './button';
import { EmptyState } from './empty-state';
import { themes } from './theme';

const { light } = themes;

// Every loading-failed, offline and empty state draws through EmptyState (specs/redesign/design.md
// §3): a soft badge, a title VoiceOver reads as a header, a muted description and the way on.

describe('EmptyState', () => {
  it('reads its title as a header and its description as muted text', async () => {
    await render(
      <EmptyState
        testID="groceries-empty"
        title="Your grocery list is empty"
        description="Add an item to get started."
      />,
    );

    expect(screen.getByTestId('groceries-empty')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your grocery list is empty' })).toHaveStyle({
      fontWeight: '600',
      textAlign: 'center',
    });
    expect(screen.getByText('Add an item to get started.')).toHaveStyle({
      color: light.inkMuted,
      textAlign: 'center',
    });
  });

  it('shows an emoji in a blush circle, hidden from VoiceOver', async () => {
    await render(<EmptyState testID="empty" emoji="🧺" title="Nothing yet" />);

    expect(screen.queryByText('🧺')).not.toBeOnTheScreen();
    const emoji = screen.getByText('🧺', { includeHiddenElements: true });
    expect(emoji.parent).toHaveStyle({ backgroundColor: light.accentSoft, borderRadius: 32 });
    expect(emoji.parent).toHaveProp('accessibilityElementsHidden', true);
  });

  it('shows an SF Symbol in terracotta in place of an emoji', async () => {
    await render(
      <EmptyState testID="load-error" symbol="exclamationmark.triangle" title="Couldn't load" />,
    );

    const [badge] = screen.getByTestId('load-error').children;
    if (typeof badge === 'string') throw new Error('Expected the badge view first');
    const [glyph] = badge.children;
    expect(badge).toHaveStyle({ backgroundColor: light.accentSoft });
    expect(glyph).toHaveProp('name', 'exclamationmark.triangle');
    expect(glyph).toHaveProp('tintColor', light.accent);
  });

  it('draws no badge with neither an emoji nor a symbol', async () => {
    await render(<EmptyState testID="empty" title="Waiting for connection…" />);

    const [first] = screen.getByTestId('empty').children;
    expect(first).toBe(screen.getByRole('header', { name: 'Waiting for connection…' }));
  });

  it('shows its action, such as a button', async () => {
    const onRetry = jest.fn();
    await render(
      <EmptyState testID="load-error" title="Couldn't load groceries">
        <Button label="Retry" onPress={onRetry} />
      </EmptyState>,
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });

  it('has no description or action without them', async () => {
    await render(<EmptyState testID="empty" title="Everything's checked off" />);

    expect(screen.getByTestId('empty').children).toHaveLength(1);
  });

  it('fills the space below by default, and sits after what is above it when `fill` is off', async () => {
    await render(
      <>
        <EmptyState testID="filled" title="A" />
        <EmptyState testID="placed" title="B" fill={false} />
      </>,
    );

    expect(screen.getByTestId('filled')).toHaveStyle({ flex: 1, justifyContent: 'center' });
    expect(screen.getByTestId('placed')).not.toHaveStyle({ flex: 1 });
  });
});
