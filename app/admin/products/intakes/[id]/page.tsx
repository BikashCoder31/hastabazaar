import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {listActiveCategories} from '@/lib/db/repositories/products';
import {getProductIntakeReview} from '@/lib/products/intake-assistance';
import {ProductIntakeReview} from '@/components/admin/product-intake-review';
import {ReviewBackLink} from '@/components/admin/review-back-link';
export const dynamic='force-dynamic';
export default async function ProductIntakeReviewPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params,query=await searchParams,actor=await requireStaffPage('/admin/products/intakes/'+encodeURIComponent(id)),db=requireDatabase(env as unknown as {DB?:D1Database});
 const categories=await listActiveCategories(db),work=await getProductIntakeReview(db,actor.id,id);
 return <div className="space-y-6"><ReviewBackLink actorId={actor.id} returnTo={query?.returnTo} fallback="/admin/products/intakes"/><header><p className="eyebrow">Product assistance</p><h1 className="mt-2 font-heading text-3xl">Establish the actual product facts</h1></header><ProductIntakeReview key={`${actor.id}:${work.id}`} initial={work} category={work.categoryModel} categories={categories}/></div>;
}
