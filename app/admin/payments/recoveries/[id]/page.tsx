import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {SellerRecoveryReview} from '@/components/admin/seller-recovery-review';
export const dynamic='force-dynamic';
export default async function RecoveryCasePage({params}:{params:Promise<{id:string}>}){const {id}=await params,actor=await requireStaffPage('/admin/payments/recoveries/'+encodeURIComponent(id),'payout.prepare');return <SellerRecoveryReview actorId={actor.id} workspace={await getRecoveryFinanceWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id)}/>;}
