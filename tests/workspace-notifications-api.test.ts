import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { completeVersionFixture } from './helpers/complete-version-fixture';

declare global { var workspaceNoticeDb: D1Database; var workspaceNoticeIdentity: { userId: string } | null; }
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function redirect(url){throw new Error("Unexpected page redirect: "+url)}', shortCircuit: true };
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.workspaceNoticeDb}}', shortCircuit: true };
  if (specifier === '@/app/auth') return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.workspaceNoticeIdentity};export async function requireAuthenticatedUser(){return globalThis.workspaceNoticeIdentity}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){throw new StaffAuthorizationError("Staff access required")}', shortCircuit: true };
  return next(specifier, context);
} });

void test('actual notification endpoints enforce current recipient access without provisioning roles or changing tasks', async () => {
  const f = await completeVersionFixture();
  globalThis.workspaceNoticeDb = f.db;
  try {
    const { GET } = await import('../app/api/notifications/route');
    const { POST } = await import('../app/api/notifications/[id]/read/route');
    f.sqlite.exec(`DELETE FROM notification_messages;
      INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at)
      VALUES('own-notice','registered-owner','seller','in_app','fixture.notice','Fictional','Fictional','Open record','Open record','sent','fixture-notice',1),
      ('private-staff','registered-owner','staff','in_app','fixture.notice','Staff','Staff','Private work','Private work','sent','fixture-staff',2);`);
    const get = () => GET(new Request('http://localhost:3018/api/notifications?audience=seller'));
    const read = (id: string, origin = 'http://localhost:3018') => POST(new Request(`http://localhost:3018/api/notifications/${id}/read`, { method: 'POST', headers: { origin } }), { params: Promise.resolve({ id }) });
    globalThis.workspaceNoticeIdentity = null; assert.equal((await get()).status, 401);
    globalThis.workspaceNoticeIdentity = { userId: 'foreign' }; assert.equal((await get()).status, 403); assert.equal((await read('own-notice')).status, 404);
    globalThis.workspaceNoticeIdentity = { userId: 'registered-owner' };
    const response = await get(); assert.equal(response.status, 200);
    const body = await response.json() as { unreadCount: number; items: { id: string }[] };
    assert.equal(body.unreadCount, 1); assert.deepEqual(body.items.map(item => item.id), ['own-notice']);
    assert.equal((await read('own-notice', 'https://foreign.test')).status, 403);
    assert.equal((await read('private-staff')).status, 404);
    assert.equal((await read('own-notice')).status, 200);
    assert.equal((await read('own-notice')).status, 200);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='registered-owner' AND role='customer'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT mode FROM seller_restrictions WHERE seller_id='registered'").get()?.mode, 'disabled');
    f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='registered-owner'");
    assert.equal((await get()).status, 403); assert.equal((await read('own-notice')).status, 403);
  } finally { globalThis.workspaceNoticeIdentity = null; f.dispose(); }
});
