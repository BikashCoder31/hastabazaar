import { readCustomerDelayQuestions } from '../orders/customer-delay-answer';
import { responseScopeContains } from '../orders/response-sql';
import { isCourierNoticeTemplate, readCourierEmailNoticeSource } from '../operations/courier-email-notices';
import type { BusinessEmailData } from './business-message';
import { reviewMessages } from '../operations/message-event-catalog';

export async function addBusinessEmailDetails(
  db: D1Database,
  row: BusinessEmailData & { userId: string | null; authSubject: string | null; requestId: string },
  now: number,
) {
  if (!row.relatedId || row.audience === 'staff') return;
  if (row.template && isCourierNoticeTemplate(row.template)) {
    const source = await readCourierEmailNoticeSource(db, {
      ...row, template: row.template, channel: 'email',
    }, now);
    if (source) Object.assign(row, source);
  } else if (row.relatedType === 'order_payment') {
    const source = await db.prepare(`SELECT o.order_number AS orderNumber,b.payable_paisa AS amountPaisa,
      w.issued_at AS issuedAt,w.deadline_at AS deadlineAt,w.paid_at AS paidAt,w.released_at AS releasedAt
      FROM manual_payment_windows w JOIN orders o ON o.id=w.order_id
      JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=? AND o.customer_id=?`)
      .bind(row.relatedId, row.userId)
      .first<{ orderNumber: string; amountPaisa: number; issuedAt: number; deadlineAt: number; paidAt: number | null; releasedAt: number | null }>();
    if (source) {
      row.orderNumber = source.orderNumber;
      row.amountPaisa = Number(source.amountPaisa);
      row.issuedAt = Number(source.issuedAt);
      row.deadlineAt = Number(source.deadlineAt);
      row.paidAt = source.paidAt == null ? undefined : Number(source.paidAt);
      row.released = source.releasedAt != null;
    }
  } else if (row.relatedType === 'order_response_event') {
    const event = await db.prepare(`SELECT e.case_id AS caseId,o.id AS orderId,o.order_number AS orderNumber FROM order_response_events e
      JOIN orders o ON o.id=e.order_id WHERE e.id=?`)
      .bind(row.relatedId).first<{ caseId: string | null; orderId: string; orderNumber: string }>();
    if (!event) return;
    row.orderNumber = event.orderNumber;
    if (row.template === 'business.order.preparation_update' && event.caseId && row.userId && row.authSubject) {
      const [question] = await readCustomerDelayQuestions(db, { id: row.userId, authSubject: row.authSubject }, { caseId: event.caseId });
      if (question) {
        const ids = question.itemIds.slice(0, 12);
        const items = ids.length
          ? (await db.prepare(`SELECT product_name_snapshot AS name FROM order_items WHERE order_id=? AND seller_id=?
            AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
            .bind(question.orderId, question.sellerId, ...ids).all<{ name: string }>()).results
          : [];
        row.question = { id: question.id, sellerName: question.sellerName, readyAt: question.proposedReadyAt,
          itemNames: items.map(item => item.name).join(', ') || undefined };
      }
    } else if (row.template === 'business.order.response' && ['New preparation work', reviewMessages.newSellerOrder].includes(row.subject)) {
      const items = await db.prepare(`SELECT i.product_name_snapshot AS name,i.quantity FROM order_response_events e
        JOIN order_response_portions p ON p.id=e.portion_id JOIN seller_profiles s ON s.id=p.seller_id
        JOIN order_items i ON i.order_id=e.order_id AND i.seller_id=p.seller_id
        WHERE e.id=? AND s.user_id=? AND ${responseScopeContains(db, 'e.scope_json', 'i.id')} ORDER BY i.id LIMIT 12`)
        .bind(row.relatedId, row.userId).all<{ name: string; quantity: number }>();
      row.itemNames = items.results.map(item => item.name + ' × ' + item.quantity).join(', ') || undefined;
    }
  } else if (row.template === 'business.seller_application.result' &&
    ['seller_application','seller_registered_application','seller_registered_payout_fixes'].includes(row.relatedType ?? '')) {
    const source = await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?')
      .bind(row.relatedId, row.userId).first<{ reference: string | null }>();
    row.reference = source?.reference;
  } else if (row.relatedType === 'refund_obligation' && row.template === 'business.finance.refund') {
    const source = await db.prepare(`SELECT state.current_status AS currentStatus,o.order_number AS orderNumber,
      (SELECT p.amount_paisa FROM outgoing_payment_packets p WHERE p.obligation_id=r.id AND p.state='paid' ORDER BY p.recorded_at DESC,p.id DESC LIMIT 1) AS amountPaisa
      FROM refund_obligations r JOIN operational_notice_states state ON state.family='finance.refund' AND state.source_id=r.id
      LEFT JOIN orders o ON o.id=r.order_id WHERE r.id=? AND r.customer_id=?`)
      .bind(row.relatedId, row.userId).first<{ currentStatus: string; orderNumber: string | null; amountPaisa: number | null }>();
    if (source) {
      row.currentStatus = source.currentStatus;
      row.orderNumber = source.orderNumber;
      if (source.amountPaisa != null) row.amountPaisa = Number(source.amountPaisa);
    }
  } else if (row.relatedType === 'payout_transfer' && row.template === 'business.finance.payout') {
    const source = await db.prepare(`SELECT state.current_status AS currentStatus,
      p.payout_number AS reference,packet.amount_paisa AS amountPaisa,packet.bank_at AS paidAt
      FROM payout_transfer_packets packet JOIN seller_profiles seller ON seller.id=packet.seller_id
      JOIN operational_notice_states state ON state.family='finance.payout' AND state.source_id=packet.id
      LEFT JOIN payouts p ON p.id=packet.registered_payout_id WHERE packet.id=? AND seller.user_id=?`)
      .bind(row.relatedId, row.userId).first<{ currentStatus: string; reference: string | null; amountPaisa: number; paidAt: number | null }>();
    if (source) {
      row.currentStatus = source.currentStatus;
      row.reference = source.reference;
      row.amountPaisa = Number(source.amountPaisa);
      row.paidAt = source.paidAt == null ? undefined : Number(source.paidAt);
    }
  } else if (row.relatedType === 'payout' && row.template === 'business.payout.result') {
    const source = await db.prepare(`SELECT p.status AS currentStatus,p.payout_number AS reference,p.amount_paisa AS amountPaisa,
      p.paid_at AS paidAt FROM payouts p JOIN seller_profiles seller ON seller.id=p.seller_id WHERE p.id=? AND seller.user_id=?`)
      .bind(row.relatedId, row.userId).first<{ currentStatus: string; reference: string; amountPaisa: number; paidAt: number | null }>();
    if (source) {
      row.currentStatus = source.currentStatus;
      row.reference = source.reference;
      row.amountPaisa = Number(source.amountPaisa);
      row.paidAt = source.paidAt == null ? undefined : Number(source.paidAt);
    }
  }
}
