import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { useStoredFlag } from './use-stored-flag';

// A per-device yes or no, such as hiding checked groceries (specs/redesign/design.md §4.1). The
// AsyncStorage mock from jest-setup.ts keeps values in memory, so each test starts empty.

const KEY = 'groceries.hideChecked';
const STORED_KEY = 'kitchin.pref.groceries.hideChecked';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Renders the hook and lets its read from storage settle. */
async function renderFlag(key = KEY, initial = false) {
  const hook = await renderHook(({ k, i }: { k: string; i: boolean }) => useStoredFlag(k, i), {
    initialProps: { k: key, i: initial },
  });
  await act(async () => {});
  return hook;
}

describe('useStoredFlag', () => {
  it('starts at the default when nothing is stored', async () => {
    const { result } = await renderFlag(KEY, true);

    expect(result.current[0]).toBe(true);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORED_KEY);
  });

  it.each([
    ['true', false, true],
    ['false', true, false],
  ])('loads a stored %s over the default', async (stored, initial, expected) => {
    await AsyncStorage.setItem(STORED_KEY, stored);

    const { result } = await renderFlag(KEY, initial);

    expect(result.current[0]).toBe(expected);
  });

  it('shows the default until the stored value has loaded', async () => {
    let finish!: (value: string | null) => void;
    jest
      .mocked(AsyncStorage.getItem)
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const hook = await renderHook(() => useStoredFlag(KEY, false));

    expect(hook.result.current[0]).toBe(false);
    await act(async () => finish('true'));
    expect(hook.result.current[0]).toBe(true);
  });

  it('sets the value at once and stores it under its prefixed key', async () => {
    const { result } = await renderFlag();

    await act(async () => result.current[1](true));

    expect(result.current[0]).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(STORED_KEY, 'true');
    expect(await AsyncStorage.getItem(STORED_KEY)).toBe('true');

    await act(async () => result.current[1](false));

    expect(result.current[0]).toBe(false);
    expect(await AsyncStorage.getItem(STORED_KEY)).toBe('false');
  });

  it('remembers the value across a restart', async () => {
    const first = await renderFlag();
    await act(async () => first.result.current[1](true));
    await first.unmount();

    const { result } = await renderFlag();

    expect(result.current[0]).toBe(true);
  });

  it('keeps each key separate', async () => {
    await AsyncStorage.setItem('kitchin.pref.other', 'true');

    const { result } = await renderFlag(KEY, false);

    expect(result.current[0]).toBe(false);
  });

  it('reads the new key when the key changes', async () => {
    await AsyncStorage.setItem('kitchin.pref.other', 'true');
    const hook = await renderFlag(KEY, false);

    await hook.rerender({ k: 'other', i: false });
    await act(async () => {});

    expect(hook.result.current[0]).toBe(true);
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith('kitchin.pref.other');
  });

  it('keeps the default when storage can’t be read', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('disk'));

    const { result } = await renderFlag(KEY, true);

    expect(result.current[0]).toBe(true);
  });

  it('keeps the new value on screen when storage can’t be written', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
    const { result } = await renderFlag();

    await act(async () => result.current[1](true));

    expect(result.current[0]).toBe(true);
  });

  it('ignores a read that finishes after unmounting', async () => {
    let finish!: (value: string | null) => void;
    jest
      .mocked(AsyncStorage.getItem)
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const hook = await renderHook(() => useStoredFlag(KEY, false));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await hook.unmount();
    await act(async () => finish('true'));

    expect(hook.result.current[0]).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps the setter stable between renders for the same key', async () => {
    const hook = await renderFlag();
    const set = hook.result.current[1];

    await hook.rerender({ k: KEY, i: false });

    expect(hook.result.current[1]).toBe(set);
  });
});
