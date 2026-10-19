import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { makeJwt } from '@/test/jwt';

import { secureSessionStorage } from './secure-session-storage';

// An in-memory Keychain (4-test-plan §8.4). The accessibility constants stay the real ones, so the
// options assertion can't pass by comparing `undefined` with `undefined`. AsyncStorage is the
// library's in-memory mock from jest-setup.ts.
const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  ...jest.requireActual('expo-secure-store'),
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

// Deterministic "random" bytes: every call returns a different, predictable key.
let mockRandomCalls = 0;
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  getRandomBytes: jest.fn((count: number) => {
    mockRandomCalls += 1;
    return Uint8Array.from({ length: count }, (_, i) => (mockRandomCalls * 37 + i) & 0xff);
  }),
}));

const KEY = 'sb-127-auth-token';
const ACCESS_TOKEN = makeJwt({
  sub: '00000000-0000-0000-0000-00000000000a',
  role: 'authenticated',
});
// supabase-js stores JSON. The emoji is outside the BMP, which aes-js's own UTF-8 decoder mangles.
const SESSION = JSON.stringify({
  access_token: ACCESS_TOKEN,
  refresh_token: 'placeholder-refresh-token',
  user: { id: '00000000-0000-0000-0000-00000000000a', user_metadata: { note: 'Café 🥕' } },
});

const keychainCalls = () => [
  ...jest.mocked(SecureStore.setItemAsync).mock.calls.map((call) => call[2]),
  ...jest.mocked(SecureStore.getItemAsync).mock.calls.map((call) => call[1]),
  ...jest.mocked(SecureStore.deleteItemAsync).mock.calls.map((call) => call[1]),
];

const toHex = (text: string) =>
  Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Asserts that neither the ciphertext nor its Keychain key is left behind. */
async function expectBothHalvesRemoved() {
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
  expect(mockKeychain.has(KEY)).toBe(false);
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockKeychain.clear();
  await AsyncStorage.clear();
});

describe('secureSessionStorage', () => {
  it('U-SES-01 returns the value that was written', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  it('U-SES-02 writes a fresh 256-bit Keychain key on every write', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.setItem(KEY, SESSION);

    expect(Crypto.getRandomBytes).toHaveBeenCalledTimes(2);
    expect(Crypto.getRandomBytes).toHaveBeenNthCalledWith(1, 32);
    expect(Crypto.getRandomBytes).toHaveBeenNthCalledWith(2, 32);
    const [first, second] = jest.mocked(SecureStore.setItemAsync).mock.calls.map((call) => call[1]);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  it('U-SES-03 passes WHEN_UNLOCKED_THIS_DEVICE_ONLY on every Keychain call', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.getItem(KEY);
    await secureSessionStorage.removeItem(KEY);

    const calls = keychainCalls();
    expect(calls).toHaveLength(3);
    expect(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY).toBeDefined();
    for (const options of calls) {
      expect(options).toEqual({ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
  });

  it('U-SES-04 returns null and removes both halves when the Keychain key is missing', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    mockKeychain.delete(KEY);

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    await expectBothHalvesRemoved();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY, expect.anything());
  });

  it.each([
    [
      'the ciphertext is corrupt',
      async () => {
        await secureSessionStorage.setItem(KEY, SESSION);
        const ciphertext = (await AsyncStorage.getItem(KEY))!;
        const flipped = ciphertext.replace(/../g, (hex) =>
          (parseInt(hex, 16) ^ 0xff).toString(16).padStart(2, '0'),
        );
        await AsyncStorage.setItem(KEY, flipped);
      },
    ],
    [
      'the Keychain key is corrupt',
      async () => {
        await secureSessionStorage.setItem(KEY, SESSION);
        mockKeychain.set(KEY, 'not-a-key');
      },
    ],
    [
      'the halves come from different writes',
      async () => {
        await secureSessionStorage.setItem(KEY, SESSION);
        const oldKey = mockKeychain.get(KEY)!;
        await secureSessionStorage.setItem(KEY, SESSION);
        mockKeychain.set(KEY, oldKey);
      },
    ],
    [
      'the plaintext is not JSON',
      async () => {
        await secureSessionStorage.setItem(KEY, 'not json');
      },
    ],
  ])('U-SES-05 returns null and removes both halves when %s', async (_case, arrange) => {
    await arrange();

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    await expectBothHalvesRemoved();
  });

  it('U-SES-06 removeItem deletes both halves', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    await secureSessionStorage.removeItem(KEY);

    await expectBothHalvesRemoved();
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('U-SES-07 stores none of the plaintext token in either half', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    const ciphertext = (await AsyncStorage.getItem(KEY))!;
    expect(ciphertext).toMatch(/^[0-9a-f]+$/);
    for (const stored of [ciphertext, mockKeychain.get(KEY)!]) {
      expect(stored).not.toContain(ACCESS_TOKEN);
      expect(stored).not.toContain(toHex(ACCESS_TOKEN));
    }
  });

  it('returns null when nothing is stored', async () => {
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("keeps both halves when the Keychain can't be read, such as while the phone is locked", async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    const locked = new Error('User interaction is not allowed.');
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(locked);

    await expect(secureSessionStorage.getItem(KEY)).rejects.toBe(locked);

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });
});
