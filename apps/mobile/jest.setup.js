// Official AsyncStorage mock; tests that need a failing or empty storage pass their own.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
