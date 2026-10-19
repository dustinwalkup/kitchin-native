import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <Pressable accessibilityRole="button" onPress={() => setCount((value) => value + 1)}>
      <Text>Pressed {count} times</Text>
    </Pressable>
  );
}

describe('test setup', () => {
  it('renders a component and fires a press with the async API', async () => {
    await render(<Counter />);

    await fireEvent.press(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Pressed 1 times');
  });

  it('renders the app routes with renderRouter', async () => {
    const router = await renderRouter('./src/app');

    expect(router.getPathname()).toBe('/');
  });
});
