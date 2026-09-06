export const CART_COOKIE = 'hastabazaar_cart';
export const RECEIPT_COOKIE = 'hastabazaar_receipt';

const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const RECEIPT_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function createOpaqueToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashOpaqueToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function readCookie(request: Request, name: string): string | null {
  return readCookieHeader(request.headers.get('cookie'), name);
}

export function readCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function secureAttribute(request: Request): string {
  return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
}

export function cartCookie(request: Request, token: string): string {
  return `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CART_MAX_AGE_SECONDS}${secureAttribute(request)}`;
}

export function receiptCookie(request: Request, token: string): string {
  return `${RECEIPT_COOKIE}=${encodeURIComponent(token)}; Path=/orders; HttpOnly; SameSite=Lax; Max-Age=${RECEIPT_MAX_AGE_SECONDS}${secureAttribute(request)}`;
}
