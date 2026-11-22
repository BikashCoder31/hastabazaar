import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import NewProductPage from '@/app/seller/products/new/page';
import Link from 'next/link';
import {getOwnerProductIntakeCase} from '@/lib/products/intake-history';
import {getProductWorkspace} from '@/lib/products/intake-workspace';
import {ProductIntakePreview} from '@/components/seller/product-intake-preview';
import {ProductIntakeQuestionSummary} from '@/components/seller/product-intake-questions';
export const dynamic='force-dynamic';
export default async function ProductAssistancePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{offer?:string}>}){
 const {id}=await params,owner=await requireSellerCenterPage('/seller/products/intakes/'+encodeURIComponent(id)),db=requireDatabase(env as unknown as {DB?:D1Database});
 const work=await db.prepare('SELECT c.draft_id AS draftId FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=? AND d.owner_id=?').bind(id,owner.userId).first<{draftId:string}>();
 if(!work)notFound();
 const latest=await db.prepare('SELECT id FROM product_intake_cases WHERE draft_id=? ORDER BY cycle_number DESC LIMIT 1').bind(work.draftId).first<{id:string}>();
 if(latest?.id!==id){
  const history=await getOwnerProductIntakeCase(db,owner.userId,id),current=await getProductWorkspace(db,owner.userId,work.draftId);
  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8"><h1 className="text-2xl font-semibold">Product review history</h1><p>This closed case is read-only. It retains the exact version shared for review cycle {history.cycleNumber+1}.</p><Link className="inline-flex min-h-11 items-center rounded border px-4" href={'/seller/products/new?draftId='+encodeURIComponent(work.draftId)}>Open the current product workspace</Link><ProductIntakePreview snapshot={history.snapshot} offer={history.snapshot.offers.offers.find(offer=>offer.included)} uploads={current.uploads}/><ProductIntakeQuestionSummary context={history.snapshot.formContext}/><details className="rounded border p-4"><summary className="cursor-pointer font-medium">All submitted details</summary><dl className="mt-4 space-y-3">{Object.entries(history.snapshot.answers).map(([field,value])=><div key={field}><dt className="text-sm font-medium">{field}</dt><dd className="whitespace-pre-wrap break-words text-sm">{Array.isArray(value)?value.join(', '):value}</dd></div>)}</dl></details></main>;
 }
 return <NewProductPage searchParams={Promise.resolve({draftId:work.draftId,offer:(await searchParams).offer})}/>;
}
