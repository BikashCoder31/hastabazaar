import { env } from 'cloudflare:workers';

import {
  StaffAuthorizationError,
} from '@/lib/auth/staff';
import {requireStaffIntentApi,requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { revokeStaffInvitation,StaffInvitationAccessError,readStaffInvitationState } from '@/lib/db/repositories/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function GET(request:Request,context:{params:Promise<{id:string}>}):Promise<Response>{
 try{
  const staff=await requireExistingStaffIntentApi(request,'admin.invite');
  if(staff.role!=='super_admin')return json({error:'Only a Super Admin can read invitation status.'},403);
  const {id}=await context.params;
  if(!id||id.length>191)return json({error:'Select a valid invitation.'},400);
  const status=await readStaffInvitationState(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:staff.id,actorAuthSubject:staff.authSubject,invitationId:id,now:Date.now()});
  const confirmed=await requireStaffIntentApi(request,'admin.invite',staff.id);
  if(confirmed.authSubject!==staff.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
  return status?json(status,200):json({error:'Invitation status was not found.'},404);
 }catch(error){
  if(error instanceof StaffAuthorizationError)return json({error:error.message},error.status);
  if(error instanceof StaffInvitationAccessError)return json({error:error.message},403);
  return json({error:'Current invitation status could not be checked.'},503);
 }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  try {
    const staff = await requireStaffIntentApi(request,'admin.invite');
    const { id } = await context.params;
    const revoked = await revokeStaffInvitation(
      requireDatabase(env as unknown as { DB?: D1Database }),
      { invitationId: id, actorId: staff.id, actorAuthSubject:staff.authSubject, now: Date.now() },
    );
    if (!revoked) {
      return json({ error: 'Only pending invitations can be revoked.' }, 409);
    }
    const confirmed=await requireStaffIntentApi(request,'admin.invite',staff.id);
    if(confirmed.authSubject!==staff.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
    return json({id,revoked:true,actorId:staff.id,message:'Invitation revoked.'},200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if(error instanceof StaffInvitationAccessError)return json({error:error.message},403);
    return json({ error: 'The invitation could not be revoked.' }, 500);
  }
}
