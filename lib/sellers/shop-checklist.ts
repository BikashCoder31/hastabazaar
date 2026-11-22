import { getSellerOnboardingChecklist, newSellerOnboardingChecklist, type SellerOnboardingChecklistModel } from './onboarding-checklist';
import { readSellerPayoutFixes, type SellerPayoutFix } from './payout-fixes';
import { getSellerReadiness, type SellerReadiness } from './readiness';
import {
  checklistDate, checklistDocumentLabels, checklistRequestTemplate, documentExpiryTemplate,
  readChecklistDocuments, type ChecklistDocument, type ChecklistNotice,
} from './shop-checklist-evidence';
import type { SellerDocumentKind } from './application';
import { accountedDeliveryAttemptsSql } from '../email/delivery-attempts';
import { sellerNeedsBusinessRegistrationSql, sellerNeedsPanSql } from './protected-change-policy';

type Status = 'ok' | 'missing' | 'wrong' | 'expiring' | 'waiting';
type Turn = 'seller' | 'staff' | null;
type Action = { label: string; href: string };
type Group = 'sell' | 'payouts' | 'shop';
type RequestAction = { label: string; note: string; remind: boolean; availableAt: number };
export type ChecklistItem = {
  id: string;
  label: string;
  status: Status;
  turn: Turn;
  detail: string;
  note: string | null;
  noteAt: number | null;
  message: Pick<ChecklistNotice, 'subject' | 'at' | 'emailStatus' | 'inAppSeen'> | null;
  sellerAction: Action | null;
  staffAction: Action | null;
  requestAction: RequestAction | null;
  expiry: number | null;
  openFix: boolean;
};
type GroupOf<T> = { id: Group; items: T[] };
export type SellerChecklist = {
  canSell: boolean | null;
  canPay: boolean | null;
  shopLive: boolean;
  payoutsUntil: number | null;
  missingShop: number;
  groups: GroupOf<ChecklistItem>[];
  onboarding: SellerOnboardingChecklistModel;
  bankStatus: SellerReadiness['bankStatus'] | null;
  payoutFixes: ChecklistItem[];
};

type Context = {
  ownerId: string;
  now: number;
  readiness?: SellerReadiness | null;
  onboarding?: SellerOnboardingChecklistModel | null;
  fixes?: readonly SellerPayoutFix[];
} & ({ audience: 'staff'; actorId: string } | { audience: 'seller' });
type Profile = {
  needsRegistration: number;
  needsPan: number;
  hasPhoto: number;
  hasDescription: number;
  pendingPhoto: number;
  pendingDescription: number;
  hasPickup: number;
  hasPhone: number;
};
type Item = Omit<ChecklistItem, 'staffAction' | 'sellerAction' | 'message' | 'requestAction' | 'note' | 'noteAt' | 'expiry' | 'openFix'> &
  Partial<ChecklistItem> & { ask?: string; sources?: string[] };

export const checklistReminderIntervalMs = 86_400_000;
const registration = '/seller/registration';
const bankLink = '/seller/finance#seller-bank-evidence';
const profileLink = '/seller/profile';
const profileItems = [
  ['photo', 'Profile photo', 'hasPhoto', 'Add a photo so customers can recognise your shop.', 'Add photo', profileLink],
  ['description', 'Shop description', 'hasDescription', 'Tell customers what you make.', 'Add description', profileLink],
  ['pickup_address', 'Pickup address', 'hasPickup', 'Add the address where couriers collect parcels.', 'Add address', profileLink + '#profile-contact-title'],
  ['pickup_phone', 'Pickup contact phone', 'hasPhone', 'Add a public shop phone Hastabazaar can use to contact you about pickup.', 'Add public shop phone', profileLink + '#profile-contact-title'],
] as const;

async function readProfile(db: D1Database, sellerId: string, ownerId: string) {
  const jsonValue = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  return db.prepare(`SELECT CASE WHEN ${sellerNeedsBusinessRegistrationSql('s')} THEN 1 ELSE 0 END AS needsRegistration,
    CASE WHEN ${sellerNeedsPanSql('s')} THEN 1 ELSE 0 END AS needsPan,
    EXISTS(SELECT 1 FROM seller_profile_media m JOIN seller_public_profile_revision_media link ON link.media_id=m.id
      WHERE m.seller_id=s.id AND link.revision_id=p.current_revision_id AND m.kind='profile_image' AND m.moderation_status<>'rejected') AS hasPhoto,
    CASE WHEN trim(COALESCE(p.about,s.business_description,''))<>'' THEN 1 ELSE 0 END AS hasDescription,
    EXISTS(SELECT 1 FROM seller_profile_media m JOIN seller_public_profile_revision_media link ON link.media_id=m.id
      WHERE m.seller_id=s.id AND link.revision_id=candidate.id AND m.kind='profile_image' AND m.moderation_status<>'rejected') AS pendingPhoto,
    CASE WHEN trim(COALESCE(${jsonValue}(candidate.values_json,'$.about'),''))<>'' THEN 1 ELSE 0 END AS pendingDescription,
    EXISTS(SELECT 1 FROM seller_operational_addresses a WHERE a.seller_id=s.id AND a.purpose='pickup'
      AND trim(a.locality)<>'' ) AS hasPickup,
    CASE WHEN trim(s.support_phone)<>'' THEN 1 ELSE 0 END AS hasPhone
    FROM seller_profiles s LEFT JOIN seller_public_profile_states p ON p.seller_id=s.id
    LEFT JOIN seller_public_profile_revisions candidate ON candidate.id=(
      SELECT r.id FROM seller_public_profile_revisions r WHERE r.seller_id=s.id AND r.owner_id=s.user_id
        AND r.status IN ('submitted','approved') ORDER BY r.sequence DESC LIMIT 1)
    WHERE s.id=? AND s.user_id=?`)
    .bind(sellerId, ownerId).first<Profile>();
}

async function readMessages(db: D1Database, sellerId: string, ownerId: string, now: number) {
  return (await db.prepare(`SELECT n.related_id AS relatedId,n.related_type AS relatedType,n.subject_en AS subject,n.body_en AS body,
    n.created_at AS at,n.template_key AS template,
    MAX(CASE WHEN n.channel='email' THEN CASE
      WHEN a.phase='accepted' THEN 'delivered'
      WHEN a.phase='captured' THEN 'captured'
      WHEN n.status='sent' THEN 'sent_record'
      WHEN n.status='cancelled' OR a.phase='cancelled' THEN 'expired'
      WHEN n.delivery_lease_until>? AND a.phase NOT IN ('accepted','captured') THEN 'waiting'
      WHEN n.status='failed' OR a.phase IN ('handoff_started','uncertain','not_accepted')
        OR NOT ${accountedDeliveryAttemptsSql('business','n.id','n.delivery_attempts')} THEN 'failed'
      ELSE 'waiting' END END) AS emailStatus,
    MAX(CASE WHEN n.channel='in_app' AND n.read_at IS NOT NULL THEN 1 ELSE 0 END) AS inAppSeen
    FROM notification_messages n LEFT JOIN email_delivery_attempts a ON n.channel='email' AND a.id=(
      SELECT attempt.id FROM email_delivery_attempts attempt WHERE attempt.queue_kind='business' AND attempt.queue_id=n.id
        ORDER BY attempt.attempt_number DESC LIMIT 1)
    WHERE n.recipient_user_id=? AND (n.audience_role='seller' OR
      (n.audience_role='customer' AND n.template_key IN ('business.seller_application.result','business.seller_application.submitted')))
      AND ((n.template_key IN (?,?) AND (
      n.related_id IN(SELECT id FROM seller_documents WHERE seller_id=?)
      OR SUBSTR(n.related_id,1,LENGTH(?))=?))
      OR (n.template_key='business.seller.document.review' AND n.related_id IN(SELECT id FROM seller_documents WHERE seller_id=?))
      OR (n.related_id=? AND n.template_key IN ('business.seller_application.result','business.seller_application.submitted','business.seller.restriction')))
    GROUP BY SUBSTR(n.request_id,1,LENGTH(n.request_id)-LENGTH(n.channel)),n.related_id,n.related_type,n.subject_en,n.body_en,n.created_at,n.template_key
    ORDER BY n.created_at DESC, n.subject_en LIMIT 150`)
    .bind(now, ownerId, checklistRequestTemplate, documentExpiryTemplate, sellerId, sellerId + ':', sellerId + ':', sellerId, sellerId)
    .all<ChecklistNotice>()).results;
}

export async function getSellerChecklist(db: D1Database, sellerId: string, context: Context): Promise<SellerChecklist> {
  const { ownerId, now } = context;
  const [readiness, profile, documents, fixes, notices] = await Promise.all([
    context.readiness === undefined ? getSellerReadiness(db, sellerId, now).catch(() => null) : context.readiness,
    readProfile(db, sellerId, ownerId),
    readChecklistDocuments(db, sellerId, now),
    context.fixes ?? readSellerPayoutFixes(db, sellerId),
    readMessages(db, sellerId, ownerId, now),
  ]);
  if (!profile) throw new Error('Seller checklist is unavailable for this account.');
  const onboarding = context.onboarding ?? await getSellerOnboardingChecklist(db, {
    sellerId, ownerId, stage: readiness?.stage ?? null, readiness,
    viewer: context.audience === 'seller' ? { kind: 'seller' } : { kind: 'admin', actorId: context.actorId },
  });
  return assembleChecklist({
    sellerId, now, readiness, onboarding, profile, documents, fixes, notices,
  });
}

export function emptySellerChecklist(): SellerChecklist {
  return assembleChecklist({
    sellerId: '', now: 0, readiness: null, onboarding: newSellerOnboardingChecklist(), profile: null,
    documents: [], fixes: [], notices: [],
  });
}

function assembleChecklist({ sellerId, now, readiness, onboarding, profile, documents, fixes, notices }: {
  sellerId: string; now: number; readiness: SellerReadiness | null; onboarding: SellerOnboardingChecklistModel;
  profile: Profile | null; documents: ChecklistDocument[]; fixes: readonly SellerPayoutFix[]; notices: ChecklistNotice[];
}): SellerChecklist {
  const checks = new Map(readiness?.checks.map(check => [check.id, check]));
  const application = onboarding.steps.find(step => step.id === 'application');
  const orders = onboarding.steps.find(step => step.id === 'orders');
  const approved = application?.status === 'Done';
  const applicationBySeller = application?.action?.actor === 'seller' || onboarding.steps[0]?.status !== 'Done';
  const canSell = readiness?.newOrders ?? (profile ? null : false);
  const canPay = readiness?.payouts ?? (profile ? null : false);
  const box = ({ ask, sources, ...item }: Item): ChecklistItem => {
    const relatedItem = sellerId + ':' + item.id;
    const last = notices.find(notice => notice.relatedId === relatedItem || sources?.includes(notice.relatedId)
      && (notice.relatedId !== sellerId || (item.id === 'application' ? notice.template.startsWith('business.seller_application') :
        item.id === 'restriction' ? notice.template === 'business.seller.restriction' : notice.relatedType === 'seller_registered_payout_fixes')));
    const asked = notices.find(notice => notice.relatedId === relatedItem && notice.template === checklistRequestTemplate);
    const remind = Boolean(asked || item.openFix);
    const sellerCopy = last?.template === documentExpiryTemplate ||
      last?.template === 'business.seller.document.review' && last.subject.startsWith('Please fix your ') ? last : null;
    const shapedMessage = last ? { subject: last.subject, at: last.at, emailStatus: last.emailStatus, inAppSeen: last.inAppSeen } : null;
    return {
      sellerAction: null, staffAction: null, expiry: null, openFix: false, ...item,
      note: asked?.body ?? item.note ?? sellerCopy?.body ?? null,
      noteAt: asked?.at ?? item.noteAt ?? sellerCopy?.at ?? null,
      message: shapedMessage,
      requestAction: ask && item.turn === 'seller' && sellerId
        ? { label: remind ? 'Remind' : item.status === 'expiring' ? 'Ask for the renewed one' : 'Ask seller',
          note: asked?.body ?? item.note ?? ask, remind,
          availableAt: Math.max(asked?.at ?? 0, item.openFix ? item.noteAt ?? 0 : 0) + (remind ? checklistReminderIntervalMs : 0) }
        : null,
    };
  };
  const sell = [
    box({ id: 'account', label: 'Seller account', status: checks.get('account')?.status === 'ready' || !profile ? 'ok' : 'waiting',
      turn: checks.get('account')?.status === 'ready' || !profile ? null : 'staff', detail: 'Hastabazaar checks account access.',
      staffAction: { label: 'Check account', href: '#seller-readiness' } }),
    box({ id: 'agreement', label: 'Agreement and selling terms', status: checks.get('terms')?.status === 'ready' ? 'ok' :
      checks.get('terms')?.status === 'unavailable' ? 'waiting' : 'missing',
      turn: checks.get('terms')?.status === 'ready' ? null : checks.get('terms')?.status === 'unavailable' ? 'staff' : 'seller',
      detail: 'Accept the current selling terms.', sellerAction: { label: 'Open agreement', href: approved && readiness?.route !== 'managed_maker'
        ? '/seller#selling-fee-terms' : '/sell/application#selling-fee-terms' },
      staffAction: { label: 'Open selling terms', href: checks.get('terms')?.staffHref ?? '#seller-readiness' } }),
    box({ id: 'application', label: 'Seller application', status: approved ? 'ok' : applicationBySeller ? 'missing' : 'waiting',
      turn: approved ? null : applicationBySeller ? 'seller' : 'staff', detail: applicationBySeller ? 'Complete and send your registration.' : 'Hastabazaar checks the application.',
      sellerAction: { label: 'Open registration', href: registration + '#seller-registration-details' },
      staffAction: { label: 'Open application', href: '#seller-decision' }, sources: [sellerId] }),
    box({ id: 'restriction', label: 'Restrictions and pauses', status: checks.get('restriction')?.status === 'action_needed' ||
      readiness?.blockers.some(blocker => blocker.capability === 'newOrders' && blocker.sourceId.startsWith('hold:')) ? 'waiting' : 'ok',
      turn: checks.get('restriction')?.status === 'action_needed' ||
      readiness?.blockers.some(blocker => blocker.capability === 'newOrders' && blocker.sourceId.startsWith('hold:')) ? 'staff' : null,
      detail: 'Hastabazaar is reviewing your ability to take new orders.', sources: [sellerId],
      staffAction: { label: 'Check restrictions', href: '#seller-readiness' } }),
  ];
  if (approved && readiness?.route === 'managed_maker' && !readiness.newOrders) sell.push(box({
    id: 'activation', label: 'Live order checks', status: 'waiting', turn: 'staff', detail: 'Hastabazaar checks whether your shop can take new orders.',
    staffAction: { label: 'Open live order checks', href: '#seller-readiness' },
  }));

  const docsByKind = new Map<SellerDocumentKind, ChecklistDocument[]>();
  for (const doc of documents) {
    const group = docsByKind.get(doc.kind) ?? [];
    group.push(doc);
    docsByKind.set(doc.kind, group);
  }
  const expiredOrCurrent = (kind: SellerDocumentKind) => docsByKind.get(kind)?.find(doc => doc.reviewedAt !== null);
  const pan = expiredOrCurrent('pan_certificate');
  const needsIdentityFile = !profile?.needsPan && (!pan || (pan.validUntil !== null && pan.validUntil <= now));
  const payoutKinds = new Set<SellerDocumentKind>(['representative_identity', 'pan_certificate', 'business_registration']);
  for (const fix of fixes) payoutKinds.add(fix.kind);
  const payouts = [...payoutKinds].flatMap(kind => {
    const versions = docsByKind.get(kind) ?? [];
    const latest = versions.find(doc => doc.currentSubmission);
    const verified = expiredOrCurrent(kind);
    const fix = fixes.find(fix => fix.kind === kind);
    const required = kind === 'business_registration' ? Boolean(profile?.needsRegistration) :
      kind === 'pan_certificate' ? Boolean(profile?.needsPan ?? !profile) : needsIdentityFile;
    if (!fix && !required && !latest) return [];
    const expiry = verified?.qualifiedExpiry ? verified.validUntil : null;
    const hasValid = verified && (verified.validUntil === null || verified.validUntil > now);
    const wrong = latest?.reviewAction === 'seller.document.correction_requested' || latest?.status === 'rejected';
    const pending = Boolean(latest?.status === 'pending' && !wrong);
    const status: Status = fix ? fix.waitingFor === 'seller' ? 'wrong' : 'waiting' :
      pending ? 'waiting' : wrong ? 'wrong' : expiry ? 'expiring' : hasValid ? 'ok' : 'missing';
    const turn = status === 'ok' ? null : status === 'waiting' ? 'staff' : 'seller';
    const label = checklistDocumentLabels[kind];
    const documentId = latest?.id ?? verified?.id;
    const sellerHref = documentId ? registration + '#document-' + encodeURIComponent(documentId) : registration + '#seller-registration-details';
    const sellerAction = { label: fix ? 'Upload new file' : status === 'expiring' ? 'Upload renewed certificate' : 'Open documents',
      href: fix?.sellerHref ?? (verified?.caseId ? registration + '#request-' + encodeURIComponent(verified.caseId) : sellerHref) };
    const staffHref = fix?.staffHref ?? (documentId ? '/admin/seller-documents/' + encodeURIComponent(documentId) + '/review' : '#seller-evidence');
    return [box({
      id: kind, label, status, turn, expiry, openFix: Boolean(fix),
      detail: fix && turn === 'staff' ? 'Hastabazaar is checking your new file.' :
        expiry ? 'Your current document expires on ' + checklistDate(expiry) + '. Send the renewed one to keep your payout details up to date.' :
        verified?.validUntil && verified.validUntil <= now ? 'Your previous document has expired.' : pending ? 'Hastabazaar is checking the uploaded file.' :
        kind === 'bank_verification' ? 'Update the bank document on Earnings.' : 'Hastabazaar needs current evidence for this item.',
      note: fix?.note ?? null, noteAt: fix?.decidedAt ?? null,
      sellerAction, staffAction: { label: pending || fix?.waitingFor === 'staff' ? 'Recheck' : 'Open document review', href: staffHref },
      ask: expiry ? 'Please send the renewed ' + label.toLowerCase() + ' before ' + checklistDate(expiry) + '.' :
        'Please send your current ' + label.toLowerCase() + ' for review.',
      sources: [...versions.map(doc => doc.id), ...(fix ? [sellerId] : [])],
    })];
  });
  const bankStatus = readiness?.bankStatus ?? null;
  const bankDocuments = docsByKind.get('bank_verification');
  const bankExpiry = bankStatus === 'verified' ? bankDocuments?.find(doc => doc.qualifiedExpiry)?.validUntil ?? null : null;
  const bankMissing = bankStatus === 'missing' || !profile;
  payouts.push(box({
    id: 'bank', label: 'Bank account added and verified',
    status: bankExpiry ? 'expiring' : bankStatus === 'verified' ? 'ok' : bankMissing ? 'missing' : 'waiting',
    turn: bankExpiry || bankMissing ? 'seller' : bankStatus === 'verified' ? null : 'staff',
    detail: bankExpiry ? 'Your bank document expires on ' + checklistDate(bankExpiry) + '.' :
      bankMissing ? 'Add the bank account where you want to receive payouts.' : 'Hastabazaar checks the bank details.',
    expiry: bankExpiry,
    sellerAction: { label: bankExpiry ? 'Renew bank document' : 'Add bank account', href: bankLink },
    staffAction: { label: 'Recheck', href: '#seller-bank' },
    ask: bankExpiry ? 'Please send a renewed bank document before ' + checklistDate(bankExpiry) + '.' :
      'Please add the bank account where you would like to receive payouts.',
    sources: bankDocuments?.map(doc => doc.id),
  }));
  if (readiness?.blockers.some(blocker => blocker.capability === 'payouts' && blocker.sourceId.startsWith('hold:'))) payouts.push(box({
    id: 'payout_review', label: 'Payout review', status: 'waiting', turn: 'staff', detail: 'Hastabazaar is reviewing your payout details.',
    staffAction: { label: 'Open payout checks', href: '#seller-readiness' },
  }));

  const shop = profileItems.map(([id, label, field, detail, action, href]) => {
    const waiting = (id === 'photo' && profile?.pendingPhoto) || (id === 'description' && profile?.pendingDescription);
    return box({
      id, label, detail: waiting ? 'Hastabazaar is checking your submitted shop details.' : detail,
      status: profile?.[field] ? 'ok' : waiting ? 'waiting' : 'missing',
      turn: profile?.[field] ? null : waiting ? 'staff' : 'seller',
      sellerAction: { label: action, href }, staffAction: waiting ? { label: 'Open shop profile review', href: '#public-profile' } : null,
      ask: detail,
    });
  });
  const payoutsUntil = canPay ? payouts.reduce<number | null>((first, item) =>
    item.expiry !== null && (first === null || item.expiry < first) ? item.expiry : first, null) : null;
  return {
    canSell, canPay, shopLive: Boolean(readiness?.newOrders && orders?.status === 'Done'), payoutsUntil,
    missingShop: shop.filter(item => item.status === 'missing').length, bankStatus, onboarding,
    groups: [{ id: 'sell', items: sell }, { id: 'payouts', items: payouts }, { id: 'shop', items: shop }],
    payoutFixes: payouts.filter(item => item.openFix),
  };
}

export function sellerChecklistView(checklist: SellerChecklist) {
  function itemView(item: ChecklistItem) {
    const { id, label, status, turn, detail, note, noteAt, message, expiry } = item;
    return { id, label, status, turn, detail, note, noteAt, expiry, message,
      action: turn === 'seller' ? item.sellerAction : null };
  }
  return {
    canSell: checklist.canSell, canPay: checklist.canPay, shopLive: checklist.shopLive,
    payoutsUntil: checklist.payoutsUntil, missingShop: checklist.missingShop,
    groups: checklist.groups.map(({ id, items }) => ({ id, items: items.map(itemView) })),
    payoutFixes: checklist.payoutFixes.map(itemView), bankStatus: checklist.bankStatus,
  };
}

export type SellerChecklistView = ReturnType<typeof sellerChecklistView>;
export type SellerChecklistItemView = SellerChecklistView['payoutFixes'][number];
