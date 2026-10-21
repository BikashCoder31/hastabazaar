/** A logical database value. Numeric strings are never guessed or rounded. */
export type PortableValue =
  | { type: 'null' }
  | { type: 'text' | 'integer' | 'decimal' | 'real' | 'bytes'; value: string };

export type PortableRow = PortableValue[];
export const PORTABLE_VALUE_MAX_BYTES = 262_144;

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): void {
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, i) => key !== [...expected].sort()[i])
  ) {
    throw new Error('Unsupported fields in portable data.');
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (!isPlainRecord(value))
    throw new Error('Unsupported value in portable data.');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key]))
      .join(',') +
    '}'
  );
}

export function validatePortableValue(
  value: unknown,
): asserts value is PortableValue {
  if (!isPlainRecord(value)) throw new Error('Invalid portable value.');
  if (value.type === 'null') {
    exactKeys(value, ['type']);
    return;
  }
  exactKeys(value, ['type', 'value']);
  if (
    typeof value.value !== 'string' ||
    Buffer.byteLength(value.value, 'utf8') > PORTABLE_VALUE_MAX_BYTES
  ) {
    throw new Error('Portable value exceeds the bounded value size.');
  }
  switch (value.type) {
    case 'text':
      return;
    case 'integer':
      if (!/^(?:0|-?[1-9][0-9]{0,127})$/.test(value.value))
        throw new Error('Invalid exact integer.');
      return;
    case 'decimal':
      if (!/^-?(?:0|[1-9][0-9]{0,127})(?:\.[0-9]{1,128})?$/.test(value.value))
        throw new Error('Invalid exact decimal.');
      return;
    case 'real': {
      const number = Number(value.value);
      if (
        !Number.isFinite(number) ||
        (value.value !== '-0' && String(number) !== value.value)
      )
        throw new Error('Invalid finite real.');
      return;
    }
    case 'bytes':
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          value.value,
        ) ||
        Buffer.from(value.value, 'base64').toString('base64') !== value.value
      )
        throw new Error('Invalid binary encoding.');
      return;
    default:
      throw new Error('Unknown portable value type.');
  }
}

export function decimalPortableValue(value: string): PortableValue {
  const result = { type: 'decimal' as const, value };
  validatePortableValue(result);
  return result;
}

export function encodePortableValue(
  value: string | number | bigint | Uint8Array | ArrayBuffer | null,
): PortableValue {
  let result: PortableValue;
  if (value === null) result = { type: 'null' };
  else if (typeof value === 'string') result = { type: 'text', value };
  else if (typeof value === 'bigint')
    result = { type: 'integer', value: value.toString() };
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite database number.');
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      throw new Error(
        'Unsafe integer: use an exact integer string from the database adapter.',
      );
    result = {
      type:
        Object.is(value, -0) || !Number.isInteger(value) ? 'real' : 'integer',
      value: Object.is(value, -0) ? '-0' : String(value),
    };
  } else
    result = {
      type: 'bytes',
      value: Buffer.from(
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ).toString('base64'),
    };
  validatePortableValue(result);
  return result;
}
