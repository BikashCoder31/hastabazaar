import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
} from 'node:crypto';
import type { PortableInput, PortableKeyring } from './types';
import { canonicalJson, exactKeys, isPlainRecord } from './values';

export const PORTABLE_FRAME_MAX_BYTES = 524_288;
export const PORTABLE_ENCRYPTED_LINE_MAX_BYTES = 710_000;
export const PORTABLE_MAX_FRAMES = 1_000_000;
// ~64 MiB memory; two passes retain the OWASP 2^16/r8/p2 work factor.
// Fixed parameters are authenticated and checked before doing expensive work.
const KDF = { name: 'scrypt', N: 65_536, r: 8, p: 2 } as const;
let derivationBusy = false;
type Purpose = 'data' | 'key-recovery';
export type PortableHeader = {
  format: 'hastabazaar-encrypted';
  version: 1;
  purpose: Purpose;
  packageId: string;
  createdAt: string;
  cipher: 'aes-256-gcm';
  kdf: typeof KDF & { salt: string };
  noncePrefix: string;
};

function fail(message: string): never {
  throw new Error(message);
}
function base64(value: unknown, bytes?: number): Buffer {
  if (
    typeof value !== 'string' ||
    value.length > PORTABLE_ENCRYPTED_LINE_MAX_BYTES ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return fail('Invalid encrypted binary field.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.toString('base64') !== value ||
    (bytes !== undefined && decoded.length !== bytes)
  )
    return fail('Invalid encrypted binary size.');
  return decoded;
}

export function validateTransferPassphrase(passphrase: string): void {
  if (
    typeof passphrase !== 'string' ||
    Array.from(passphrase).length < 16 ||
    Buffer.byteLength(passphrase, 'utf8') > 512
  ) {
    throw new Error(
      'Use a recovery passphrase of at least 16 characters and at most 512 bytes.',
    );
  }
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  validateTransferPassphrase(passphrase);
  if (derivationBusy)
    throw new Error(
      'Another secure transfer operation is preparing its key. Wait a moment and retry.',
    );
  derivationBusy = true;
  try {
    return await new Promise((resolve, reject) =>
      scrypt(
        passphrase,
        salt,
        32,
        { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 96 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    derivationBusy = false;
  }
}

function validateHeader(
  value: unknown,
  purpose: Purpose,
): asserts value is PortableHeader {
  if (!isPlainRecord(value)) return fail('Invalid encrypted package header.');
  exactKeys(value, [
    'format',
    'version',
    'purpose',
    'packageId',
    'createdAt',
    'cipher',
    'kdf',
    'noncePrefix',
  ]);
  if (
    value.format !== 'hastabazaar-encrypted' ||
    value.version !== 1 ||
    value.cipher !== 'aes-256-gcm'
  )
    return fail('Unsupported encrypted package format.');
  if (value.purpose !== purpose)
    return fail('Wrong encrypted package purpose.');
  if (
    typeof value.packageId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,96}$/.test(value.packageId)
  )
    return fail('Invalid package ID.');
  if (
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    return fail('Invalid package creation time.');
  if (!isPlainRecord(value.kdf)) return fail('Unsupported key derivation.');
  exactKeys(value.kdf, ['name', 'N', 'r', 'p', 'salt']);
  if (
    value.kdf.name !== KDF.name ||
    value.kdf.N !== KDF.N ||
    value.kdf.r !== KDF.r ||
    value.kdf.p !== KDF.p
  )
    return fail('Unsupported or unsafe key derivation parameters.');
  base64(value.kdf.salt, 16);
  base64(value.noncePrefix, 8);
}

function nonce(header: PortableHeader, sequence: number): Buffer {
  const result = Buffer.alloc(12);
  result.set(base64(header.noncePrefix, 8));
  result.writeUInt32BE(sequence, 8);
  return result;
}

function parseCanonicalJson(bytes: Uint8Array): unknown {
  let value: unknown;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
    if (canonicalJson(value) !== text)
      return fail('Non-canonical portable JSON.');
  } catch {
    return fail('Invalid or non-canonical portable JSON.');
  }
  return value;
}

/** Each encrypted frame authenticates the header, sequence, and completion bit. */
export async function* encryptPortableFrames(
  frames: AsyncIterable<unknown>,
  passphrase: string,
  purpose: Purpose,
  options: { packageId?: string; now?: number } = {},
): AsyncGenerator<Uint8Array> {
  const header: PortableHeader = {
    format: 'hastabazaar-encrypted',
    version: 1,
    purpose,
    packageId: options.packageId ?? randomUUID(),
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
    cipher: 'aes-256-gcm',
    kdf: { ...KDF, salt: Buffer.from(randomBytes(16)).toString('base64') },
    noncePrefix: Buffer.from(randomBytes(8)).toString('base64'),
  };
  validateHeader(header, purpose);
  const key = await deriveKey(passphrase, base64(header.kdf.salt, 16));
  const headerText = canonicalJson(header);
  let sequence = 0;
  function encrypt(value: unknown, final: boolean): Uint8Array {
    if (sequence >= PORTABLE_MAX_FRAMES)
      return fail('Portable package has too many frames.');
    const plain = Buffer.from(canonicalJson(value));
    if (plain.length > PORTABLE_FRAME_MAX_BYTES)
      return fail('Portable frame exceeds its bounded size.');
    const cipher = createCipheriv('aes-256-gcm', key, nonce(header, sequence));
    cipher.setAAD(
      Buffer.from(headerText + '\n' + sequence + '\n' + Number(final)),
    );
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const line = canonicalJson({
      sequence: sequence++,
      final,
      ciphertext: encrypted.toString('base64'),
      tag: Buffer.from(cipher.getAuthTag()).toString('base64'),
    });
    return Buffer.from(line + '\n');
  }
  try {
    yield Buffer.from(headerText + '\n');
    for await (const frame of frames) yield encrypt(frame, false);
    yield encrypt({ complete: true }, true);
  } finally {
    key.fill(0);
  }
}

async function* lines(input: PortableInput): AsyncGenerator<Buffer> {
  const iterable =
    input instanceof Uint8Array
      ? (async function* () {
          yield input;
        })()
      : input;
  const pending = Buffer.alloc(PORTABLE_ENCRYPTED_LINE_MAX_BYTES);
  let used = 0;
  for await (const chunk of iterable) {
    if (!(chunk instanceof Uint8Array))
      return fail('Portable input must contain byte chunks.');
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const length = end - offset;
      if (used + length > pending.length)
        return fail('Encrypted package line exceeds its bounded size.');
      pending.set(chunk.subarray(offset, end), used);
      used += length;
      offset = end + 1;
      if (newline !== -1) {
        if (!used) return fail('Unexpected empty package frame.');
        yield Buffer.from(pending.subarray(0, used));
        used = 0;
      }
    }
  }
  if (used) return fail('Incomplete encrypted package frame.');
}

export async function* decryptPortableFrames(
  input: PortableInput,
  passphrase: string,
  purpose: Purpose,
): AsyncGenerator<{ header: PortableHeader; value: unknown }> {
  let header: PortableHeader | undefined;
  let headerText = '';
  let key: Buffer | undefined;
  let sequence = 0;
  let completed = false;
  try {
    for await (const line of lines(input)) {
      if (!header) {
        if (line.length > 4096)
          return fail('Encrypted header exceeds its bounded size.');
        const parsed = parseCanonicalJson(line);
        validateHeader(parsed, purpose);
        header = parsed;
        headerText = canonicalJson(header);
        key = await deriveKey(passphrase, base64(header.kdf.salt, 16));
        continue;
      }
      if (completed)
        return fail('Unexpected data after encrypted package completion.');
      if (sequence >= PORTABLE_MAX_FRAMES)
        return fail('Portable package has too many frames.');
      const frame = parseCanonicalJson(line);
      if (!isPlainRecord(frame)) return fail('Invalid encrypted frame.');
      exactKeys(frame, ['sequence', 'final', 'ciphertext', 'tag']);
      if (frame.sequence !== sequence || typeof frame.final !== 'boolean')
        return fail('Invalid encrypted frame order.');
      const ciphertext = base64(frame.ciphertext);
      if (ciphertext.length > PORTABLE_FRAME_MAX_BYTES)
        return fail('Encrypted frame exceeds its bounded size.');
      const tag = base64(frame.tag, 16);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key!,
        nonce(header, sequence),
      );
      decipher.setAAD(
        Buffer.from(headerText + '\n' + sequence + '\n' + Number(frame.final)),
      );
      decipher.setAuthTag(tag);
      let plaintext: Buffer;
      try {
        plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);
      } catch {
        return fail('Could not unlock package: authentication failed.');
      }
      const value = parseCanonicalJson(plaintext);
      sequence++;
      if (frame.final) {
        if (
          !isPlainRecord(value) ||
          canonicalJson(value) !== '{"complete":true}'
        )
          return fail('Invalid package completion frame.');
        completed = true;
      } else yield { header, value };
    }
    if (!header || !completed) return fail('Incomplete encrypted package.');
  } finally {
    key?.fill(0);
  }
}

export function validatePortableKeyring(
  value: unknown,
): asserts value is PortableKeyring {
  if (!isPlainRecord(value)) return fail('Invalid key recovery bundle.');
  exactKeys(value, ['version', 'activeKeyId', 'keys']);
  if (
    value.version !== 1 ||
    typeof value.activeKeyId !== 'string' ||
    !Array.isArray(value.keys) ||
    value.keys.length < 1 ||
    value.keys.length > 32
  )
    return fail('Invalid key recovery bundle.');
  const ids = new Set<string>();
  for (const entry of value.keys) {
    if (!isPlainRecord(entry)) return fail('Invalid recovery key entry.');
    exactKeys(entry, ['id', 'keyBase64']);
    if (
      typeof entry.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(entry.id) ||
      ids.has(entry.id)
    )
      return fail('Invalid or duplicated key ID.');
    const key = base64(entry.keyBase64, 32);
    if (
      createHash('sha256').update(key).digest('hex').slice(0, 32) !== entry.id
    )
      return fail('Recovery key does not match its stable key ID.');
    ids.add(entry.id);
  }
  if (!ids.has(value.activeKeyId))
    return fail('The active key is absent from the recovery bundle.');
}

/** Key recovery is deliberately a different authenticated purpose/package. */
export async function exportKeyRecovery(
  keyring: PortableKeyring,
  passphrase: string,
): Promise<Uint8Array> {
  validatePortableKeyring(keyring);
  const chunks: Uint8Array[] = [];
  async function* frame() {
    yield { type: 'keyring', keyring };
  }
  for await (const chunk of encryptPortableFrames(
    frame(),
    passphrase,
    'key-recovery',
  ))
    chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Server-only result; never send the returned raw key material to an inspection UI. */
export async function inspectKeyRecovery(
  input: PortableInput,
  passphrase: string,
): Promise<PortableKeyring> {
  let result: PortableKeyring | undefined;
  for await (const { value } of decryptPortableFrames(
    input,
    passphrase,
    'key-recovery',
  )) {
    if (result || !isPlainRecord(value))
      return fail('Invalid key recovery payload.');
    exactKeys(value, ['type', 'keyring']);
    if (value.type !== 'keyring') return fail('Invalid key recovery payload.');
    validatePortableKeyring(value.keyring);
    result = value.keyring;
  }
  if (!result) return fail('Missing key recovery payload.');
  return result;
}
