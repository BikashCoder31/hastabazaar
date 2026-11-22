import {env} from 'cloudflare:workers';
import {redirect,notFound} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryRepaymentView} from '@/lib/payments/recovery-repayments';
export const dynamic='force-dynamic';
export default async function RecoveryClaimPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireSellerCenterPage('/seller/finance/recoveries/claims/'+encodeURIComponent(id)),db=requireDatabase(env as unknown as {DB?:D1Database});
 const claim=await db.prepare('SELECT case_id AS caseId FROM seller_recovery_repayment_claims WHERE id=? AND submitted_by=?').bind(id,actor.userId).first<{caseId:string}>();if(!claim)notFound();
 await getRecoveryRepaymentView(db,actor.userId,claim.caseId);redirect('/seller/finance/recoveries/'+encodeURIComponent(claim.caseId));
}
