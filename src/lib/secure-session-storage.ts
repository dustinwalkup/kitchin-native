// Supabase session storage, encrypted at rest (R3.1, R3.2). The "LargeSecureStore" pattern from
// Supabase's Expo tutorial: the session is too large for the Keychain, so each write encrypts it
// with a fresh random 256-bit key, keeps that key in the Keychain and the ciphertext in AsyncStorage.
// See specs/mvp/2-design.md §3.2.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Readable only while the phone is unlocked, and never restored to another device (R3.2).
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// A fresh key per write means CTR's fixed starting counter never repeats under the same key.
const cipher = (key: Uint8Array) => new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));

// aes-js's own UTF-8 decoder mangles characters outside the BMP (emoji), so decode through
// percent-encoding instead. decodeURIComponent throws on invalid UTF-8, a decryption failure.
const utf8Decode = (bytes: Uint8Array) =>
  decodeURIComponent(aesjs.utils.hex.fromBytes(bytes).replace(/../g, '%$&'));

async function removeBoth(key: string): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(key, KEYCHAIN), AsyncStorage.removeItem(key)]);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const ciphertext = await AsyncStorage.getItem(key);
    if (ciphertext === null) return null;

    // A Keychain error (rather than a missing key) propagates and leaves both halves alone: reading
    // while the phone is locked fails, and that mustn't sign the member out.
    const keyHex = await SecureStore.getItemAsync(key, KEYCHAIN);
    if (keyHex !== null) {
      try {
        const plaintext = utf8Decode(
          cipher(aesjs.utils.hex.toBytes(keyHex)).decrypt(aesjs.utils.hex.toBytes(ciphertext)),
        );
        // CTR has no integrity check, so only text that parses is trusted. supabase-js stores JSON.
        JSON.parse(plaintext);
        return plaintext;
      } catch {
        // Fall through: the halves don't belong together, or one is corrupt.
      }
    }

    // Treated as signed out.
    await removeBoth(key);
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = getRandomBytes(32);
    const ciphertext = cipher(encryptionKey).encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey), KEYCHAIN);
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(ciphertext));
  },

  async removeItem(key: string): Promise<void> {
    await removeBoth(key);
  },
};
