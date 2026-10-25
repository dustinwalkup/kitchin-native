import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// A per-device yes or no that outlasts a restart, such as hiding checked groceries. Only booleans
// under fixed keys: never household content (R26.4). A storage failure keeps the default, since
// these are conveniences.

const PREFIX = 'kitchin.pref.';

/** The stored value, `initial` until it has loaded or when nothing is stored, and a setter. */
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((stored) => {
        if (current && stored !== null) setValue(stored === 'true');
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      AsyncStorage.setItem(PREFIX + key, String(next)).catch(() => {});
    },
    [key],
  );

  return [value, set];
}
