import { env } from 'cloudflare:workers';

import {
  StaffAuthorizationError,
  type StaffRole,
} from '@/lib/auth/staff';
import {requireStaffIntentApi,requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import {
  createStaffInvitation,
  StaffInvitationConflictError,
  StaffInvitationAccessError,
  readStaffInvitationOutcome,
} from '@/lib/db/repositories/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { sendStaffInvitationEmail } from '@/lib/email/staff-invitation';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {validateAdminPermissions} from '@/lib/marketplace/permissions';

export const dynamic = 'force-dynamic';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request:Request){
 try{
  const staff=await requireExistingStaffIntentApi(request,'admin.invite');
  if(staff.role!=='super_admin')return json({error:'Only a Super Admin can read invitation outcomes.'},403);
  const requestId=new URL(request.url).searchParams.get('requestId');
  if(!requestId||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))return json({error:'A valid invitation request reference is required.'},400);
  const outcome=await readStaffInvitationOutcome(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:staff.id,actorAuthSubject:staff.authSubject,requestId,now:Date.now()});
  const confirmed=await requireStaffIntentApi(request,'admin.invite',staff.id);
  if(confirmed.authSubject!==staff.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
  return outcome?json(outcome,200):json({recorded:false,requestId,status:'unconfirmed',code:'outcome_unconfirmed'},404);
 }catch(error){
  if(error instanceof StaffAuthorizationError)return json({error:error.message},error.status);
  if(error instanceof StaffInvitationAccessError)return json({error:error.message},403);
  return json({error:'The original invitation outcome could not be checked.',code:'outcome_unconfirmed',phase:'outcome_unconfirmed'},503);
 }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let validatedVersionId: string | undefined;
  let writeStarted=false,reference:{requestId:string;actorId:string}|undefined;
  const fail=(body:Record<string,unknown>,status:number)=>json({...body,...reference,
    phase:writeStarted?'outcome_unconfirmed':'rejected_before_write'},status);
  if (!isTrustedMutationRequest(request)) {
    return fail({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  try {
    const staff = await requireStaffIntentApi(request,'admin.invite');
    if (staff.role !== 'super_admin') return fail({ error: 'Only a Super Admin can invite staff.' }, 403);
    let body: {
      email?: unknown; role?: unknown; permissions?:unknown;requestId?: unknown; formVersion?: unknown; customAnswers?: unknown;
    };
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, 256 * 1024))); }
    catch (error) { if (error instanceof BodyTooLargeError) throw error;
      return fail({ error: 'Invalid invitation request.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId))
      return fail({ error: 'A valid invitation request reference is required.' }, 400);
    reference={requestId:body.requestId,actorId:staff.id};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role;
    if (!emailPattern.test(email) || email.length > 254) {
      return fail({ error: 'Enter a valid staff email address.' }, 400);
    }
    if (role !== 'admin' && role !== 'super_admin') {
      return fail({ error: 'Select a valid staff role.' }, 400);
    }
    let permissions;
    try{permissions=role==='admin'?validateAdminPermissions(body.permissions):[];}
    catch{return fail({error:'Select the exact work access for this invitation.'},400);}

    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const configured = await validateSellerFormSubmission(db, 'staff.staff-invitation',
      body.formVersion, body.customAnswers, body.requestId);
    validatedVersionId = configured.versionId;
    writeStarted=true;
    const invitation = await createStaffInvitation(
      db,
      {
        email,
        role: role as StaffRole,
        permissions,
        invitedBy: staff.id,
        actorAuthSubject: staff.authSubject,
        now: Date.now(),
        requestId: body.requestId,
        form: { requestId: body.requestId, versionId: configured.versionId, answers: configured.answers },
      },
    );
    const outcome=await readStaffInvitationOutcome(db,{actorId:staff.id,actorAuthSubject:staff.authSubject,requestId:body.requestId,now:Date.now()});
    if(!outcome)return fail({recorded:false,code:'outcome_unconfirmed',error:'Check the original invitation outcome before trying again.'},503);
    let emailAttempted=false,emailFailed=false;
    if(!invitation.duplicate&&outcome.status==='pending')try {
      emailAttempted=true;
      await sendStaffInvitationEmail({
        email,
        role: role as StaffRole,
        expiresAt: invitation.expiresAt,
      });
    } catch {emailFailed=true;}
    const confirmed=await requireStaffIntentApi(request,'admin.invite',staff.id);
    if(confirmed.authSubject!==staff.authSubject)throw new StaffAuthorizationError('Refresh the current staff workspace.',403);
    const current=await readStaffInvitationOutcome(db,{actorId:staff.id,actorAuthSubject:staff.authSubject,requestId:body.requestId,now:Date.now()});
    if(!current)return fail({recorded:false,code:'outcome_unconfirmed',error:'Check the original invitation outcome before trying again.'},503);
    return json(
      {
        ...invitation,
        ...reference,recorded:true,status:current.status,phase:'recorded',
        message:invitation.duplicate?'Invitation already created for this request.':emailFailed?
          'Access invitation created, but its email could not be confirmed. Check the email settings.':
          'Access invitation created. Check the recipient mailbox or local mail capture.',
        // This legacy sender returns void; resolution is not provider acceptance proof.
        emailDelivered:false,emailAttempted,
      },
      invitation.duplicate?200:201,
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError)return fail({error:error.message},error.status);
    if(error instanceof StaffInvitationAccessError)return fail({error:error.message},403);
    let stale=false;
    try{stale=Boolean(validatedVersionId&&await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),'staff.staff-invitation',validatedVersionId));}
    catch{/* Unavailable diagnostics cannot prove an uncommitted outcome. */}
    if (stale)
      return fail({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof FormRuntimeError) return fail({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return fail({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof BodyTooLargeError) return fail({ error: error.message }, 413);
    if (error instanceof SyntaxError) return fail({ error: 'Invalid invitation request.' }, 400);
    if (error instanceof StaffInvitationConflictError) {
      return fail({ error: error.message }, 409);
    }
    return fail({ error: 'The staff invitation outcome could not be confirmed.',code:'outcome_unconfirmed' },503);
  }
}
