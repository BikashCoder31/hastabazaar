import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  reviewRider,
  saveRiderPolicy,
  rejectRiderReport,
  reportSelect,
  type RiderReport,
  RiderError,
  setRiderOpenBoxEligibility,
} from '@/lib/riders/repository';
import { operateParcel, ParcelConflictError } from '@/lib/operations/parcels';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(request: Request) {
  let validatedVersionId: string | undefined;
  let validatedFormId: 'staff.rider-control-1' | 'staff.rider-control-2' | undefined;
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request))
    return reply({ error: 'Cross-site request rejected.' }, 403);
  try {
    const data = await readBoundedJsonObject(request) as Record<string, unknown>;
    const staff = await requireStaffApi(
      data.action === 'review' ||
        data.action === 'policy' ||
        data.action === 'open_box_eligibility'
        ? 'admin.invite'
        : 'order.manage',
    );
    if (staff.role !== 'super_admin') throw new StaffAuthorizationError('Super Admin access is required.', 403);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const text = (key: string) =>
      typeof data[key] === 'string' ? (data[key] as string) : '';
    const requestId=text('requestId');
    if (!requestId || requestId.length>100)
      return reply({error:'Request identifier is required.'},400);
    const formId=data.action==='policy'?'staff.rider-control-2':'staff.rider-control-1';
    const form=await validateSellerFormSubmission(db,formId,data.formVersion,
      data.customAnswers,requestId);
    validatedVersionId=form.versionId;
    validatedFormId=formId;
    const formOption={requestId,versionId:form.versionId,answers:form.answers};
    const now = Date.now();
    if (data.action === 'review')
      await reviewRider(db, {
        actorId: staff.id,
        userId: text('userId'),
        version: Number(data.version),
        status: text('status'),
        note: text('note'),
        now,
        requestId,form:formOption,
      });
    else if (data.action === 'policy')
      await saveRiderPolicy(db, {
        actorId: staff.id,
        version: Number(data.version),
        openBox: false,
        otpScope: text('otpScope'),
        now,
        requestId,form:formOption,
      });
    else if (data.action === 'open_box_eligibility')
      await setRiderOpenBoxEligibility(db, {
        actorId: staff.id,
        userId: text('userId'),
        version: Number(data.version),
        eligible: data.eligible === true,
        note: text('note'),
        now,
        requestId,form:formOption,
      });
    else if (data.action === 'reject')
      await rejectRiderReport(db, {
        actorId: staff.id,
        reportId: text('reportId'),
        note: text('note'),
        now,
        requestId,form:formOption,
      });
    else if (data.action === 'confirm') {
      const r = await db
        .prepare(reportSelect + ' WHERE r.id=?')
        .bind(text('reportId'))
        .first<RiderReport>();
      if (!r) throw new RiderError('Report not found.');
      await operateParcel(db, {
        jobId: r.jobId,
        actorId: staff.id,
        version: Number(data.version),
        requestId,
        riderReportId: r.id,
        action: r.kind === 'delivered' ? 'deliver' : 'fail',
        note: 'Staff reviewed rider evidence and reported COD amount.',
        now,
        form:{...formOption,formId:'staff.rider-control-1'},
      });
    } else return reply({ error: 'Choose a supported rider action.' }, 400);
    return reply({ ok: true });
  } catch (e) {
    if (e instanceof BodyTooLargeError) return Response.json({ error: e.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if(e instanceof StaffAuthorizationError)return reply({error:e.message},e.status);
    if(e instanceof RiderError || e instanceof ParcelConflictError)return reply({error:e.message},409);
    if(e instanceof FormRuntimeError)return reply({error:e.message,code:e.code},e.code==='stale_version'?409:503);
    if(e instanceof FormValidationError)return reply({error:e.message,fieldId:e.fieldId},400);
    if(validatedFormId && await isValidatedFormVersionStale(requireDatabase(env as unknown as {DB?:D1Database}),
      validatedFormId,validatedVersionId))return reply({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
    return reply({error:'Rider update could not be completed.'},400);
  }
}
