import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Prepare product draft', robots: { index: false, follow: false } };

/** Applicants and approved owners use the same optional, owner-scoped editor. */
export default async function ApplicantProductDraftPage({searchParams}:{searchParams:Promise<{draftId?:string}>}) {
  const {draftId}=await searchParams;
  redirect('/seller/products/new'+(draftId?'?draftId='+encodeURIComponent(draftId):''));
}
