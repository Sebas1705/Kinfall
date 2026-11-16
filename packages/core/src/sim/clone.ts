/**
 * Deep copy of plain engine data: null, undefined, booleans, numbers, strings, arrays and plain
 * objects (prototype `Object.prototype` or null), the only shapes battle and run state hold.
 *
 * Replaces `structuredClone`, which some JavaScript engines (Hermes on React Native) may lack.
 * For plain data the result matches `structuredClone`: same keys in the same order, including
 * keys whose value is `undefined`. Anything else (Map, Set, Date, class instances, functions,
 * symbols, bigints) throws instead of being copied wrongly. Cycles are not supported.
 */
export function clone<T>(value: T): T {
  return copy(value) as T;
}

function copy(value: unknown): unknown {
  if (typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      throw new TypeError(`clone: unsupported ${typeof value}`);
    }
    return value;
  }
  if (value === null) return null;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = copy(value[i]);
    return out;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError('clone: unsupported object type');
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    // An own "__proto__" key (possible after JSON.parse) must stay a plain property.
    if (key === '__proto__') {
      Object.defineProperty(out, key, { value: copy(src[key]), enumerable: true, writable: true, configurable: true });
    } else {
      out[key] = copy(src[key]);
    }
  }
  return out;
}
