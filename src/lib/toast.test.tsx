import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { TOAST_MS, TOAST_WITH_ACTION_MS, ToastProvider, useToast } from './toast';

/** Renders a ToastProvider and returns its API, which stays the same across renders. */
async function renderProvider() {
  const { result } = await renderHook(() => useToast(), { wrapper: ToastProvider });
  return result.current;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Toast', () => {
  it('C-UI-07 shows the message and announces it to VoiceOver', async () => {
    const toast = await renderProvider();

    await act(() => toast.show({ message: "Couldn't save Milk" }));

    expect(screen.getByText("Couldn't save Milk")).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Couldn't save Milk");
  });

  it('C-UI-07 calls the action handler and dismisses when the action is pressed', async () => {
    const retry = jest.fn();
    const toast = await renderProvider();
    await act(() =>
      toast.show({ message: "Couldn't save Milk", action: { label: 'Retry', onPress: retry } }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Couldn't save Milk")).not.toBeOnTheScreen();
  });

  it('dismisses itself after TOAST_MS', async () => {
    const toast = await renderProvider();
    await act(() => toast.show({ message: 'Saved' }));

    await act(() => jest.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).not.toBeOnTheScreen();
  });

  it('keeps a toast with an action up for TOAST_WITH_ACTION_MS', async () => {
    const toast = await renderProvider();
    await act(() =>
      toast.show({ message: 'Failed', action: { label: 'Retry', onPress: () => {} } }),
    );

    await act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(screen.getByText('Failed')).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTime(TOAST_WITH_ACTION_MS - TOAST_MS));
    expect(screen.queryByText('Failed')).not.toBeOnTheScreen();
  });

  it('replaces the current toast with a newer one', async () => {
    const toast = await renderProvider();
    await act(() => toast.show({ message: 'First' }));

    await act(() => toast.show({ message: 'Second' }));

    expect(screen.queryByText('First')).not.toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('throws when used outside ToastProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(renderHook(() => useToast())).rejects.toThrow('ToastProvider');
  });
});
