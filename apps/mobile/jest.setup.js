// Official AsyncStorage mock; tests that need a failing or empty storage pass their own.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Skia has no native module under Jest; the official setup replaces it with a stub.
require('@shopify/react-native-skia/jestSetup');

// Safe area insets of zero without a native module (official mock).
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// expo-crypto's native module is missing under Jest: fill bytes from Node's crypto instead.
jest.mock('expo-crypto', () => ({
  getRandomValues: (bytes) => require('node:crypto').getRandomValues(bytes),
}));
