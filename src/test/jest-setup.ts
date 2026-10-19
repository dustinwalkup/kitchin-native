// Mocks for native modules that can't run under Jest (specs/mvp/4-test-plan.md §8.4). A test file
// can still override any of them with its own jest.mock().

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// Zero insets, and a SafeAreaProvider that needs no native measurement.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// The library's in-memory mock. Anything that imports the session storage (and so the Supabase
// client) loads AsyncStorage, whose native module doesn't exist under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The library's mock: connected, with an addEventListener that never fires. Tests drive
// connectivity through `onlineManager.setOnline` (4-test-plan §8.4).
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

// Sentry's SDK can't load under Jest (its @sentry/core build is an ES module), and tests must never
// send anything. Tests assert on these calls (4-test-plan §8.4). `wrap` and the integration
// factories are plain functions, so resetting mocks can't break the root layout.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: <T>(component: T) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  breadcrumbsIntegration: (options: unknown) => ({ name: 'Breadcrumbs', options }),
  expoRouterIntegration: () => ({ name: 'ExpoRouter' }),
}));

// Icon fonts can't load from the asset registry under Jest. Reporting them as loaded lets
// @expo/vector-icons render its glyphs straight away.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true }));
