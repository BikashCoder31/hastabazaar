import { registerHooks } from 'node:module';
declare global {
  var healthNoticeDb: D1Database;
}
export function installHealthNoticeRouteFixture() {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'cloudflare:workers')
        return {
          url: 'data:text/javascript,export const env={get DB(){return globalThis.healthNoticeDb}}',
          shortCircuit: true,
        };
      if (specifier === '@/lib/auth/staff')
        return {
          url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){const current=await globalThis.healthNoticeDb.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=\'health-sa\' AND u.status=\'active\' AND r.role=\'super_admin\'").first();if(!current)throw new StaffAuthorizationError("Current fictional authority required");return{id:"health-sa",role:"super_admin"}}',
          shortCircuit: true,
        };
      return next(specifier, context);
    },
  });
}
export async function actualHealthBellRead(id: string) {
  const { POST } =
    await import('../../app/api/admin/notifications/[id]/read/route');
  return POST(
    new Request(
      'http://localhost:3018/api/admin/notifications/' + id + '/read',
      { method: 'POST', headers: { origin: 'http://localhost:3018' } },
    ),
    { params: Promise.resolve({ id }) },
  );
}
