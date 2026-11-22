import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {notFound} from 'next/navigation';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {getPayoutFinanceWorkspace,type PayoutFinanceSelection} from '@/lib/payments/payout-workspace';
import {PayoutTransferError} from '@/lib/payments/payout-transfer-types';
import {PayoutTransferReview} from '@/components/admin/payout-transfer-review';
export const dynamic='force-dynamic';
export default async function PayoutFinancePage({searchParams}:{searchParams?:Promise<{model?:string;payout?:string;packet?:string;returnTo?:string}>}={}){
 const actor=await requireStaffPage('/admin/payments/payouts','payout.prepare');
 const bindings=env as unknown as {DB?:D1Database;HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string};
 const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
 const query=await searchParams??{},selection:PayoutFinanceSelection={model:query.model as PayoutFinanceSelection['model'],payoutId:query.payout,packetId:query.packet};
 let workspace:Awaited<ReturnType<typeof getPayoutFinanceWorkspace>>;
 try{workspace=await getPayoutFinanceWorkspace(requireDatabase(bindings),actor.id,environment,selection);}catch(error){if(error instanceof PayoutTransferError&&error.status===400)notFound();throw error;}
 if((query.payout!==undefined||query.packet!==undefined)&&!workspace.candidates.length&&!workspace.packets.length)notFound();
 return <PayoutTransferReview workspace={workspace} actorId={actor.id} returnTo={safeAdminReturnTo(query.returnTo)}/>;
}
