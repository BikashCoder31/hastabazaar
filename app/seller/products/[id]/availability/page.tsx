import {notFound} from 'next/navigation';
import {env} from 'cloudflare:workers';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {getProductAvailability} from '@/lib/products/availability';
import {ProductAvailabilityPanel} from '@/components/products/product-availability-panel';
export const dynamic='force-dynamic';
export default async function ProductAvailabilityPage({params}:{params:Promise<{id:string}>}){const {id}=await params,actor=await requireSellerCenterPage('/seller/products/'+encodeURIComponent(id)+'/availability'),initial=await getProductAvailability(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,id);if(!initial.owner)notFound();return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8"><h1 className="text-3xl font-semibold">Product availability</h1><ProductAvailabilityPanel productId={id} scope="seller" initial={initial}/></main>;}
