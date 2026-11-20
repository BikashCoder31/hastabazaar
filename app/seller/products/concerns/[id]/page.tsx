import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {getProductConcern} from '@/lib/products/priority-concerns';
import {ProductConcernCase} from '@/components/products/product-concern-case';
export const dynamic='force-dynamic';
export default async function ProductConcernPage({params}:{params:Promise<{id:string}>}){const {id}=await params,actor=await requireSellerCenterPage('/seller/products/concerns/'+encodeURIComponent(id)),initial=await getProductConcern(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,id);if(initial.staff!==false)notFound();return <main className="mx-auto max-w-4xl p-4 sm:p-8"><ProductConcernCase key={initial.id} initial={initial} scope="seller"/></main>;}
