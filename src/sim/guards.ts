/** Structural type guards shared by the save-data validators. */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function isUint32Quad(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every((w) => isInt(w) && w >= 0 && w <= 0xffffffff);
}

/** An error message naming the first own key of `rec` that is not in `allowed`, or null. */
export function unknownKey(rec: Record<string, unknown>, allowed: readonly string[], where: string): string | null {
  for (const k of Object.keys(rec)) {
    if (!allowed.includes(k)) return `${where} has an unknown key ${JSON.stringify(k)}`;
  }
  return null;
}

export function hasOwn(rec: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(rec, key);
}
