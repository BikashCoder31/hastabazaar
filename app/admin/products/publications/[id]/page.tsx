import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getProductPublicationReview} from '@/lib/products/publication';
import {ProductPublicationReview} from '@/components/admin/product-publication-review';
import {ReviewBackLink} from '@/components/admin/review-back-link';
export const dynamic='force-dynamic';
export default async function ProductPublicationPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params,query=await searchParams,actor=await requireStaffPage('/admin/products/publications/'+encodeURIComponent(id)),initial=await getProductPublicationReview(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id);
 return <div className="space-y-6"><ReviewBackLink actorId={actor.id} returnTo={query?.returnTo} fallback="/admin/products/publications"/><header><p className="eyebrow">Product publication</p><h1 className="mt-2 font-heading text-3xl">Submitted and published facts</h1></header><ProductPublicationReview actorId={actor.id} key={`${actor.id}:${id}`} caseId={id} initial={initial}/></div>;
}
