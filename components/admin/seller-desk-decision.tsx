import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import type { SellerDeskItem } from '@/lib/admin/seller-desk';
import { readPayoutRequestFinanceScope } from '@/lib/admin/finance-work-items';
import { requireDatabase } from '@/lib/db/d1';
import { getProductForReview, listActiveCategories } from '@/lib/db/repositories/products';
import { listPayoutCandidates, getPayoutDetail } from '@/lib/db/repositories/payouts';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { payoutRegistrationBlocker } from '@/lib/payments/payout-registration-readiness';
import { sellerPayoutRequestReadiness } from '@/lib/payments/payout-request-readiness';
import { getProductIntakeReview } from '@/lib/products/intake-assistance';
import { OfferError, productStaffPartyGuards, offerGuard } from '@/lib/products/offer-support';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { sellerDocumentWorkspace, type DocumentEvidence } from '@/lib/sellers/document-workspace';
import { registrationEvidenceKinds } from '@/lib/sellers/document-policy';
import { privateBankWorkspace } from '@/lib/sellers/bank-details';
import { SellerBankEvidence } from './seller-bank-evidence';
import { SellerBankReview } from './seller-bank-review';
import { protectedChangeWorkspace } from '@/lib/sellers/protected-change-workspace';
import { readApplicationDocumentProblems, readSellerPayoutFixes, sellerDocumentNeedsReplacementSql } from '@/lib/sellers/payout-fixes';
import { nativePayoutRow, payoutBoardGroups, payoutAmount } from '@/app/admin/payouts/workspace-data';
import { PayoutDetailPanel, readPayoutBankCheck, readPayoutLines, readUnallocatedPayoutLines } from '@/app/admin/payouts/workspace-detail';
import { SellerDocumentReview, DocumentChangeReview } from './seller-document-review';
import { sellerDocumentLabel } from './seller-document-label';
import { StaffReviewAccessBoundary } from './staff-review-access-boundary';
import { ProtectedChangeReviewWorkspace } from './protected-change-review-workspace';
import { ProductPublicationReview } from './product-publication-review';
import { ProductReviewActions } from './product-review-actions';
import { ProductIntakeReview } from './product-intake-review';
import { PayoutRequestActions } from './payout-request-actions';
import { ApprovePreparedPayoutButton } from './payout-actions';
import { DeskProfileCorrection } from './public-profile-review';
import { getPublicProfileWorkspace } from '@/lib/sellers/public-profile';
import { PayoutHoldButton } from './payout-hold-button';

const card='min-w-0 space-y-4 rounded-xl border border-[#E4DACA] bg-white p-4 md:p-5';
const fullLink='inline-flex min-h-11 items-center text-sm font-semibold underline';

function Evidence({document,label}:{document?:DocumentEvidence;label:string}) {
  return <section className="min-w-0 space-y-1 rounded-lg border p-3 text-sm"><h3 className="font-semibold">{label}</h3>
    {document?<><p className="break-words">{document.originalName}</p><p>{document.status}</p>
      <a className={fullLink} href={'/api/admin/seller-documents/'+encodeURIComponent(document.id)} target="_blank" rel="noreferrer">Open {label.toLowerCase()} file ↗</a></>:<p>No earlier version on file.</p>}
  </section>;
}

async function documentDecision(db:D1Database,item:SellerDeskItem,actorId:string) {
  const workspace=await sellerDocumentWorkspace(db,item.sellerId,actorId,'staff');
  const own=workspace.seller.userId===actorId;
  if(own)return <p>You cannot review your own seller evidence.</p>;
  const id=item.sourceId;
  const request=workspace.requests.find(row=>item.sourceType==='document_change'?row.id===id:row.replacementId===id);
  const selected=workspace.documents.find(row=>row.id===(item.sourceType==='document_change'?request?.replacementId??request?.documentId:id));
  if(!selected)return <p>This evidence is no longer available.</p>;
  const prior=workspace.documents.find(row=>row.id!==selected.id && (request?.documentId!==selected.id && request?.documentId
    ?row.id===request.documentId:row.kind===selected.kind && (row.uploadedAt<selected.uploadedAt||row.uploadedAt===selected.uploadedAt&&row.id<selected.id)));
  const [replacement,fixes]=await Promise.all([
    db.prepare('SELECT CASE WHEN '+sellerDocumentNeedsReplacementSql(db)+' THEN 1 ELSE 0 END AS needed FROM seller_documents d WHERE d.id=?').bind(selected.id).first<{needed:number}>(),
    readSellerPayoutFixes(db,item.sellerId),
  ]);
  const fix=fixes.find(row=>row.documentId===selected.id);
  const permission=!!request&&(request.status==='submitted'||request.status==='approved'&&!request.replacementId&&!workspace.permissions.some(p=>p.requestId===request.id));
  const bank=selected.kind==='bank_verification';
  const bankReview=bank&&fix&&!permission?await privateBankWorkspace(db,item.sellerId,actorId,'staff',new Date().getTime(),fix.protectedCaseId??undefined):null;
  const bankCanVerify=!!bankReview&&bankReview.change?.status==='open'&&bankReview.proposed?.documentId===selected.id&&fix?.waitingFor==='staff'&&!replacement?.needed;
  const decide=!!selected.currentSubmission&&selected.status==='pending'&&(registrationEvidenceKinds as readonly string[]).includes(selected.kind);
  return <StaffReviewAccessBoundary desk actorId={actorId} sourceId={item.id}><section className={card}><header><p className="text-sm">{item.kind}</p><h2 className="font-heading text-2xl">{sellerDocumentLabel(selected.kind)}</h2></header>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2"><Evidence label="Before" document={prior}/><Evidence label="Current" document={selected}/></div>
    <p className="text-sm">Check the file against the registered name, {workspace.seller.legalName}{workspace.seller.representativeName?' · Representative '+workspace.seller.representativeName:''}.</p>
    {(fix?.note||prior?.reviewReason)&&<p className="break-words text-sm">Previously requested · {fix?.note||prior?.reviewReason}</p>}
    {bankReview&&<SellerBankEvidence workspace={bankReview}/>}
    {bankCanVerify&&bankReview&&<SellerBankReview actorId={actorId} sellerId={item.sellerId} revision={bankReview.revision} changeRequestId={bankReview.change?.id} payoutFix/>}
    {permission&&request?<DocumentChangeReview desk actorId={actorId} requestId={request.id} expectedOperationId={request.operationId}/>:bank&&fix&&selected.currentSubmission&&selected.status==='pending'?
      <SellerDocumentReview desk bankProblemOnly actorId={actorId} sellerId={item.sellerId} documentId={selected.id} expectedReviewId={selected.reviewId} problemNote={fix.note}/>:decide?
      <SellerDocumentReview desk clearFix={fix?.waitingFor==='staff'} actorId={actorId} sellerId={item.sellerId} documentId={selected.id}
        expectedReviewId={selected.reviewId} needsReplacement={!!replacement?.needed} problemNote={fix?.note}/>:<p className="text-sm">{bank?'Bank evidence requires the beneficiary comparison and bank approval.':'Only the current pending evidence can be reviewed.'}</p>}
    <Link className={fullLink} href={bank?'/admin/sellers/'+encodeURIComponent(item.sellerId)+'#seller-bank':item.href}>Open full document review</Link>
  </section></StaffReviewAccessBoundary>;
}

async function payoutDecision(db:D1Database,item:SellerDeskItem,actorId:string) {
  const now=new Date().getTime();
  const authority=await staffMutationGuard(db,actorId,'payout.approve',Error,'super_admin');
  const independent=await db.prepare('SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?').bind(item.sellerId,actorId).first();
  if(!independent)return <p>An independent reviewer must decide this seller’s payout.</p>;
  const hold=<><PayoutHoldButton/><p className="text-sm">Leaving this payout pending keeps it in the queue. A separate hold with a seller note is unavailable for this payout.</p></>;
  if(item.sourceType==='payout_request'){
    const request=await readPayoutRequestFinanceScope(db,actorId,item.sourceId);
    if(!request||request.sellerId!==item.sellerId||request.status!=='submitted')return <p>The request is no longer available for your approval.</p>;
    const [candidates,readiness,bank,lines]=await Promise.all([listPayoutCandidates(db,now,item.sellerId),sellerPayoutRequestReadiness(db,item.sellerId,now),
      readPayoutBankCheck(db,item.sellerId,now),readUnallocatedPayoutLines(db,item.sellerId,now,'available')]);
    const row=payoutBoardGroups({requests:[request],candidates,payouts:[],held:[],now}).groups.ready[0];
    if(!row)return <p>This payout is no longer in the approval queue.</p>;
    const balanceChanged=lines.reduce((sum,line)=>sum+line.amountPaisa,0)!==row.amountPaisa;
    const reason=readiness.blocker??(bank?.pendingChange?'A bank change is pending.':!candidates.length?'There is no eligible available balance.':balanceChanged?'The eligible balance changed. Refresh the payout review.':null);
    return <PayoutDetailPanel row={row} bank={bank&&readiness.maskedBeneficiary?{...bank,title:readiness.maskedBeneficiary}:bank} request={request} lines={balanceChanged?[]:lines} blocked={!!reason} historyHref={item.href}
      actions={<>{reason?<p>{reason}</p>:<PayoutRequestActions desk actorId={actorId} role={authority.role} id={request.id} approvalAmount={payoutAmount(row.amountPaisa)}/>} {hold}</>}/>;
  }
  const payout=await getPayoutDetail(db,item.sourceId);
  if(!payout||payout.sellerId!==item.sellerId||!['scheduled','prepared'].includes(payout.status))return <p>This payout is no longer awaiting approval.</p>;
  const [bank,lines,blocker]=await Promise.all([readPayoutBankCheck(db,item.sellerId,now,payout.destinationReference),readPayoutLines(db,payout.id),payoutRegistrationBlocker(db,item.sellerId,'registered',now,payout.destinationReference)]);
  const reason=bank?.pendingChange?'A bank change is pending.':blocker;
  return <PayoutDetailPanel row={nativePayoutRow(payout)} bank={bank} lines={lines} payout={payout} blocked={!!reason} historyHref={item.href}
    actions={<>{reason?<p>{reason}</p>:<ApprovePreparedPayoutButton desk payoutId={payout.id} status={payout.status} isPreparer={payout.preparedBy===actorId} canApprove canProcess={false} amount={payoutAmount(payout.amountPaisa)}/>} {hold}</>}/>;
}

export async function SellerDeskDecision({item,actorId}:{item:SellerDeskItem;actorId:string}) {
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  switch(item.sourceType) {
    case 'product_intake_review': return <ProductPublicationReview desk key={item.id+actorId} caseId={item.sourceId} actorId={actorId}/>;
    case 'product_intake_help': {
      const [review,categories]=await Promise.all([getProductIntakeReview(db,actorId,item.sourceId),listActiveCategories(db)]);
      return <ProductIntakeReview desk initial={review} category={review.categoryModel} categories={categories} sellerName={item.sellerName}/>;
    }
    case 'product_review': {
      const product=await (async()=>{
        const authority=await staffMutationGuard(db,actorId,'product.review',Error,'super_admin');
        const parties=await productStaffPartyGuards(db,actorId,item.sourceId);
        const product=await getProductForReview(db,item.sourceId);
        if(!product||product.sellerId!==item.sellerId)return null;
        await db.batch([...authority.statements,...parties,...offerGuard(db,'EXISTS(SELECT 1 FROM products WHERE id=? AND seller_id=? AND updated_at=?)',[product.id,product.sellerId,product.updatedAt])]);
        return product;
      })().catch(error=>{if(error instanceof OfferError&&error.status===403)return null;throw error;});
      if(!product)return <p>This product is unavailable for independent review.</p>;
      const photo=product.media.find(file=>file.mimeType.startsWith('image/'));
        return <section className={card}><h2 className="font-heading text-2xl">{product.nameEn}</h2>
          {photo&&<Image src={'/api/product-media/'+encodeURIComponent(photo.id)} alt={product.nameEn} unoptimized width={160} height={160} className="size-24 object-contain"/>}
          <p className="text-sm">{[product.categoryName,formatPaisaExact(product.pricePaisa),product.countryOfOrigin].filter(Boolean).join(' · ')}</p><p className="whitespace-pre-line break-words text-sm">{product.descriptionEn}</p>
          <ProductReviewActions desk productId={product.id} status={product.status} canPublish/>
          <Link className={fullLink} href={item.href}>Open full moderation review</Link></section>;
    }
    case 'seller_document': case 'document_change': return documentDecision(db,item,actorId);
    case 'protected_change': {
      const workspace=await protectedChangeWorkspace(db,item.sourceId,actorId,'staff');
      if(workspace.bank?.proposed&&workspace.evidence.seller.userId!==actorId) {
        const bank=workspace.bank;
        const selected=workspace.evidence.documents.find(d=>d.id===bank.proposed?.documentId);
        const [fixes,problems]=await Promise.all([readSellerPayoutFixes(db,item.sellerId),readApplicationDocumentProblems(db,item.sellerId)]);
        const fix=fixes.find(row=>row.documentId===selected?.id);
        if(fix&&selected)return <StaffReviewAccessBoundary desk actorId={actorId} sourceId={item.id}><section className={card}>
          <SellerBankEvidence workspace={bank}/>
          <p className="text-sm">Previously requested · {fix.note}</p>
          {workspace.record.status==='open'&&fix.waitingFor==='staff'&&!problems.some(p=>p.documentId===selected.id)?
            <SellerBankReview actorId={actorId} sellerId={item.sellerId} revision={bank.revision} changeRequestId={workspace.record.id} payoutFix/>:<p>A current replacement is required before bank verification.</p>}
          {!!selected.currentSubmission&&selected.status==='pending'&&<SellerDocumentReview desk bankProblemOnly actorId={actorId} sellerId={item.sellerId} documentId={selected.id} expectedReviewId={selected.reviewId} problemNote={fix.note}/>}
          <Link className={fullLink} href={item.href}>Open full bank review</Link>
        </section></StaffReviewAccessBoundary>;
      }
      return <StaffReviewAccessBoundary actorId={actorId} sourceId={item.id} desk><ProtectedChangeReviewWorkspace workspace={workspace} actorId={actorId}/></StaffReviewAccessBoundary>;
    }
    case 'payout_candidate': case 'payout_request': return payoutDecision(db,item,actorId);
    case 'seller_application': {
      const work=await sellerDocumentWorkspace(db,item.sellerId,actorId,'staff');
      return <section className={card}><header><p className="text-sm">New application</p><h2 className="font-heading text-2xl">{item.sellerName}</h2></header>
        <h3 className="font-semibold">Submitted documents</h3>{work.documents.some(d=>d.currentSubmission)?<ul className="divide-y">{work.documents.filter(d=>d.currentSubmission).map(d=><li key={d.id} className="flex justify-between gap-2 py-2 text-sm"><span>{sellerDocumentLabel(d.kind)}</span><span>{d.status}</span></li>)}</ul>:<p>No documents submitted.</p>}
        <Link className="admin-decision" href={item.href}>Open full review</Link></section>;
    }
    case 'public_profile_correction': {
      const workspace=await getPublicProfileWorkspace(db,item.sellerId,actorId,'staff',new Date().getTime());
      return <DeskProfileCorrection actorId={actorId} sellerId={item.sellerId} workspace={workspace} correctionId={item.sourceId} canReview={workspace.ownerId!==actorId}/>;
    }
  }
}
