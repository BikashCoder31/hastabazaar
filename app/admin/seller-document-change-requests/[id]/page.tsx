import { env } from 'cloudflare:workers';
import { notFound, redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { sellerDocumentWorkspace } from '@/lib/sellers/document-workspace';
import { DocumentReviewWorkspace } from '@/components/admin/document-review-workspace';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,staff=await requireStaffPage(`/admin/seller-document-change-requests/${id}`,'seller.application.review');
  if(staff.role!=='super_admin') redirect('/staff-access-denied');
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  const source=await db.prepare('SELECT seller_id AS sellerId FROM seller_document_change_requests WHERE id=?').bind(id).first<{sellerId:string}>();
  if(!source) notFound();
  const protectedCase=await db.prepare('SELECT kind FROM seller_protected_change_cases WHERE source_request_id=?').bind(id).first<{kind:string}>();
  if(protectedCase?.kind==='bank')redirect(`/admin/seller-protected-changes/${encodeURIComponent(id)}`);
  return <div className="space-y-5">{protectedCase?<Link className="section-link" href={`/admin/seller-protected-changes/${encodeURIComponent(id)}`}>Protected holds, readiness and payment disposition →</Link>:<p>This historical request needs protected-change reconciliation before another decision.</p>}
    <DocumentReviewWorkspace workspace={await sellerDocumentWorkspace(db,source.sellerId,staff.id,'staff')} sellerId={source.sellerId} requestId={id} viewerId={staff.id}/></div>;
}
