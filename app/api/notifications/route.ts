import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { getNotificationPanel } from '@/lib/operations/notification-panel';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, audience = params.get('audience') ?? 'customer';
  if (!['customer', 'seller', 'staff'].includes(audience)) return reply({ error: 'Unknown notification workspace.' }, 400);
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    if (audience === 'staff') {
      const staff = await requireExistingStaffIntentApi(request,'account.self.manage');
      if(hasActorIntentMismatch(request,staff.id))return reply({error:'Your signed-in account changed. Refresh the notification workspace.'},403);
      return reply(await getNotificationPanel(db, { userId: staff.id, audience, staff, unreadOnly: params.get('filter') === 'unread' }));
    }
    if (audience === 'seller') {
      const identity = await getAuthenticatedUser({readOnly:true});
      if (!identity) return reply({ error: 'Sign in to view notifications.' }, 401);
      const viewer = await getSellerCenterAccess(db, identity.userId);
      if (!viewer) return reply({ error: 'Seller workspace access is unavailable.' }, 403);
      if(hasActorIntentMismatch(request,viewer.userId))return reply({error:'Your signed-in account changed. Refresh the notification workspace.'},403);
      return reply(await getNotificationPanel(db, { userId: viewer.userId, audience, unreadOnly: params.get('filter') === 'unread' }));
    }
    const viewer = await requireExistingCustomerApi();
    if(hasActorIntentMismatch(request,viewer.userId))return reply({error:'Your signed-in account changed. Refresh the notification workspace.'},403);
    return reply(await getNotificationPanel(db, { userId: viewer.userId, audience: 'customer', unreadOnly: params.get('filter') === 'unread' }));
  } catch (error) {
    if (error instanceof CustomerAuthorizationError || error instanceof StaffAuthorizationError) return reply({ error: error.message }, error.status);
    return reply({ error: 'Notifications could not be loaded. Retry shortly.' }, 503);
  }
}
