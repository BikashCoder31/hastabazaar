import {env} from 'cloudflare:workers';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {getSellerRecoveryStatement} from '@/lib/payments/recovery-workspace';
import {RecoveryStatement} from '@/components/seller/recovery-statement';
export const dynamic='force-dynamic';
export default async function RecoveryStatementPage({params}:{params:Promise<{id:string}>}){const {id}=await params,actor=await requireSellerCenterPage('/seller/finance/recoveries/'+encodeURIComponent(id));return <RecoveryStatement actorId={actor.userId} statement={await getSellerRecoveryStatement(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,id)}/>;}
