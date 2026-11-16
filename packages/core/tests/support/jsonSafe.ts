/**
 * Throws with the offending path unless `value` survives a JSON round trip unchanged: only
 * null, booleans, finite numbers (not -0), strings, dense arrays and plain objects (prototype
 * `Object.prototype` or null) whose values are all JSON-safe. `undefined` values, NaN,
 * Infinity, Map, Set, Date, class instances, functions, symbols, bigints and sparse arrays fail.
 */
export function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null) return;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return;
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`${path}: non-finite number ${String(value)}`);
      if (Object.is(value, -0)) throw new Error(`${path}: -0 (JSON writes it as 0)`);
      return;
    case 'object':
      break;
    default:
      throw new Error(`${path}: ${typeof value} is not JSON-safe`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${path}: array subclass`);
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new Error(`${path}[${i}]: hole in a sparse array`);
      assertJsonSafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    throw new Error(`${path}: ${name} instance is not a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path}: symbol keys`);
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) throw new Error(`${path}.${k}: undefined value (JSON drops the key)`);
    assertJsonSafe(v, `${path}.${k}`);
  }
}
