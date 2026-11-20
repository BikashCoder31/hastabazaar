import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {listProductConcerns} from '@/lib/products/priority-concerns';
import {ProductConcernReport} from '@/components/products/product-concern-report';
export const dynamic='force-dynamic';
export default async function ProductConcernPage({params}:{params:Promise<{id:string}>}){const {id}=await params,actor=await requireStaffPage('/admin/products/'+encodeURIComponent(id)+'/concerns','product.review'),initial=await listProductConcerns(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id);if(initial.staff!==true)notFound();return <main className="mx-auto max-w-4xl p-4 sm:p-8"><ProductConcernReport key={initial.productId} initial={initial} scope="admin"/></main>;}
