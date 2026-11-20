import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getProductConcern} from '@/lib/products/priority-concerns';
import {ProductConcernCase} from '@/components/products/product-concern-case';
import {ReviewBackLink} from '@/components/admin/review-back-link';
export const dynamic='force-dynamic';
export default async function ProductConcernPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){const {id}=await params,query=await searchParams,actor=await requireStaffPage('/admin/products/concerns/'+encodeURIComponent(id),'product.review'),initial=await getProductConcern(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id);if(initial.staff!==true)notFound();return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8"><ReviewBackLink actorId={actor.id} returnTo={query?.returnTo} fallback="/admin/products"/><ProductConcernCase key={`${actor.id}:${initial.id}`} initial={initial} scope="admin"/></main>;}
