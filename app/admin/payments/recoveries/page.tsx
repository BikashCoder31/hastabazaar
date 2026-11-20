import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {SellerRecoveryReview} from '@/components/admin/seller-recovery-review';
export const dynamic='force-dynamic';
export default async function RecoveryQueuePage(){const actor=await requireStaffPage('/admin/payments/recoveries','payout.prepare');return <SellerRecoveryReview actorId={actor.id} workspace={await getRecoveryFinanceWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id)}/>;}
