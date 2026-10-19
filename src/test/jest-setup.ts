// Mocks for native modules that can't run under Jest (specs/mvp/4-test-plan.md §8.4). A test file
// can still override any of them with its own jest.mock().

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// Zero insets, and a SafeAreaProvider that needs no native measurement.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// Icon fonts can't load from the asset registry under Jest. Reporting them as loaded lets
// @expo/vector-icons render its glyphs straight away.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true }));
