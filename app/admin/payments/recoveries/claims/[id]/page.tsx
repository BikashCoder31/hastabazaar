import {env} from 'cloudflare:workers';
import {redirect,notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
export const dynamic='force-dynamic';
export default async function RecoveryClaimPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireStaffPage('/admin/payments/recoveries/claims/'+encodeURIComponent(id),'payout.prepare'),db=requireDatabase(env as unknown as {DB?:D1Database});
 const claim=await db.prepare('SELECT case_id AS caseId FROM seller_recovery_repayment_claims WHERE id=?').bind(id).first<{caseId:string}>();if(!claim)notFound();
 await getRecoveryFinanceWorkspace(db,actor.id,claim.caseId);redirect('/admin/payments/recoveries/'+encodeURIComponent(claim.caseId));
}
