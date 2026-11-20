import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {detailText,type ProductDetailAnswers} from '@/lib/products/category-fields';
export const dynamic='force-dynamic';
export default async function ProductIntakesPage(){
 const owner=await requireSellerCenterPage('/seller/products/intakes'),db=requireDatabase(env as unknown as {DB?:D1Database});
 const drafts=(await db.prepare(`SELECT d.id,d.answers_json AS answers,d.updated_at AS updatedAt,c.state FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id AND s.user_id=d.owner_id LEFT JOIN product_intake_cases c ON c.draft_id=d.id AND c.cycle_number=(SELECT MAX(latest.cycle_number) FROM product_intake_cases latest WHERE latest.draft_id=d.id) WHERE d.owner_id=? ORDER BY d.updated_at DESC,d.id DESC LIMIT 100`).bind(owner.userId).all<{id:string;answers:string;updatedAt:number;state:string|null}>()).results;
 return <div className="space-y-6"><header><p className="eyebrow">Products</p><h1 className="mt-2 font-heading text-3xl">Saved product workspaces</h1><p className="mt-2 text-muted-foreground">Continue the same reference, including incomplete information and assistance requests.</p></header><Link href="/seller/products/new" className="inline-block rounded-lg bg-primary px-4 py-3 text-primary-foreground">Prepare another product</Link><div className="grid gap-4 md:grid-cols-2">{drafts.map(draft=><Link key={draft.id} href={'/seller/products/new?draftId='+encodeURIComponent(draft.id)} className="min-w-0 space-y-2 rounded-xl border bg-card p-5"><h2 className="break-words font-semibold">{detailText(JSON.parse(draft.answers) as ProductDetailAnswers,'nameEn')||'Product details not yet entered'}</h2><p className="text-sm">{draft.state?.replaceAll('_',' ')??'Private draft'}</p><p className="text-xs text-muted-foreground">Saved {new Date(draft.updatedAt).toLocaleString('en-NP')}</p></Link>)}</div>{drafts.length===0&&<p>No saved product workspace yet. You can start with an empty draft or an assistance request.</p>}</div>;
}
