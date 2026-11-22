import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {inspectLegacyProduct} from '@/lib/products/legacy-workspace';
import {ProductLegacyStart} from '@/components/seller/product-legacy-start';
export const dynamic='force-dynamic';
export default async function ReviseProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,owner=await requireSellerCenterPage('/seller/products/'+encodeURIComponent(id)+'/edit'),source=await inspectLegacyProduct(requireDatabase(env as unknown as {DB?:D1Database}),owner.userId,id);
 if(source.existingDraftId)redirect('/seller/products/new?draftId='+encodeURIComponent(source.existingDraftId));
 return <ProductLegacyStart initial={source} actorId={owner.userId}/>;
}
