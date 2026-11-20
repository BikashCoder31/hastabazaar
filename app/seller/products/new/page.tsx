import { env } from 'cloudflare:workers';

import { ProductIntakeWorkspace } from '@/components/seller/product-intake-workspace';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import Link from 'next/link';
import { getProductWorkspace } from '@/lib/products/intake-workspace';
import { getCategoryDetailGroups } from '@/lib/products/category-contracts';
import { requireDatabase } from '@/lib/db/d1';
import {
  listActiveCategories,
  listActiveOccasions,
} from '@/lib/db/repositories/products';
import { getProductMaterialSuggestions } from '@/lib/products/material-settings';

export const dynamic = 'force-dynamic';

export default async function NewProductPage({searchParams}:{searchParams:Promise<{draftId?:string;offer?:string}>}) {
  const owner=await requireSellerCenterPage('/seller/products/new');
  if(!owner.sellerId)return <div className="space-y-4"><h1 className="font-heading text-3xl">Start with the registration information you have</h1><p>Save your registration reference, even with incomplete information, then prepare this private product draft.</p><Link href="/seller/registration" className="section-link">Open registration</Link></div>;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params=await searchParams,initial=params.draftId?await getProductWorkspace(database,owner.userId,params.draftId):null;
  const [categories, occasions, materialSuggestions] = await Promise.all([
    listActiveCategories(database),
    listActiveOccasions(database),
    getProductMaterialSuggestions(database),
  ]);
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Private product workspace</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          {initial?'Continue your product':'Prepare a product'}
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
          Start with what you know. Save your progress, preview the customer view,
          or ask for help establishing the remaining details.
        </p>
      </div>
      <Link href="/seller/products/intakes" className="section-link">Saved product workspaces</Link>
      <ProductIntakeWorkspace actorId={owner.userId} key={owner.userId+':'+(initial?.id??'new')} categories={categories} occasions={occasions} materialSuggestions={materialSuggestions} initial={initial} initialOfferId={params.offer} initialCategoryModel={await getCategoryDetailGroups(database,initial?.categoryId??null)} />
    </div>
  );
}
