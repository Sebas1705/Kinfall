import { Platform } from 'react-native';

import appPackage from '../../package.json';

/** What the self test reports about the JS engine and device it ran on. Dev screen data. */
export interface EngineInfo {
  hermes: boolean;
  /** Hermes "OSS Release Version" (or another version property when that one is missing). */
  hermesVersion: string | null;
  hermesBytecode: string | null;
  os: string;
  osVersion: string;
  reactNative: string;
  /** Declared `expo` dependency of the app, e.g. "58.0.25" (SDK 58). */
  expo: string;
  /** Android `Platform.constants` model (no expo-device dependency); null where unavailable. */
  model: string | null;
  structuredClone: string;
}

type PlatformLike = Pick<typeof Platform, 'OS' | 'Version'> & { constants?: unknown };

function prop(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>)[key] : undefined;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null;
}

function hermesProps(hermes: unknown): Record<string, unknown> {
  const fn = prop(hermes, 'getRuntimeProperties');
  if (typeof fn !== 'function') return {};
  try {
    const props: unknown = fn.call(hermes);
    return typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rnVersion(constants: unknown): string {
  const v = prop(constants, 'reactNativeVersion');
  const major = prop(v, 'major');
  if (typeof major !== 'number') return 'unknown';
  const pre = text(prop(v, 'prerelease'));
  return `${major}.${String(prop(v, 'minor'))}.${String(prop(v, 'patch'))}${pre ? `-${pre}` : ''}`;
}

function modelOf(constants: unknown): string | null {
  const model = text(prop(constants, 'Model'));
  if (!model) return null;
  const maker = text(prop(constants, 'Manufacturer')) ?? text(prop(constants, 'Brand'));
  return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model;
}

export function getEngineInfo(
  g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
  platform: PlatformLike = Platform,
): EngineInfo {
  const hermes = g.HermesInternal;
  const props = hermesProps(hermes);
  let constants: unknown;
  try {
    constants = platform.constants;
  } catch {
    constants = undefined;
  }
  return {
    hermes: hermes !== undefined && hermes !== null,
    hermesVersion: text(props['OSS Release Version']) ?? text(props['Version']) ?? text(props['Build']),
    hermesBytecode: text(props['Bytecode Version']),
    os: platform.OS,
    osVersion: String(platform.Version),
    reactNative: rnVersion(constants),
    expo: appPackage.dependencies.expo,
    model: modelOf(constants),
    structuredClone: typeof g.structuredClone,
  };
}

/** Display and log lines, one fact each. */
export function engineInfoLines(info: EngineInfo): string[] {
  const sdk = info.expo.split('.')[0] ?? info.expo;
  return [
    `HermesInternal: ${info.hermes ? 'present' : 'absent'}`,
    `Hermes version: ${info.hermesVersion ?? 'unknown'}${info.hermesBytecode ? ` (bytecode ${info.hermesBytecode})` : ''}`,
    `Platform: ${info.os} ${info.osVersion}`,
    `React Native: ${info.reactNative}`,
    `Expo SDK: ${sdk} (expo ${info.expo})`,
    `Device: ${info.model ?? 'unknown'}`,
    `typeof structuredClone: ${info.structuredClone}`,
  ];
}
