import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readCommercialOutcome,CommercialOutcomeError,type CommercialOutcomeKind} from '@/lib/admin/commercial-outcome';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function GET(request:Request){try{
 const query=new URL(request.url).searchParams,kind=query.get('kind'),attempt=query.get('attempt');
 if(query.size!==2||query.getAll('kind').length!==1||query.getAll('attempt').length!==1||!['waiver','promo','loyalty','referral','common-fee','business-setting'].includes(kind??'')||!attempt)throw new CommercialOutcomeError('Use the exact original commercial action reference.',400);
 const actor=kind==='business-setting'?await requireStaffApi('business_settings.manage').catch(error=>{if(error instanceof StaffAuthorizationError&&error.status===403)return requireStaffApi('business_settings.approve');throw error;}):await requireStaffApi('commercial_policy.manage');if((kind!=='business-setting'&&actor.role!=='super_admin')||hasActorIntentMismatch(request,actor.id))throw new CommercialOutcomeError('Current original-actor source authority is required.');
 return json({outcome:await readCommercialOutcome(requireDatabase(env as unknown as {DB?:D1Database}),{id:actor.id,authSubject:actor.authSubject},kind as CommercialOutcomeKind,attempt)});
 }catch(error){if(error instanceof CommercialOutcomeError||error instanceof StaffAuthorizationError)return json({error:error.message},error.status);return json({error:'The original saved outcome is unavailable. Keep the original attempt; do not publish again.'},503);}}
