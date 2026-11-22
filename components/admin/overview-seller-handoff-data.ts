import type { ReviewQueueTask } from '@/lib/admin/review-queue-view';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { can } from '@/lib/marketplace/permissions';
import type { AdminStaffAccess } from './admin-sections';
import { todayShortDate, type TodayTask, type TodayTaskCopy } from './overview-today-model';

type TodayActor = AdminStaffAccess & { id: string };

const readyDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu',
});
const payoutAmount = new Intl.NumberFormat('en-NP', {
  style: 'currency', currency: 'NPR', currencyDisplay: 'code', minimumFractionDigits: 0,
});
const returnReplies: Readonly<Record<string, string>> = {
  accept: 'Seller accepts the return',
  contest: 'Seller disputes the return',
  request_information: 'Seller asks for more information',
};

/** Enrich only the IDs already returned by the permission-checked review readers. */
async function reviewSourceDetails<T extends { id: string }>(db: D1Database, ids: readonly string[], sql: string) {
  const rows = new Map<string, T>();
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += 60) {
    const batch = unique.slice(index, index + 60);
    const results = await db.prepare(sql + ` (${batch.map(() => '?').join(',')})`).bind(...batch).all<T>();
    for (const row of results.results) rows.set(row.id, row);
  }
  return rows;
}

export async function readSellerReviewHandoffs(db: D1Database, actor: TodayActor, tasks: readonly ReviewQueueTask[]) {
  const sourceIds = (family: ReviewQueueTask['sourceType']) => tasks.filter(task => task.sourceType === family).map(task => task.sourceId);
  const registeredPayoutIds = tasks.flatMap(task => 'finance' in task && task.finance.origin.model === 'registered' &&
    task.finance.origin.payoutId ? [task.finance.origin.payoutId] : []);
  const unnamedProductSellers = tasks.flatMap(task => task.sourceType === 'product_review' && !task.sellerName && task.sellerId ? [task.sellerId] : []);
  const details = await Promise.all([
    reviewSourceDetails<{ id: string; kind: string; mode: string; orderId: string; orderNumber: string; sellerName: string; proposedReadyAt: number | null; firstActionAt: number | null }>(db,
      sourceIds('order_response'), `SELECT c.id,c.kind,p.operator_mode AS mode,o.id AS orderId,o.order_number AS orderNumber,
        s.trading_name AS sellerName,c.proposed_ready_at AS proposedReadyAt,c.first_action_at AS firstActionAt
        FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id
        JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id IN`).catch(() => null),
    reviewSourceDetails<{ id: string; orderNumber: string; sellerName: string; reply: string | null }>(db,
      sourceIds('return_request'), `SELECT r.id,o.order_number AS orderNumber,i.seller_name_snapshot AS sellerName,
        r.seller_recommendation AS reply FROM return_requests r JOIN order_items i ON i.id=r.order_item_id
        JOIN orders o ON o.id=i.order_id WHERE r.id IN`).catch(() => null),
    reviewSourceDetails<{ id: string; sellerName: string; isChange: number; hasEvidence: number }>(db,
      [...sourceIds('protected_change'), ...sourceIds('document_change')], `SELECT c.id,COALESCE(NULLIF(profile.display_name,''),s.trading_name) AS sellerName,
        CASE WHEN c.original_bank_reference IS NOT NULL AND c.original_bank_reference<>''
          AND c.original_bank_reference NOT LIKE 'PENDING VERIFICATION:%' THEN 1 ELSE 0 END AS isChange,
        CASE WHEN c.replacement_document_id IS NOT NULL THEN 1 ELSE 0 END AS hasEvidence
        FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
        LEFT JOIN seller_public_profile_states profile ON profile.seller_id=s.id WHERE c.kind='bank' AND c.id IN`).catch(() => null),
    reviewSourceDetails<{ id: string; sellerName: string; amountPaisa: number }>(db,
      sourceIds('payout_request'), `SELECT r.id,s.trading_name AS sellerName,r.available_amount_snapshot_paisa AS amountPaisa
        FROM payout_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.status='submitted' AND r.id IN`).catch(() => null),
    reviewSourceDetails<{ id: string; payoutNumber: string; sellerName: string; amountPaisa: number; requestedAt: number | null }>(db,
      registeredPayoutIds, `SELECT p.id,p.payout_number AS payoutNumber,s.trading_name AS sellerName,p.amount_paisa AS amountPaisa,
        (SELECT MIN(r.created_at) FROM payout_requests r WHERE r.payout_id=p.id) AS requestedAt
        FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id IN`).catch(() => null),
    reviewSourceDetails<{ id: string; sellerName: string }>(db, unnamedProductSellers,
      'SELECT id,trading_name AS sellerName FROM seller_profiles WHERE id IN').catch(() => null),
  ] as const);
  const [preparation, returns, bankChanges, requests, payouts, sellers] = details;
  const copy = new Map<string, TodayTaskCopy>();
  const canApprove = actor.role === 'super_admin' && can(actor, 'payout.approve');
  for (const task of tasks) {
    if (task.sourceType === 'order_response') {
      const record = preparation?.get(task.sourceId);
      if (record?.mode !== 'seller') continue;
      if (record.kind === 'delay' && record.proposedReadyAt !== null) {
        copy.set(task.id, {
          type: 'Delays', title: `New ready date for ${record.orderNumber}: ${readyDate.format(record.proposedReadyAt).replace(',', '')}`,
          context: record.sellerName,
          action: record.firstActionAt === null ? 'Tell customer' : 'Open follow-up',
        });
      } else if (record.kind === 'no_response') {
        copy.set(task.id, {
          type: 'Packing', title: 'Follow up on packing for ' + record.orderNumber,
          context: record.sellerName, action: 'Open order',
          href: '/admin/orders/' + encodeURIComponent(record.orderId),
        });
      }
    } else if (task.sourceType === 'return_request') {
      const record = returns?.get(task.sourceId);
      if (!record) continue;
      const escalated = task.sourceStatus === 'under_investigation' && record.reply;
      copy.set(task.id, {
        title: (escalated ? 'Escalated return on ' : 'Review return on ') + record.orderNumber,
        context: [record.sellerName, record.reply && returnReplies[record.reply]].filter(Boolean).join(' · '),
      });
    } else if (task.sourceType === 'protected_change' || task.sourceType === 'document_change') {
      const record = bankChanges?.get(task.sourceId);
      if (!record) continue;
      copy.set(task.id, {
        type: record.isChange ? 'Bank change' : 'Bank verification',
        title: (record.isChange ? 'Bank account change for ' : 'Verify bank account for ') + record.sellerName,
        context: task.status === 'awaiting_review' ? record.hasEvidence ? 'Review the submitted bank details' : 'Review the change request' : undefined,
        href: '/admin/seller-protected-changes/' + encodeURIComponent(task.sourceId), action: 'View',
      });
    } else if (task.sourceType === 'product_review' && !task.sellerName && task.sellerId) {
      const seller = sellers?.get(task.sellerId);
      if (seller) copy.set(task.id, { sellerName: seller.sellerName });
    } else if (task.sourceType === 'payout_request') {
      const record = requests?.get(task.sourceId);
      if (!record) continue;
      copy.set(task.id, {
        title: 'Review payout request', action: 'Review',
        context: [record.sellerName, payoutAmount.format(record.amountPaisa / 100), 'Asked ' + todayShortDate.format(task.startedAt)].join(' · '),
      });
    } else if ('finance' in task && task.finance.origin.model === 'registered' && task.finance.origin.payoutId) {
      const record = payouts?.get(task.finance.origin.payoutId);
      if (!record) continue;
      const approve = canApprove && !task.finance.blocked && task.sourceType === 'payout_candidate' &&
        ['prepared', 'scheduled'].includes(task.sourceStatus);
      const verb = approve ? 'Approve payout' : task.sourceType === 'payout_candidate' ? 'Review payout' : 'Review transfer for';
      copy.set(task.id, {
        title: `${verb} ${record.payoutNumber}`,
        context: [record.sellerName, payoutAmount.format(record.amountPaisa / 100),
          record.requestedAt !== null && 'Asked ' + todayShortDate.format(record.requestedAt)].filter(Boolean).join(' · '),
        ...(approve ? { href: '/admin/payouts/' + encodeURIComponent(task.finance.origin.payoutId), action: 'Review' } : {}),
      });
    }
  }
  return { copy, partial: details.includes(null) };
}

/** An outbound parcel is booked once per ready seller portion, even for multi-item orders. */
export async function readSellerPickupHandoffs(db: D1Database, actor: TodayActor, returnTo: string) {
  if (!can(actor, 'order.manage')) return [];
  const rows = await db.prepare(`SELECT o.id AS orderId,o.order_number AS orderNumber,i.seller_id AS sellerId,
      MAX(i.seller_name_snapshot) AS sellerName,profile.public_city AS city,MAX(e.created_at) AS readyAt,
      o.placed_at AS placedAt,CASE WHEN job.id IS NOT NULL AND parcel.shipping_job_id IS NULL THEN 1 ELSE 0 END AS legacyJob
    FROM order_items i JOIN orders o ON o.id=i.order_id
    LEFT JOIN order_item_status_events e ON e.order_item_id=i.id AND e.request_id=i.fulfillment_request_id AND e.to_status='ready_for_pickup'
    LEFT JOIN seller_public_profile_states profile ON profile.seller_id=i.seller_id
    LEFT JOIN shipping_jobs job ON job.order_id=o.id AND job.seller_id=i.seller_id AND job.direction='outbound'
    LEFT JOIN shipping_parcels parcel ON parcel.shipping_job_id=job.id
    WHERE i.fulfillment_status='ready_for_pickup' AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched')
      AND NOT EXISTS (SELECT 1 FROM first_cod_reviews cod WHERE cod.order_id=o.id AND cod.status<>'confirmed')
      AND NOT EXISTS (SELECT 1 FROM delivery_assignments assignment WHERE assignment.order_id=o.id)
      AND NOT EXISTS (SELECT 1 FROM order_items pending WHERE pending.order_id=o.id AND pending.seller_id=i.seller_id
        AND pending.fulfillment_status NOT IN ('ready_for_pickup','cancelled'))
      AND NOT EXISTS (SELECT 1 FROM order_items held JOIN order_fulfillment_holds h ON h.order_item_id=held.id
        WHERE held.order_id=o.id AND held.seller_id=i.seller_id AND held.fulfillment_status='ready_for_pickup'
          AND h.ended_at IS NULL AND h.prevents_handoff=1)
      AND (job.id IS NULL OR (job.status IN ('pickup_requested','label_pending','label_ready')
        AND job.pickup_window_start IS NULL AND parcel.method IS NULL))
    GROUP BY o.id,o.order_number,i.seller_id,profile.public_city,o.placed_at,job.id,parcel.shipping_job_id`)
    .all<{ orderId: string; orderNumber: string; sellerId: string; sellerName: string; city: string | null;
      readyAt: number | null; placedAt: number; legacyJob: number }>();
  return rows.results.map((row): TodayTask => ({
    id: `pickup:${row.orderId}:${row.sellerId}`, section: 'Orders', type: 'Pickup',
    title: 'Book pickup for ' + row.orderNumber,
    context: [row.sellerName, row.city, row.readyAt !== null && 'Ready since ' + todayShortDate.format(row.readyAt)].filter(Boolean).join(' · '),
    startedAt: row.readyAt ?? row.placedAt, dueAt: null, state: 'action',
    ownerId: null, ownerName: null, ownerKnown: false, assignment: null,
    href: withAdminReturnTo(row.legacyJob ? '/admin/shipping' : `/admin/orders/${encodeURIComponent(row.orderId)}?tab=parcel-cash#courier`, returnTo),
    action: 'Book courier',
  }));
}
