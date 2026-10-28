import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class SecurityStateError extends Error {
  constructor(message = 'Account security state is unavailable. Keep the existing security key and contact the owner.') {
    super(message); this.name = 'SecurityStateError';
  }
}

function decodeCanonical(value: string, bytes?: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new SecurityStateError();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value || (bytes !== undefined && decoded.length !== bytes)) throw new SecurityStateError();
  return decoded;
}

export function securityKeyId(key: string): string {
  return createHash('sha256').update(decodeCanonical(key, 32)).digest('hex').slice(0, 32);
}

const aad = (rowKey: string, userId: string) => Buffer.from(JSON.stringify(['hastabazaar-account-security', 1, rowKey, userId]), 'utf8');

export function encryptSecurityValue(key: string, rowKey: string, userId: string, value: unknown): string {
  const material = decodeCanonical(key, 32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', material, nonce);
  cipher.setAAD(aad(rowKey, userId));
  const plaintext = JSON.stringify(value);
  if (plaintext.length > 1_000_000) throw new SecurityStateError();
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, kid: securityKeyId(key), n: Buffer.from(nonce).toString('base64url'), c: ciphertext.toString('base64url'), t: Buffer.from(cipher.getAuthTag()).toString('base64url') });
}

export function decryptSecurityValue(key: string, rowKey: string, userId: string, raw: string): unknown {
  try {
    if (typeof raw !== 'string' || raw.length > 1_400_000) throw new SecurityStateError();
    const envelope = JSON.parse(raw);
    if (!envelope || Object.keys(envelope).sort().join(',') !== 'c,kid,n,t,v' || envelope.v !== 1 || envelope.kid !== securityKeyId(key)) throw new SecurityStateError();
    const decipher = createDecipheriv('aes-256-gcm', decodeCanonical(key, 32), decodeCanonical(envelope.n, 12));
    decipher.setAAD(aad(rowKey, userId)); decipher.setAuthTag(decodeCanonical(envelope.t, 16));
    return JSON.parse(Buffer.concat([decipher.update(decodeCanonical(envelope.c)), decipher.final()]).toString('utf8'));
  } catch { throw new SecurityStateError(); }
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(value: Uint8Array): string {
  let bits = 0; let accumulator = 0; let output = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(accumulator >>> bits) & 31]; }
  }
  if (bits) output += alphabet[(accumulator << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(value: string): Buffer {
  if (typeof value !== 'string' || !/^[A-Z2-7]{16,128}$/.test(value)) throw new SecurityStateError('Invalid authenticator secret.');
  let bits = 0; let accumulator = 0; const result: number[] = [];
  for (const character of value) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; result.push((accumulator >>> bits) & 255); }
  }
  const buffer = Buffer.from(result);
  if (encodeBase32(buffer) !== value) throw new SecurityStateError('Invalid authenticator secret.');
  return buffer;
}

export function newAuthenticatorSecret(): string { return encodeBase32(randomBytes(20)); }

export function totpAtCounter(secret: string, counter: number): string {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new SecurityStateError();
  const count = Buffer.alloc(8); count.writeBigUInt64BE(BigInt(counter));
  const digest = Buffer.from(createHmac('sha1', decodeBase32(secret)).update(count).digest());
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, now: number, lastCounter: number | null): number | null {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !Number.isSafeInteger(now) || now < 0) return null;
  const current = Math.floor(now / 30_000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter < 0 || (lastCounter !== null && counter <= lastCounter)) continue;
    if (timingSafeEqual(Buffer.from(totpAtCounter(secret, counter)), Buffer.from(code))) return counter;
  }
  return null;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => Buffer.from(randomBytes(16)).toString('hex').toUpperCase().match(/.{8}/g)!.join('-'));
}

export function recoveryCodeHash(userId: string, setId: string, code: string): string {
  const normalized = code.trim().toUpperCase().replace(/-/g, '');
  if (!/^[A-F0-9]{32}$/.test(normalized)) throw new SecurityStateError('The recovery code is not valid.');
  return createHash('sha256').update(JSON.stringify(['hastabazaar-recovery', 1, userId, setId, normalized])).digest('hex');
}

export function equalHash(left: string, right: string): boolean {
  return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
