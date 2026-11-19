import { describe, expect, it } from '@jest/globals';

import { shouldAutorunSelfTest } from '../src/selfTestAutorun';

describe('shouldAutorunSelfTest', () => {
  it('is off by default', () => {
    expect(shouldAutorunSelfTest(null, undefined)).toBe(false);
    expect(shouldAutorunSelfTest(undefined, undefined)).toBe(false);
    expect(shouldAutorunSelfTest('', '')).toBe(false);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081', undefined)).toBe(false);
    expect(shouldAutorunSelfTest('exp://192.168.1.20:8081/--/', '0')).toBe(false);
  });

  it('turns on with the build-time env flag', () => {
    expect(shouldAutorunSelfTest(null, '1')).toBe(true);
    expect(shouldAutorunSelfTest(null, 'true')).toBe(true);
    expect(shouldAutorunSelfTest(null, 'yes')).toBe(false);
  });

  it('turns on with a selftest path or query in the opening URL', () => {
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/selftest', undefined)).toBe(true);
    expect(shouldAutorunSelfTest('exp://192.168.1.20:8081/--/?selftest=1', undefined)).toBe(true);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081?selftest', undefined)).toBe(true);
    expect(shouldAutorunSelfTest('kinfall://selftest', undefined)).toBe(true);
    expect(shouldAutorunSelfTest('kinfall://SelfTest/', undefined)).toBe(true);
  });

  it('ignores lookalikes and explicit opt-outs', () => {
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/selftester', undefined)).toBe(false);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/?selftest=0', undefined)).toBe(false);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/?selftest=false', undefined)).toBe(false);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/?x=selftest', undefined)).toBe(false);
    expect(shouldAutorunSelfTest('exp://127.0.0.1:8081/--/#selftest', undefined)).toBe(false);
  });
});
