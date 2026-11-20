import { isCurrentProgrammeNotice } from './programme-notice-sources';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { permissions, type Permission } from '../marketplace/permissions';
import {
  isCurrentFinancialNotice,
  type CurrentOperationalNotice,
} from './financial-notice-sources';
import { financialNoticeTypes } from './financial-notice-links';
import type { NotificationAudience } from './notification-links';
export class FinancialNoticeAccessError extends Error {
  readonly status = 403;
}
interface Input {
  actorId: string;
  audience: NotificationAudience;
  type: string;
  id: string;
}
const families: Record<string, string> = {
  refund_obligation: 'finance.refund',
  payout_transfer: 'finance.payout',
  managed_live_payout: 'finance.payout',
  managed_live_eligibility: 'finance.payout',
  managed_live_clearance: 'seller.live_clearance',
  managed_live_financial_scope: 'company.live_financial_scope',
  lawful_fee_refund_authorization: 'finance.fee_refund_authorized',
  managed_live_invoice_adjustment: 'finance.invoice_adjustment',
  company_funding_statement: 'finance.funding_verified',
  promo_campaign_notice: 'programme.updated',
  loyalty_programme_notice: 'programme.updated',
  customer_fee_waiver_notice:'programme.updated',
  referral_campaign_notice:'programme.updated',
};
export interface FinancialNoticeDestination {
  recordId: string;
  title: string;
  reference: string;
  status: string;
  recordedAt: number;
  amountPaisa: number | null;
  explanation: string;
  actionHref: string;
  actionLabel: string;
}
async function currentNotice(db: D1Database, input: Input, now: number) {
  const active = await db
    .prepare(
      "SELECT 1 FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN (" +
        (input.audience === 'staff'
          ? "'admin','super_admin'"
          : "'customer','seller'") +
        '))',
    )
    .bind(input.actorId)
    .first();
  if (!active)
    throw new FinancialNoticeAccessError(
      'Current access is required to open this financial record.',
    );
  const notices = await db
    .prepare(
      'SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId,required_permission requiredPermission,subject_en subject,created_at createdAt FROM notification_messages WHERE recipient_user_id=? AND audience_role=? AND related_type=? AND related_id=? AND template_key=? AND business_event_key=template_key ORDER BY created_at DESC,id DESC LIMIT 50',
    )
    .bind(
      input.actorId,
      input.audience,
      input.type,
      input.id,
      'business.' + families[input.type],
    )
    .all<CurrentOperationalNotice & { subject: string; createdAt: number }>();
  for (const notice of notices.results) {
    let staffRole: 'admin' | 'super_admin' | undefined;
    if (input.audience === 'staff') {
      if (
        !notice.requiredPermission ||
        !permissions.includes(notice.requiredPermission as Permission)
      )
        continue;
      staffRole = (
        await staffMutationGuard(
          db,
          input.actorId,
          notice.requiredPermission as Permission,
          FinancialNoticeAccessError,
        )
      ).role;
    }
    const programme =
      input.type === 'promo_campaign_notice' ||
      input.type === 'loyalty_programme_notice'||input.type==='customer_fee_waiver_notice'||input.type==='referral_campaign_notice';
    if (programme) {
      if (input.audience !== 'staff') continue;
      await staffMutationGuard(
        db,
        input.actorId,
        'commercial_policy.manage',
        FinancialNoticeAccessError,
        'super_admin',
      );
    }
    if (
      await (programme
        ? isCurrentProgrammeNotice(db, notice, now)
        : isCurrentFinancialNotice(db, notice, now))
    )
      return { ...notice, staffRole };
  }
  return null;
}
/** A copied URL grants no authority. Only an actually issued, current native source notice opens its minimal record projection. */
export async function readFinancialNoticeDestination(
  db: D1Database,
  input: Input,
  now = Date.now(),
): Promise<FinancialNoticeDestination | null> {
  if (
    !Object.hasOwn(financialNoticeTypes, input.type) ||
    !input.id ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(input.id) ||
    !(
      financialNoticeTypes[
        input.type as keyof typeof financialNoticeTypes
      ] as readonly string[]
    ).includes(input.audience)
  )
    return null;
  const issued = await currentNotice(db, input, now);
  if (!issued) return null;
  let result: FinancialNoticeDestination | null = null;
  const staff = input.audience === 'staff';
  if (
    input.type === 'promo_campaign_notice' ||
    input.type === 'loyalty_programme_notice'||input.type==='customer_fee_waiver_notice'||input.type==='referral_campaign_notice'
  ) {
    const programme =
      input.type === 'promo_campaign_notice' ? 'promo' : input.type==='customer_fee_waiver_notice'?'waiver':input.type==='referral_campaign_notice'?'referral':'loyalty';
    const state = await db
      .prepare(
        'SELECT current_status status FROM operational_notice_states WHERE family=? AND source_id=?',
      )
      .bind('programme.' + programme, input.id)
      .first<{ status: string }>();
    if (state)
      result = {
        recordId: input.id,
        title: issued.subject,
        reference: input.id,
        status: state.status,
        recordedAt: issued.createdAt,
        amountPaisa: null,
        explanation:
          'This internal notice records a reviewed programme change or its current due milestone. It does not distribute marketing, change prices, consume a promotion or credit rewards. Private codes, budgets, customer lists and reward balances are excluded.',
        actionHref:
          programme === 'promo' ? '/admin/promo-codes?campaign='+encodeURIComponent(input.id)+'#manage' : programme==='waiver'?'/admin/fee-waivers#fee-waiver-'+encodeURIComponent(input.id):programme==='referral'?'/admin/referrals?view=settings':'/admin/loyalty',
        actionLabel:
          programme === 'promo'
            ? 'Open current promotion management'
            : 'Open current loyalty management',
      };
  } else if (input.type === 'managed_live_payout') {
    const row = await db
      .prepare(
        "SELECT id,seller_id sellerId,payout_number reference,status,amount_paisa amountPaisa,created_at recordedAt FROM managed_payouts WHERE id=? AND record_kind='live'",
      )
      .bind(input.id)
      .first<{
        id: string;
        sellerId: string;
        reference: string;
        status: string;
        amountPaisa: number;
        recordedAt: number;
      }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Actual maker payout',
        reference: row.reference,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: row.amountPaisa,
        explanation:
          'Preparation or retirement records the original payout reservation. It does not establish a completed bank transfer.',
        actionHref: staff
          ? '/admin/programs?sellerId=' + encodeURIComponent(row.sellerId)
          : '/seller/finance',
        actionLabel: staff
          ? 'Open this maker’s financial workspace'
          : 'Open your earnings and payout history',
      };
  } else if (input.type === 'payout_transfer') {
    const row = await db
      .prepare(
        'SELECT id,state status,amount_paisa amountPaisa,prepared_at recordedAt FROM payout_transfer_packets WHERE id=?',
      )
      .bind(input.id)
      .first<{
        id: string;
        status: string;
        amountPaisa: number;
        recordedAt: number;
      }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Original payout instruction',
        reference: row.id,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: row.amountPaisa,
        explanation:
          'Approval and processing are separate from an actual completed bank outcome. An uncertain instruction requires reconciliation.',
        actionHref: staff
          ? '/admin/payments/payouts#packet-' + encodeURIComponent(row.id)
          : '/seller/finance',
        actionLabel: staff
          ? 'Open this protected payout instruction'
          : 'Open your payout history',
      };
  } else if (input.type === 'managed_live_eligibility') {
    const row = await db
      .prepare(
        "SELECT seller.id,seller.trading_name reference,event.created_at recordedAt FROM seller_profiles seller JOIN operational_notice_states notice ON notice.source_id=seller.id AND notice.family='finance.payout' JOIN audit_logs event ON event.id=notice.current_event_id WHERE seller.id=? AND event.action='managed.live.eligibility.released'",
      )
      .bind(input.id)
      .first<{ id: string; reference: string; recordedAt: number }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Original actual earnings released',
        reference: row.reference,
        status: 'eligible',
        recordedAt: row.recordedAt,
        amountPaisa: null,
        explanation:
          'Eligible original earnings may be reviewed for payout. Eligibility release is not a bank payment.',
        actionHref: staff
          ? '/admin/programs?sellerId=' + encodeURIComponent(row.id)
          : '/seller/finance',
        actionLabel: 'Open the original earnings workspace',
      };
  } else if (input.type === 'managed_live_clearance') {
    const row = await db
      .prepare(
        "SELECT id,seller_id sellerId,state status,CASE WHEN state='revoked' THEN revoked_at ELSE reviewed_at END recordedAt FROM managed_live_clearances WHERE id=?",
      )
      .bind(input.id)
      .first<{
        id: string;
        sellerId: string;
        status: string;
        recordedAt: number;
      }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'External live clearance review',
        reference: row.id,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: null,
        explanation:
          'This retained clearance review is distinct from current activation, current terms and authority to accept new orders.',
        actionHref: staff
          ? '/admin/sellers/' + encodeURIComponent(row.sellerId)
          : '/seller',
        actionLabel: staff
          ? 'Open this seller’s current protected review'
          : 'Open your current seller readiness',
      };
  } else if (input.type === 'managed_live_financial_scope') {
    const row = await db
      .prepare(
        'SELECT id,reviewed_at recordedAt FROM managed_live_financial_scopes WHERE id=?',
      )
      .bind(input.id)
      .first<{ id: string; recordedAt: number }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Company commercial invoice scope',
        reference: row.id,
        status: 'reviewed',
        recordedAt: row.recordedAt,
        amountPaisa: null,
        explanation:
          'The reviewed commercial invoice scope is not a tax invoice approval or a seller activation decision.',
        actionHref: '/admin/programs#program-settings',
        actionLabel: 'Open current program and company settings',
      };
  } else if (input.type === 'company_funding_statement') {
    const row = await db
      .prepare(
        'SELECT id,recorded_at recordedAt FROM company_funding_statements WHERE id=?',
      )
      .bind(input.id)
      .first<{ id: string; recordedAt: number }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Company funding statement',
        reference: row.id,
        status: 'verified',
        recordedAt: row.recordedAt,
        amountPaisa: null,
        explanation:
          'This independently verified funding statement does not approve or execute any customer refund or seller transfer. Private bank evidence is excluded from this notice view.',
        actionHref: '/admin/payments/refunds',
        actionLabel: 'Open protected funding and refund review',
      };
  } else if (input.type === 'lawful_fee_refund_authorization') {
    const row = await db
      .prepare(
        'SELECT id,state status,amount_paisa amountPaisa,authorized_at recordedAt FROM lawful_fee_refund_authorizations WHERE id=?',
      )
      .bind(input.id)
      .first<{
        id: string;
        status: string;
        amountPaisa: number;
        recordedAt: number;
      }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Lawful fee refund authorization',
        reference: row.id,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: row.amountPaisa,
        explanation:
          'This authorization has been recorded. It is separate from Finance opening an outgoing refund obligation or recording a completed payment.',
        actionHref: staff ? '/admin/payments/refunds' : '/account/refunds',
        actionLabel: staff
          ? 'Open authorized refund work'
          : 'Open your Finance refund history',
      };
  } else if (input.type === 'managed_live_invoice_adjustment') {
    const row = await db
      .prepare(
        "SELECT credit.id,credit.adjustment_number reference,credit.kind status,credit.amount_paisa amountPaisa,credit.issued_at recordedAt,invoice.id invoiceId,invoice.order_id orderId,original.order_number orderNumber FROM managed_invoice_adjustments credit JOIN managed_invoice_groups invoice ON invoice.id=credit.invoice_group_id JOIN orders original ON original.id=invoice.order_id WHERE credit.id=? AND credit.record_kind='live' AND invoice.record_kind='live'",
      )
      .bind(input.id)
      .first<{
        id: string;
        reference: string;
        status: string;
        amountPaisa: number;
        recordedAt: number;
        invoiceId: string;
        orderId: string;
        orderNumber: string;
      }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Original commercial invoice correction',
        reference: row.reference,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: row.amountPaisa,
        explanation:
          'This append-only commercial credit preserves the original invoice. It does not independently execute another refund.',
        actionHref: staff
          ? '/admin/orders/' + encodeURIComponent(row.orderId)
          : '/orders/' +
            encodeURIComponent(row.orderNumber) +
            '/managed-invoices/' +
            encodeURIComponent(row.invoiceId) +
            '#adjustment-' +
            encodeURIComponent(row.id),
        actionLabel: staff
          ? 'Open the original protected order and invoice'
          : 'Open this correction on your original invoice',
      };
  } else if (input.type === 'refund_obligation') {
    const row = await db
      .prepare(
        'SELECT id,state status,authorized_at recordedAt FROM refund_obligations WHERE id=?',
      )
      .bind(input.id)
      .first<{ id: string; status: string; recordedAt: number }>();
    if (row)
      result = {
        recordId: row.id,
        title: 'Original refund obligation',
        reference: row.id,
        status: row.status,
        recordedAt: row.recordedAt,
        amountPaisa: null,
        explanation:
          'Current authorized cash, any direct bank satisfaction and recorded payment outcomes remain distinct.',
        actionHref: staff
          ? '/admin/payments/refunds?obligation=' + encodeURIComponent(row.id)
          : '/account/refunds#refund-' + encodeURIComponent(row.id),
        actionLabel: 'Open this original refund',
      };
  }
  if (result && staff && issued.staffRole !== 'super_admin') {
    if (result.actionHref.startsWith('/admin/programs')) {
      result.actionHref = '/admin/payments/payouts';
      result.actionLabel = 'Open authorized payout review';
    }
    if (result.actionHref.startsWith('/admin/orders/')) {
      result.actionHref = '/admin/payments/refunds';
      result.actionLabel = 'Open authorized Finance refund work';
    }
  }
  if (!result || !(await currentNotice(db, input, now))) return null;
  return result;
}
