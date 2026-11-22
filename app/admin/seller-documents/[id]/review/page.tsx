import { env } from 'cloudflare:workers';
import { notFound, redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { sellerDocumentWorkspace } from '@/lib/sellers/document-workspace';
import { sellerDocumentNeedsReplacementSql } from '@/lib/sellers/payout-fixes';
import { DocumentReviewWorkspace } from '@/components/admin/document-review-workspace';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,staff=await requireStaffPage(`/admin/seller-documents/${id}/review`,'seller.application.review');
  if(staff.role!=='super_admin') redirect('/staff-access-denied');
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  const source=await db.prepare(`SELECT d.seller_id AS sellerId, CASE WHEN ${sellerDocumentNeedsReplacementSql(db)}
    THEN 1 ELSE 0 END AS needsReplacement FROM seller_documents d WHERE d.id=?`)
    .bind(id).first<{sellerId:string;needsReplacement:number}>();
  if(!source) notFound();
  const workspace=await sellerDocumentWorkspace(db,source.sellerId,staff.id,'staff');
  const linked=workspace.requests.find(request=>request.replacementId===id);
  return <DocumentReviewWorkspace workspace={workspace} sellerId={source.sellerId} documentId={id}
    requestId={linked?.id} viewerId={staff.id} needsReplacement={Boolean(source.needsReplacement)}/>;
}
