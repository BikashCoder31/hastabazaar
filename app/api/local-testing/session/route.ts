import { env } from 'cloudflare:workers';

import {
  isLocalTestRequest,
  localTestCookieName,
  localTestRoles,
  type LocalTestRole,
} from '@/lib/auth/local-test-access';
import { ensureLocalTestAccount } from '@/lib/auth/local-test-seed';
import { requireDatabase } from '@/lib/db/d1';

const destinations: Record<LocalTestRole, string> = {
  customer: '/account',
  buyer: '/account',
  rider: '/rider',
  seller: '/seller',
  admin: '/admin',
  super_admin: '/admin',
};

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isLocalTestRequest(request.headers)) return new Response('Not found', { status: 404 });
  if (request.headers.get('origin') !== url.origin) {
    return new Response('Invalid request origin.', { status: 403 });
  }

  const formData = await request.formData();
  const requestedRole = formData.get('role');
  const role = localTestRoles.find((candidate) => candidate === requestedRole);
  if (!role) return new Response('Select a valid local test role.', { status: 400 });

  await ensureLocalTestAccount(
    requireDatabase(env as unknown as { DB?: D1Database }),
    role,
  );

  return new Response(null, {
    status: 303,
    headers: {
      Location: destinations[role],
      'Set-Cookie': `${localTestCookieName}=${encodeURIComponent(role)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isLocalTestRequest(request.headers)) return new Response('Not found', { status: 404 });
  if (request.headers.get('origin') !== url.origin) {
    return new Response('Invalid request origin.', { status: 403 });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/local-testing',
      'Set-Cookie': `${localTestCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}
