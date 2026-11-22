import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import {requireExistingStaffIntentApi,requireStaffIntentApi} from '@/lib/auth/staff-intent';
import {IncidentCommandAccessError,readIncidentCommandOutcome} from '@/lib/operations/incident-command-recovery';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import {
  validateSellerFormSubmission,
  isValidatedFormVersionStale,
  FormRequestConflictError,
} from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';
import {
  createIncident,
  executeIncidentCommand,
  importLegacyOperationalIncident,
  listIncidents,
  listLegacyIncidentMappings,
  IncidentConflict,
  IncidentBeforeWriteConflict,
  type NewIncident,
  type IncidentCommand,
} from '@/lib/operations/incident-review';
const headers = { 'cache-control': 'no-store' };
async function requireIncidentReader() {
  try {
    return await requireStaffApi('system.health.view');
  } catch (error) {
    if (!(error instanceof StaffAuthorizationError) || error.status !== 403)
      throw error;
    return requireStaffApi('system.incidents.manage');
  }
}
export const dynamic = 'force-dynamic';
async function confirmActor(request:Request,actor:{id:string;authSubject:string}){
  const current=await requireExistingStaffIntentApi(request,'system.incidents.manage');
  if(current.id!==actor.id||current.authSubject!==actor.authSubject)throw new StaffAuthorizationError('Refresh the current incident workspace.',403);
}
export async function GET(request?:Request) {
  try {
    const query=request?new URL(request.url).searchParams:null,
      recovering=!!query&&['requestId','action','sourceId'].some(key=>query.has(key)),
      actor = recovering?await requireExistingStaffIntentApi(request!,'system.incidents.manage'):await requireIncidentReader(),
      db = requireDatabase(env),
      now = Date.now(),
      scope = readEmailHealthRuntimeConfig(
        { ...env, NODE_ENV: process.env.NODE_ENV },
        now,
      );
    if (!scope.environment)
      return Response.json(
        { error: 'Current runtime scope is unavailable.' },
        { status: 503, headers },
      );
    if(recovering){
      const requestId=query!.get('requestId'),action=query!.get('action'),sourceId=query!.get('sourceId');
      if(!requestId||!/^[-a-zA-Z0-9_]{1,100}$/.test(requestId)||!action||!/^[a-z_]{1,40}$/.test(action)||!sourceId||sourceId.length>191)return Response.json({error:'Choose the exact original incident action.'},{status:400,headers});
      const outcome=await readIncidentCommandOutcome(db,{actorId:actor.id,actorAuthSubject:actor.authSubject,requestId,action,sourceId,environment:scope.environment,now});
      await confirmActor(request!,actor);
      return Response.json(outcome??{recorded:false,requestId,action,sourceId,code:'outcome_unconfirmed'},{status:outcome?200:404,headers});
    }
    const [incidents, legacy] = await Promise.all([
      listIncidents(db, actor.id, scope.environment, now),
      listLegacyIncidentMappings(db, actor.id),
    ]);
    return Response.json(
      { environment: scope.environment, incidents, legacy },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
type CommandReference={actorId:string;requestId:string;action:string;sourceId:string};
function failure(error: unknown,reference?:CommandReference,code?:'form_review_required') {
  const known =
    error instanceof IncidentConflict ||
    error instanceof FormRequestConflictError ||
    error instanceof FormRuntimeError ||
    error instanceof FormValidationError;
  return Response.json(
    {
      ...(reference?{...reference,phase:'before_write'}:{}),
      ...(code?{code}:{}),
      error:
        error instanceof StaffAuthorizationError || error instanceof IncidentCommandAccessError || known
          ? error.message
          : 'Incident operation is unavailable. Entered information has not been cleared.',
    },
    {
      status:
        error instanceof StaffAuthorizationError
          ? error.status
          : error instanceof IncidentCommandAccessError
            ? 403
          : error instanceof BodyTooLargeError
            ? 413
            : known
              ? 409
              : 503,
      headers,
    },
  );
}
export async function POST(request: Request) {
  let validatedDb: D1Database | undefined,
    validatedVersionId: string | undefined,
    commandReference: CommandReference | undefined,
    commandActor: {id:string;authSubject:string} | undefined;
  let validatingForm=false;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403, headers },
    );
  try {
    const actor = await requireStaffIntentApi(request,'system.incidents.manage');
    commandActor=actor;
    const body = await readBoundedJsonObject(request),
      db = requireDatabase(env),
      now = Date.now(),
      scope = readEmailHealthRuntimeConfig(
        { ...env, NODE_ENV: process.env.NODE_ENV },
        now,
      );
    if (!scope.environment)
      throw new IncidentConflict('Current runtime scope is unavailable.');
    const allowed = [
      'action',
      'incidentId',
      'expectedRevision',
      'ownerId',
      'backupId',
      'impactClass',
      'impactSummary',
      'severity',
      'title',
      'serviceKey',
      'failureSignature',
      'releaseReference',
      'configurationReference',
      'plan',
      'nextAction',
      'nextUpdateAt',
      'resolutionCause',
      'reason',
      'sourceType',
      'sourceId',
      'targetIncidentId',
      'legacyId',
      'expectedLegacyUpdatedAt',
      'requestId',
      'formVersion',
      'customAnswers',
    ];
    if (
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      typeof body.action !== 'string' ||
      typeof body.requestId !== 'string' ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(body.requestId) ||
      (body.expectedRevision !== null &&
        typeof body.expectedRevision !== 'string')
    )
      throw new IncidentConflict(
        'Use the current registered incident controls and request version.',
      );
    commandReference={actorId:actor.id,requestId:body.requestId,action:body.action,sourceId:body.action==='create'?'new':String(body.action==='legacy_map'?body.legacyId:body.incidentId)};
    validatingForm=true;
    const configured = await validateSellerFormSubmission(
      db,
      'staff.incident-review',
      body.formVersion,
      body.customAnswers,
      body.requestId,
    );
    validatingForm=false;
    validatedDb = db;
    validatedVersionId = configured.versionId;
    const context = {
      actorId: actor.id,
      actorAuthSubject: actor.authSubject,
      requestId: body.requestId,
      expectedRevision: body.expectedRevision as string | null,
      environment: scope.environment,
      now,
    };
    const form = (id: string) => [
      buildFormAnswerInsert(db, {
        formId: 'staff.incident-review',
        requestId: context.requestId,
        versionId: configured.versionId,
        subjectType: 'system_incident',
        subjectId: id,
        actorId: actor.id,
        answers: configured.answers,
        now,
      }),
    ];
    let result;
    if (body.action === 'create' || body.action === 'legacy_map') {
      const input = {
        environment: scope.environment,
        serviceKey: body.serviceKey,
        title: body.title,
        impactSummary: body.impactSummary,
        impactClass: body.impactClass,
        severity: body.severity,
        failureSignature: body.failureSignature,
        ...(body.releaseReference
          ? { releaseReference: body.releaseReference }
          : {}),
        ...(body.configurationReference
          ? { configurationReference: body.configurationReference }
          : {}),
      } as NewIncident;
      result =
        body.action === 'create'
          ? await createIncident(db, context, input, form)
          : await importLegacyOperationalIncident(
              db,
              context,
              {
                ...input,
                legacyId: body.legacyId as string,
                expectedLegacyUpdatedAt: body.expectedLegacyUpdatedAt as number,
                ...(body.targetIncidentId
                  ? { targetIncidentId: body.targetIncidentId as string }
                  : {}),
              },
              form,
            );
    } else {
      const input: Record<string, unknown> = {
        incidentId: body.incidentId,
        action: body.action,
        reason: body.reason,
      };
      for (const key of [
        'ownerId',
        'backupId',
        'plan',
        'nextAction',
        'nextUpdateAt',
        'severity',
        'impactClass',
        'impactSummary',
        'sourceType',
        'sourceId',
        'targetIncidentId',
      ])
        if (Object.hasOwn(body, key)) input[key] = body[key];
      if (Object.hasOwn(body, 'resolutionCause'))
        input.cause = body.resolutionCause;
      result = await executeIncidentCommand(
        db,
        context,
        input as unknown as IncidentCommand,
        form(String(body.incidentId)),
      );
    }
    const outcome=await readIncidentCommandOutcome(db,{actorId:actor.id,actorAuthSubject:actor.authSubject,requestId:body.requestId,action:body.action,
      sourceId:body.action==='create'?'new':String(body.action==='legacy_map'?body.legacyId:body.incidentId),environment:scope.environment,now});
    await confirmActor(request,actor);
    if(!outcome||outcome.incidentId!==result.incidentId)throw Error('The original incident outcome could not be confirmed.');
    return Response.json(
      { ...outcome, environment: scope.environment,...('eventId' in result&&typeof result.eventId==='string'?{eventId:result.eventId}:{}) },
      { headers },
    );
  } catch (error) {
    let response:Response;
    try{
    // Only typed validation/publication rejections before entering the domain
    // operation prove this request performed no Incident business write.
    // Configuration read/SQL failures and every ambiguous commit remain unknown.
    if(validatingForm&&((error instanceof FormRuntimeError&&error.code==='stale_version')||error instanceof FormValidationError||error instanceof FormRequestConflictError))
      response=failure(error,commandReference,'form_review_required');
    else if (
      validatedDb &&
      (await isValidatedFormVersionStale(
        validatedDb,
        'staff.incident-review',
        validatedVersionId,
      ))
    )
      response=failure(
        new FormRequestConflictError(
          'The incident form changed. Refresh its fields and retry; entered information is retained.',
        ),
        error instanceof IncidentBeforeWriteConflict?commandReference:undefined,
        error instanceof IncidentBeforeWriteConflict?'form_review_required':undefined,
      );
    else response=failure(error,error instanceof IncidentBeforeWriteConflict?commandReference:undefined);
    }catch{response=failure(new Error('The current Incident failure could not be confirmed.'));}
    // Reconfirm after every failure-path read as well as the attempted operation.
    // Current denial curtains private evidence; it never attests no business write.
    if(commandActor){
      try{await confirmActor(request,commandActor);}catch(accessError){return failure(accessError);}
    }
    return response;
  }
}
