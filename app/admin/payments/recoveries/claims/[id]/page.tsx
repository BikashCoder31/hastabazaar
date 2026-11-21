import {env} from 'cloudflare:workers';
import {redirect,notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {withAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function RecoveryClaimPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params,actor=await requireStaffPage('/admin/payments/recoveries/claims/'+encodeURIComponent(id),['payout.prepare','refund.view']),db=requireDatabase(env as unknown as {DB?:D1Database});
 const claim=await db.prepare('SELECT case_id AS caseId FROM seller_recovery_repayment_claims WHERE id=?').bind(id).first<{caseId:string}>();if(!claim)notFound();
 await getRecoveryFinanceWorkspace(db,actor.id,claim.caseId);
 const query=await searchParams;
 const target='/admin/payments/recoveries/'+encodeURIComponent(claim.caseId);
 redirect(query?.returnTo===undefined?target:withAdminReturnTo(target,query.returnTo));
}
