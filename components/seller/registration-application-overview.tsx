import Link from 'next/link';
import { ArrowRight, Check, Clock3, Package, Plus, TriangleAlert, Upload } from 'lucide-react';
import { WhoseTurn } from '@/components/ui/whose-turn';
import type { SellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { detailText, type ProductDetailAnswers } from '@/lib/products/category-fields';
import { assertSellerWorkspaceViewer } from '@/lib/seller/workspace-tasks';
import { sellerDocumentWorkspace, type SellerDocumentWorkspace } from '@/lib/sellers/document-workspace';
import { sellerDocumentsForApplication } from '@/lib/sellers/application';
import { getSellerReadiness } from '@/lib/sellers/readiness';
import { hasVerifiedRegistrationEmail, savedSellerRegistrationEmail } from '@/lib/sellers/registration-email';
import { optionalRegistrationInput } from '@/lib/sellers/registration-intake';
import { readRegistration, type RegistrationRecord } from '@/lib/sellers/registration-store';
import { getSellerOnboardingChecklist } from '@/lib/sellers/onboarding-checklist';

const card = 'min-w-0 rounded-[18px] border border-[#E4DACA] bg-white';
const action = 'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2';
const primary = action + ' bg-[#14213D] text-white hover:bg-[#24395D]';
const outline = action + ' border border-[#D7C7AD] bg-white text-[#14213D] hover:bg-[#FCF9F4]';
const supportHref = '/contact-us#contact-form-heading';
const date = new Intl.DateTimeFormat('en-NP', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });

type Step = {
  name: string; detail: string; state: 'done' | 'yours' | 'review' | 'later';
  href?: string; label?: string;
};

function readCurrentReadiness(db: D1Database, sellerId: string) {
  return getSellerReadiness(db, sellerId, Date.now()).catch(() => null);
}

async function readDrafts(db: D1Database, owner: string, sellerId: string) {
  const rows = (await db.prepare(`SELECT d.id, d.answers_json AS answers, NULL AS legacyName, d.updated_at AS updatedAt, 0 AS legacy
    FROM product_intake_drafts d
    LEFT JOIN product_intake_cases c ON c.id=(SELECT recent.id FROM product_intake_cases recent
      WHERE recent.draft_id=d.id ORDER BY recent.cycle_number DESC LIMIT 1)
    WHERE d.owner_id=? AND d.seller_id=? AND (c.id IS NULL OR c.first_complete_at IS NULL OR c.state='waiting_seller')
      AND NOT EXISTS(SELECT 1 FROM product_publication_links l WHERE l.draft_id=d.id)
    UNION ALL
    SELECT p.id, NULL, p.name_en, p.updated_at, 1
    FROM products p WHERE p.seller_id=? AND p.status IN ('draft','needs_changes')
      AND NOT EXISTS(SELECT 1 FROM product_deletions x WHERE x.product_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM product_publication_links l WHERE l.product_id=p.id)
    ORDER BY updatedAt DESC,id DESC LIMIT 4`)
    .bind(owner, sellerId, sellerId).all<{ id: string; answers: string | null; legacyName: string | null; legacy: number }>()).results;
  return rows.map(row => ({
    id: row.id,
    name: row.legacyName || (row.answers ? detailText(JSON.parse(row.answers) as ProductDetailAnswers, 'nameEn') : '') || 'Untitled product',
    href: row.legacy
      ? '/sell/application/products/' + encodeURIComponent(row.id) + '/edit'
      : '/seller/products/new?draftId=' + encodeURIComponent(row.id),
  }));
}

function ApplicationSteps({ steps }: { steps: readonly Step[] }) {
  const done = steps.filter(step => step.state === 'done').length;
  return <section className={card} aria-labelledby="application-steps-title">
    <div className="space-y-4 p-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <h2 id="application-steps-title" className="font-semibold">Getting your shop live</h2>
        <span className="text-sm text-[#465573]">{done} of {steps.length} done</span>
      </div>
      <progress aria-label="Shop setup progress" value={done} max={steps.length}
        className="block h-2 w-full appearance-none overflow-hidden rounded-full bg-[#EBE2CF] [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[#236548] [&::-webkit-progress-bar]:bg-[#EBE2CF] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#236548]" />
    </div>
    <ol className="divide-y divide-[#E4DACA]">
      {steps.map(({ name, detail, state, href, label }, index) => (
        <li key={name} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:px-5">
          <span aria-hidden="true" className={`grid size-8 place-items-center rounded-full text-sm font-semibold ${state === 'done' ? 'bg-[#236548] text-white' : state === 'yours' ? 'bg-[#14213D] text-white' : state === 'review' ? 'bg-[#E3E9F4] text-[#264880]' : 'bg-[#EBE2CF] text-[#465573]'}`}>
            {state === 'done' ? <Check className="size-4" /> : index + 1}
          </span>
          <div className="min-w-0 py-0.5">
            <h3 className="text-sm font-semibold">{name}{state === 'done' ? <span className="sr-only">, done</span> : null}</h3>
            <p className="mt-1 break-words text-sm leading-snug text-[#465573]">{detail}</p>
          </div>
          {state !== 'done' ? <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
            {state === 'later' ? <span className="inline-flex rounded-full bg-[#EBE2CF] px-2.5 py-1 text-xs font-semibold text-[#465573]">Later</span>
              : <WhoseTurn status={state === 'yours' ? 'your-turn' : 'with-hastabazaar'} />}
            {href && label ? <Link href={href} className={(state === 'yours' ? primary : outline) + ' max-sm:flex-1'}>{label}</Link> : null}
          </div> : null}
        </li>
      ))}
    </ol>
  </section>;
}

export async function SellerRegistrationApplicationOverview({ db, viewer, record, documents }: {
  db: D1Database; viewer: SellerCenterAccess;
  record?: RegistrationRecord | null; documents?: SellerDocumentWorkspace | null;
}) {
  const sellerId = viewer.sellerId;
  if (!sellerId) return <div className="space-y-5 text-[#14213D]">
    <h1 className="font-heading text-3xl sm:text-4xl">Your application</h1>
    <section className={card + ' space-y-3 p-5'}>
      <h2 className="font-heading text-2xl">Start with what you know</h2>
      <p className="max-w-2xl text-[#465573]">Save the details you have. Once you send your application, you can prepare private product drafts while Hastabazaar reviews it.</p>
      <Link href="/sell/apply" className={primary}>Continue registration <ArrowRight className="size-4" aria-hidden="true" /></Link>
    </section>
  </div>;

  const [profile, saved, evidence, readiness, drafts] = await Promise.all([
    db.prepare(`SELECT s.status,s.application_reference AS reference,s.created_at AS createdAt,s.tax_mode AS taxMode,
      p.participation_route AS route,p.application_stage AS stage,
      coalesce(p.managed_agreement_accepted_at,s.seller_agreement_accepted_at) AS acceptedAt,
      (SELECT a.reason FROM audit_logs a WHERE a.subject_type='seller' AND a.subject_id=s.id
        AND a.action='seller.application.changes_requested' AND a.request_id=s.review_request_id
        ORDER BY a.created_at DESC LIMIT 1) AS requestReason
      FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id
      WHERE s.id=? AND s.user_id=?`).bind(sellerId, viewer.userId).first<{
        status: string; stage: string | null; reference: string | null; createdAt: number;
        route: 'registered_seller' | 'managed_maker' | null; taxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
        acceptedAt: number | null; requestReason: string | null;
      }>(),
    record === undefined ? readRegistration(db, viewer.userId) : record,
    documents === undefined ? sellerDocumentWorkspace(db, sellerId, viewer.userId, 'seller') : documents,
    readCurrentReadiness(db, sellerId),
    readDrafts(db, viewer.userId, sellerId),
  ]);
  if (!profile) return null;
  const email = savedSellerRegistrationEmail(saved?.answers) ?? viewer.email;
  const [verified, milestones] = await Promise.all([
    hasVerifiedRegistrationEmail(db, viewer, email, savedSellerRegistrationEmail(saved?.answers)),
    getSellerOnboardingChecklist(db, { sellerId, ownerId: viewer.userId, readiness, stage: profile.stage ?? profile.status, viewer: { kind: 'seller' } }),
  ]);
  await assertSellerWorkspaceViewer(db, viewer.userId, sellerId, viewer.authSubject);

  const status = profile.stage ?? profile.status;
  const managed = profile.route === 'managed_maker';
  const closed = ['rejected', 'suspended'].includes(status);
  const approved = ['approved_for_activation', 'active', 'approved'].includes(status);
  const submitted = status !== 'draft';
  const routeName = managed ? 'Sell through Hastabazaar' : 'Registered business seller';
  const agreementName = managed ? 'Managed Supplier/Maker Agreement' : 'Seller Marketplace Agreement';
  const correction = evidence?.documents.find(item => Boolean(item.currentSubmission) && item.reviewAction === 'seller.document.correction_requested');
  const applicationChanges = status === 'changes_requested' || profile.status === 'needs_changes';
  const waitingOnSeller = !closed && (Boolean(correction) || applicationChanges);
  const documentHref = correction ? '/seller/registration#document-' + encodeURIComponent(correction.id) : '/seller/registration#registration-documents';
  const requestTitle = correction?.kind === 'pan_certificate' ? 'Hastabazaar asked for a clearer PAN certificate'
    : correction ? 'Hastabazaar asked for a replacement document' : 'Hastabazaar asked for changes to your application';
  const requestReason = correction?.reviewReason ?? (applicationChanges ? profile.requestReason : null);
  const required = sellerDocumentsForApplication(saved
    ? optionalRegistrationInput(saved.answers, viewer.email)
    : { participationRoute: profile.route ?? undefined, applicantType: 'individual', taxMode: profile.taxMode })
    .filter(document => document.required && document.kind !== 'bank_verification');
  const current = (kind: string) => evidence?.documents.find(item => item.kind === kind && Boolean(item.currentSubmission));
  const verifiedDocuments = required.every(({ kind }) => {
    const doc = current(kind);
    return doc?.status === 'verified' && Boolean(doc.currentEvidence);
  });
  const awaitingDocumentReview = required.every(({ kind }) => ['verified', 'pending'].includes(current(kind)?.status ?? ''));
  const canDraft = submitted && !closed;
  const productSent = milestones.steps.some(item => item.id === 'send' && item.status === 'Done');
  const live = Boolean(readiness?.publicProductCount);
  const steps: Step[] = [
    { name: 'Application sent', detail: submitted ? date.format(profile.createdAt) + ' · ' + routeName : 'Send your application to start the review.', state: submitted ? 'done' : 'yours', href: '/seller/registration', label: 'Continue' },
    { name: 'Seller updates email verified', detail: verified ? email : 'Confirm the email that will receive seller updates.', state: verified ? 'done' : 'yours', href: '/seller/registration', label: 'Verify email' },
    { name: 'Agreement accepted', detail: agreementName + (saved?.answers.applicationAcknowledgement?.[0] === 'yes' ? ' · Prohibited & Restricted Products Policy' : ''),
      state: profile.acceptedAt ? 'done' : 'yours', href: '/seller/registration', label: 'Review agreement' },
    { name: managed ? 'Identity and tax documents' : 'Business registration & PAN certificate',
      detail: correction ? 'Hastabazaar asked for a replacement.' : verifiedDocuments ? 'The required documents are verified.'
        : awaitingDocumentReview ? 'Your files are with Hastabazaar for verification.' : 'Add your documents so Hastabazaar can finish checking your application.',
      state: correction ? 'yours' : verifiedDocuments ? 'done' : awaitingDocumentReview ? 'review' : 'yours',
      href: verifiedDocuments || awaitingDocumentReview && !correction || closed ? undefined : documentHref,
      label: correction ? 'Upload new file' : 'Add document' },
    { name: 'Hastabazaar reviews your application',
      detail: approved ? 'Your application has been approved.' : closed ? 'Open the application history to see your recorded status.'
        : 'We review your application by hand and update your seller account when it’s done.',
      state: approved ? 'done' : closed ? 'later' : 'review', href: closed ? '/sell/application' : undefined, label: 'View history' },
    { name: 'Send your first product for review',
      detail: productSent ? 'A product was sent for review.' : drafts.length ? 'You have a private draft. Each product is reviewed before it goes live.'
        : 'Prepare a product with the details you have. Each product is reviewed before it goes live.',
      state: productSent ? 'done' : readiness?.submitProducts ? 'yours' : 'later',
      href: !approved || productSent ? undefined : drafts[0]?.href ?? '/seller/products/new', label: drafts.length ? 'Continue draft' : 'Add product' },
    { name: 'Shop goes live', detail: live ? 'Customers can find products from your shop.' : 'Customers can find your shop once the required checks and publication are complete.',
      state: live ? 'done' : 'later' },
    { name: 'Add your bank account',
      detail: readiness?.bankStatus === 'verified' ? 'Your current receiving details are verified.'
        : 'Add verified receiving details before your first payout.',
      state: readiness?.bankStatus === 'verified' ? 'done' : readiness?.bankStatus === 'pending' ? 'review' : 'later',
      href: closed ? undefined : '/seller/finance', label: readiness?.bankStatus === 'pending' ? 'View bank details' : 'Add bank account' },
  ];
  const StatusIcon = waitingOnSeller ? TriangleAlert : approved ? Check : Clock3;
  const statusTitle = waitingOnSeller ? 'One thing needs you' : approved ? 'Your application is approved'
    : closed ? 'Check your application status' : submitted ? 'Your application is with Hastabazaar' : 'Finish sending your application';

  return <div className="min-w-0 space-y-5 text-[#14213D]">
    <h1 className="font-heading text-3xl sm:text-4xl">Your application</h1>
    <section className={`flex flex-wrap items-center gap-4 rounded-[18px] p-5 sm:flex-nowrap sm:p-6 ${waitingOnSeller ? 'bg-[#14213D] text-white' : 'bg-[#E3E9F4] text-[#203B68]'}`}
      aria-label="Application status">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${waitingOnSeller ? 'bg-white/15' : 'bg-white/50'}`}><StatusIcon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <h2 className="text-lg font-semibold">{statusTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed opacity-90">
          {waitingOnSeller ? 'Open the request below to see what Hastabazaar needs.' : approved ? 'Check what remains before your shop goes live.'
            : closed ? 'Open the application history or contact the seller team for help.'
              : submitted ? 'We review every seller by hand. Meanwhile, you can add documents and prepare your first product.' : 'Take the next step when you’re ready.'}
        </p>
      </div>
      {profile.reference ? <p className="max-w-full break-words text-sm opacity-90">Reference {profile.reference}</p> : null}
    </section>
    {waitingOnSeller ? <section className="space-y-3 rounded-[16px] border-2 border-[#14213D] bg-white p-5" aria-label="Requested changes">
      <WhoseTurn status="your-turn" />
      <h2 className="text-lg font-semibold">{requestTitle}</h2>
      {requestReason ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#465573]">{requestReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Link href={documentHref} className={primary}><Upload className="size-4 shrink-0" aria-hidden="true" /> {correction ? 'Upload a new file' : 'Upload a document'}</Link>
        <Link href={supportHref} className={outline}>Reply with a question</Link>
      </div>
    </section> : null}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
      <ApplicationSteps steps={steps} />
      <div className="min-w-0 space-y-4">
        <section className={card + ' space-y-3 p-5'} aria-label="Your product drafts">
          <h2 className="font-semibold">Your product drafts</h2>
          {drafts.length ? <ul className="space-y-3">
            {drafts.slice(0, 3).map(draft => <li key={draft.id} className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#F3EEE3]"><Package className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0"><p className="break-words text-sm font-semibold">{draft.name}</p><p className="text-sm text-[#465573]">Private draft</p></div>
              </div>
              {canDraft ? <Link href={draft.href} className={outline + ' w-full'}>Continue draft<span className="sr-only">, {draft.name}</span></Link> : null}
            </li>)}
          </ul> : <p className="text-sm text-[#465573]">No product drafts yet.</p>}
          {drafts.length > 3 ? <Link href="/seller/products/intakes" className={outline + ' w-full'}>See saved product workspaces</Link> : null}
          {canDraft ? <Link href="/seller/products/new" className={action + ' w-full hover:bg-[#FCF9F4]'}><Plus className="size-4 shrink-0" aria-hidden="true" /> {drafts.length ? 'Start another product' : 'Start a product draft'}</Link> : null}
          <p className="text-sm leading-relaxed text-[#665B4D]">Products are reviewed before they go live. You can prepare them while your application is reviewed.</p>
        </section>
        <section className={card + ' space-y-2 p-5'} aria-label="Seller help">
          <h2 className="font-semibold">Need help?</h2>
          <p className="text-sm leading-relaxed text-[#465573]">Ask the seller team and include your application reference.</p>
          <div className="flex flex-wrap items-center gap-x-4">
            <Link href={supportHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#A8232E] underline">Ask a question</Link>
            <Link href="/seller/requests" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Requests &amp; help</Link>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
