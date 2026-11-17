import { describe, expect, it } from '@jest/globals';

import { engineInfoLines, getEngineInfo } from '../../src/platform/engineInfo';

const android = {
  OS: 'android' as const,
  Version: 36,
  constants: {
    reactNativeVersion: { major: 0, minor: 88, patch: 1, prerelease: null },
    Model: 'sdk_gphone64_x86_64',
    Manufacturer: 'Google',
  },
};

describe('getEngineInfo', () => {
  it('reads Hermes, platform, React Native, Expo, device and structuredClone', () => {
    const g = {
      HermesInternal: {
        getRuntimeProperties: () => ({ 'OSS Release Version': '0.14.0', 'Bytecode Version': 96 }),
      },
      structuredClone: () => null,
    };
    const info = getEngineInfo(g, android);
    expect(info).toEqual({
      hermes: true,
      hermesVersion: '0.14.0',
      hermesBytecode: '96',
      os: 'android',
      osVersion: '36',
      reactNative: '0.88.1',
      expo: expect.stringMatching(/^58\./),
      model: 'Google sdk_gphone64_x86_64',
      structuredClone: 'function',
    });
    expect(engineInfoLines(info)).toEqual([
      'HermesInternal: present',
      'Hermes version: 0.14.0 (bytecode 96)',
      'Platform: android 36',
      'React Native: 0.88.1',
      `Expo SDK: 58 (expo ${info.expo})`,
      'Device: Google sdk_gphone64_x86_64',
      'typeof structuredClone: function',
    ]);
  });

  it('copes with no Hermes, a throwing getRuntimeProperties and missing constants', () => {
    const none = getEngineInfo({}, { OS: 'ios', Version: '18.0' });
    expect(none).toMatchObject({ hermes: false, hermesVersion: null, reactNative: 'unknown', model: null, structuredClone: 'undefined' });
    const throwing = getEngineInfo(
      { HermesInternal: { getRuntimeProperties: () => { throw new Error('x'); } } },
      { OS: 'android', Version: 30, constants: { Model: 'Pixel 9', Brand: 'google' } },
    );
    expect(throwing).toMatchObject({ hermes: true, hermesVersion: null, model: 'google Pixel 9' });
    expect(getEngineInfo({}, { OS: 'android', Version: 30, constants: { Model: 'Google Pixel 9', Manufacturer: 'Google' } }).model).toBe(
      'Google Pixel 9',
    );
    expect(engineInfoLines(none)[1]).toBe('Hermes version: unknown');
  });
});
