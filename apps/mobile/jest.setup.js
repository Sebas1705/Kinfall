// Official AsyncStorage mock; tests that need a failing or empty storage pass their own.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Skia has no native module under Jest; the official setup replaces it with a stub.
require('@shopify/react-native-skia/jestSetup');
