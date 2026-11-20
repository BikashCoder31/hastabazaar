import {getCustomerUser} from '@/lib/auth/customer';
import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireDatabase} from '@/lib/db/d1';
import {readPreparationWorkspace} from '@/lib/orders/response-workspace';
import {OrderPreparationWorkspace} from '@/components/commerce/order-preparation-workspace';
export const dynamic='force-dynamic';
export default async function PreparationPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,viewer=await getCustomerUser();if(!viewer)notFound();
 const workspace=await readPreparationWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),viewer.userId,id,'customer',{actorAuthSubject:viewer.authSubject});if(!workspace)notFound();
 return <main className="mx-auto max-w-4xl space-y-5 p-6"><Link href={`/orders/${workspace.orderNumber}`}>Back to order</Link><OrderPreparationWorkspace workspace={workspace}/></main>;
}
