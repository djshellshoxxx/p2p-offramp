/** Internal reflection-safe array snapshot shared by frame parsing and pool filter admission; not re-exported. */

/**
 * Own-data-property snapshot of a plain array: no foreign iterator or indexed getter is used.
 * Callers must guard reflection failure (a Proxy can throw from any of these operations).
 */
export function indexedValues(input: unknown, minimum: number, maximum: number): unknown[] | null {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
  const length: unknown = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < minimum || length > maximum || Reflect.ownKeys(input).length !== length + 1) return null;
  const values: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    values.push(descriptor.value);
  }
  return values;
}
