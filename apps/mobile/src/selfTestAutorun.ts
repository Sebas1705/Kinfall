/**
 * Whether the app should open the self test and run it on start. Off by default; on when the
 * bundle was built with EXPO_PUBLIC_SELFTEST_AUTORUN=1, or when the app was opened through a URL
 * that asks for it: a `selftest` query parameter (`?selftest=1`) or a `selftest` path segment,
 * e.g. `exp://127.0.0.1:8081/--/selftest` in Expo Go or `webgames://selftest` in a build.
 */
export function shouldAutorunSelfTest(url: string | null | undefined, envFlag: string | undefined): boolean {
  if (envFlag === '1' || envFlag === 'true') return true;
  if (!url) return false;
  const [beforeHash] = url.split('#');
  const [path = '', query = ''] = (beforeHash ?? '').split('?');
  const params = query.split('&').map((p) => p.split('='));
  if (params.some(([k, v]) => k === 'selftest' && v !== '0' && v !== 'false')) return true;
  // Path segments after the scheme: `webgames://selftest` puts it in the host position.
  const afterScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return afterScheme.split('/').some((segment) => segment.toLowerCase() === 'selftest');
}

/** The build-time flag; must be read as a literal `process.env.EXPO_PUBLIC_*` so Expo inlines it. */
export function selfTestEnvFlag(): string | undefined {
  return process.env.EXPO_PUBLIC_SELFTEST_AUTORUN;
}
