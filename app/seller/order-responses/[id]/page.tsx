import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireDatabase} from '@/lib/db/d1';
import {readPreparationWorkspace} from '@/lib/orders/response-workspace';
import {OrderPreparationWorkspace} from '@/components/commerce/order-preparation-workspace';
export const dynamic='force-dynamic';
export default async function PreparationPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,viewer=await requireSellerCenterPage(`/seller/order-responses/${id}`);if(!viewer)notFound();
 const workspace=await readPreparationWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),viewer.userId,id,'seller',{actorAuthSubject:viewer.authSubject});if(!workspace)notFound();
 return <div className="mx-auto max-w-3xl space-y-4 text-[#14213D]"><Link className="section-link min-h-11" href={`/seller/orders/${encodeURIComponent(workspace.orderId)}`}>Back to order</Link><OrderPreparationWorkspace workspace={workspace}/></div>;
}
