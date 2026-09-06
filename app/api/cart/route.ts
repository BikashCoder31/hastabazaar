import { env } from 'cloudflare:workers';

import { CART_COOKIE, cartCookie, createOpaqueToken, hashOpaqueToken, readCookie } from '@/lib/cart/session';
import { addCartItem, CartConflictError, getCart, removeCartItem, updateCartItem } from '@/lib/db/repositories/cart';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function database(): D1Database {
  return requireDatabase(env as unknown as { DB?: D1Database });
}

function json(data: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

async function cartIdentity(request: Request): Promise<{ hash: string; cookie?: string }> {
  const existing = readCookie(request, CART_COOKIE);
  const token = existing && existing.length >= 32 && existing.length <= 128 ? existing : createOpaqueToken();
  return { hash: await hashOpaqueToken(token), cookie: existing ? undefined : cartCookie(request, token) };
}

function parseQuantity(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

export async function GET(request: Request): Promise<Response> {
  const identity = await cartIdentity(request);
  return json(await getCart(database(), identity.hash), 200, identity.cookie);
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  const identity = await cartIdentity(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = typeof body.productId === 'string' ? body.productId : '';
    if (!productId || productId.length > 64) return json({ error: 'A valid product is required.' }, 400, identity.cookie);
    const cart = await addCartItem(database(), identity.hash, productId, parseQuantity(body.quantity), Date.now());
    return json(cart, 200, identity.cookie);
  } catch (error) {
    if (error instanceof CartConflictError) return json({ error: error.message }, 409, identity.cookie);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400, identity.cookie);
    console.error('Cart add failed', error);
    return json({ error: 'The cart could not be updated.' }, 500, identity.cookie);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  const identity = await cartIdentity(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (!itemId || itemId.length > 64) return json({ error: 'A valid cart item is required.' }, 400, identity.cookie);
    const cart = await updateCartItem(database(), identity.hash, itemId, parseQuantity(body.quantity), Date.now());
    return json(cart, 200, identity.cookie);
  } catch (error) {
    if (error instanceof CartConflictError) return json({ error: error.message }, 409, identity.cookie);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400, identity.cookie);
    console.error('Cart update failed', error);
    return json({ error: 'The cart could not be updated.' }, 500, identity.cookie);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  const identity = await cartIdentity(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (!itemId || itemId.length > 64) return json({ error: 'A valid cart item is required.' }, 400, identity.cookie);
    return json(await removeCartItem(database(), identity.hash, itemId), 200, identity.cookie);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400, identity.cookie);
    console.error('Cart removal failed', error);
    return json({ error: 'The cart could not be updated.' }, 500, identity.cookie);
  }
}
