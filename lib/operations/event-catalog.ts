import {independentProductStaffSql,independentProductIntakeStaffSql} from '../products/party-scope';
/** Source adapters keep their own transaction guards; this catalogue owns shared
 * channel identity and current-version suppression for implemented families. */
export const operationalNotificationChannels = ['in_app', 'email'] as const;
export const catalogReviewEvents = {
  'business.product.submitted': { source: 'product', purpose: 'review' },
  'business.product.result': { source: 'product', purpose: 'outcome' },
  'business.seller_application.submitted': { source: 'seller_application', purpose: 'review' },
  'business.seller_application.result': { source: 'seller_application', purpose: 'outcome' },
} as const;

const operationalSources: Readonly<Record<string, string>> = {
  'business.seller.live_activation':"SELECT d.request_id marker,s.user_id ownerId FROM managed_live_activation_decisions d JOIN seller_profiles s ON s.id=d.seller_id JOIN managed_live_clearances c ON c.id=d.clearance_id WHERE d.id=? AND d.owner_id=s.user_id AND c.state='active' AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions newer WHERE newer.seller_id=d.seller_id AND newer.revision>d.revision)",
  'business.payment.return_satisfied':"SELECT review.request_id marker,satisfaction.customer_id ownerId FROM receipt_return_bank_satisfactions satisfaction JOIN seller_recovery_receipt_reversal_reviews review ON review.id=satisfaction.review_id WHERE satisfaction.id=? AND review.state='completed'",
  'business.payment.return_loss':"SELECT review.request_id marker,original.customer_id ownerId FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id JOIN refund_obligations original ON original.id=loss.obligation_id WHERE loss.id=? AND review.state='completed'",
  'business.seller.recovery.claim':`SELECT q.operation_request_id marker,q.submitted_by ownerId FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE q.id=? AND s.user_id=q.submitted_by
    AND (q.status<>'receipt_verified' OR EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=q.receipt_id AND r.status='verified' AND r.currency='NPR' AND r.payer_user_id=q.submitted_by AND r.amount_minor=q.amount_paisa AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals v WHERE v.receipt_id=r.id)))`,
  'business.seller.recovery':'SELECT x.request_id marker,s.user_id ownerId FROM seller_recovery_cases c JOIN seller_recovery_events x ON x.case_id=c.id AND x.revision=c.revision JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?',
  'business.order.preparation_update':"SELECT e.id marker,o.customer_id ownerId FROM order_response_events e JOIN orders o ON o.id=e.order_id WHERE e.id=?",
  'business.order.response':"SELECT e.id marker,s.user_id ownerId FROM order_response_events e JOIN order_response_portions p ON p.id=e.portion_id JOIN seller_profiles s ON s.id=p.seller_id WHERE e.id=?",
  'business.product.priority':'SELECT c.last_event_id marker,s.user_id ownerId FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=?',
  'business.product.availability':'SELECT a.last_event_id marker,s.user_id ownerId FROM product_availability_states a JOIN products p ON p.id=a.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE a.product_id=?',
  'business.product.intake':'SELECT c.last_event_id marker,d.owner_id ownerId FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=?',
  'business.product.discount_suggestion':'SELECT a.id marker,s.user_id ownerId FROM product_discount_advisories a JOIN products p ON p.id=a.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE a.id=?',
  'business.fee.terms':'SELECT e.id marker,s.user_id ownerId FROM commission_terms_events e JOIN commission_terms_cases c ON c.id=e.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE e.id=?',
  'business.fee.followup':'SELECT e.id marker,NULL ownerId FROM commission_terms_events e WHERE e.id=?',
  'business.fee.holds':'SELECT id marker,NULL ownerId FROM commission_terms_hold_batches WHERE id=?',
  'business.fee.policy':"SELECT COALESCE(c.event_id,p.id) marker,NULL ownerId FROM commission_common_policies p LEFT JOIN commission_common_cancellations c ON c.policy_id=p.id WHERE p.id=?",
  'business.category.policy':'SELECT last_event_id marker,NULL ownerId FROM category_template_states WHERE category_id=?',
  'business.payment.exception':"SELECT last_event_id marker,owner_id ownerId FROM manual_payment_exceptions WHERE id=? AND state<>'resolved'",
  'business.payment.reminder':'SELECT r.event_id marker,o.customer_id ownerId FROM manual_payment_reminders r JOIN orders o ON o.id=r.order_id WHERE r.order_id=?',
  'business.payment.order':'SELECT w.last_event_id marker,o.customer_id ownerId FROM manual_payment_windows w JOIN orders o ON o.id=w.order_id WHERE w.order_id=?',
  'business.company.account':'SELECT last_event_id marker,NULL ownerId FROM company_payment_accounts WHERE id=?',
  'business.seller.support_contact': 'SELECT p.support_request_id marker,s.user_id ownerId FROM seller_public_profile_states p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.seller_id=?',
  'business.seller.public_profile': `SELECT c.operation_request_id marker,s.user_id ownerId FROM seller_public_profile_revisions c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.seller_id=? AND c.kind='normal' AND c.sequence=(SELECT MAX(latest.sequence) FROM seller_public_profile_revisions latest WHERE latest.seller_id=c.seller_id AND latest.kind='normal')`,
  'business.seller.profile_correction': 'SELECT c.operation_request_id marker,s.user_id ownerId FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?',
  'business.seller.protected_change': 'SELECT c.operation_request_id marker,s.user_id ownerId FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?',
  'business.seller.document.change': 'SELECT r.operation_request_id marker,s.user_id ownerId FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.id=?',
  'business.seller.document.review': `SELECT d.review_request_id marker,s.user_id ownerId FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=?
    AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind
      AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))`,
  'business.form.compatibility.changed': "SELECT a.id marker,NULL ownerId FROM audit_logs a JOIN form_config_versions v ON v.id=a.subject_id WHERE v.form_id=? AND v.status='published' AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest WHERE latest.form_id=v.form_id AND latest.status='published') AND a.action IN ('form.compatibility.granted','form.compatibility.revoked') AND (a.action='form.compatibility.revoked' OR NOT EXISTS(SELECT 1 FROM audit_logs revoked WHERE revoked.subject_id=v.id AND revoked.action='form.compatibility.revoked'))",
  'business.payout.requested': "SELECT p.created_request_id marker,s.user_id ownerId FROM payout_requests p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.status='submitted'",
  'business.payout.request.result': 'SELECT p.operation_request_id marker,s.user_id ownerId FROM payout_requests p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?',
  'business.payout.prepared': "SELECT p.created_request_id marker,s.user_id ownerId FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.status IN ('prepared','scheduled','approved')",
  'business.payout.result': 'SELECT p.operation_request_id marker,s.user_id ownerId FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?',
  'business.permissions.proposed': "SELECT id marker,NULL ownerId FROM staff_permission_requests WHERE id=? AND status='pending'",
  'business.permissions.changed': 'SELECT last_request_id marker,user_id ownerId FROM staff_permission_profiles WHERE user_id=?',
  'business.permissions.rejected': "SELECT id marker,proposed_by ownerId FROM staff_permission_requests WHERE id=? AND status='rejected'",
  'business.promotion.proposed': "SELECT created_request_id marker,NULL ownerId FROM promotions WHERE id=? AND status='pending_approval'",
  'business.promotion.result': "SELECT operation_request_id marker,created_by ownerId FROM promotions WHERE id=? AND status IN ('active','rejected')",
  'business.incident.updated': "SELECT a.request_id marker,i.owner_id ownerId FROM operational_incidents i JOIN audit_logs a ON a.subject_id=i.id AND a.action='incident.update' AND a.created_at=i.updated_at AND JSON_VALUE(a.next_json,'$.status')=i.status AND JSON_VALUE(a.next_json,'$.resolution')=i.resolution WHERE i.id=? AND NOT EXISTS(SELECT 1 FROM service_incident_legacy_links mapped WHERE mapped.legacy_incident_id=i.id)",
  'business.account.status': "SELECT a.request_id marker,u.id ownerId,u.status FROM users u JOIN audit_logs a ON a.subject_id=u.id AND a.action='user.status' AND a.created_at=u.updated_at WHERE u.id=?",
  'business.delivery.rates.changed': 'SELECT v.id marker,NULL ownerId FROM delivery_rate_versions v JOIN delivery_rate_current c ON c.version_id=v.id WHERE v.id=?',
  'business.order.pickup_ready': "SELECT DISTINCT fulfillment_request_id marker,NULL ownerId FROM order_items WHERE order_id=? AND fulfillment_status='ready_for_pickup'",
  'business.exception.assigned': "SELECT e.id marker,w.owner_id ownerId FROM exception_work_items w JOIN exception_work_events e ON e.work_id=w.id WHERE w.id=? AND w.status='open' AND COALESCE(JSON_VALUE(e.payload_json,'$.version'),-1)+1=w.version AND e.owner_id=w.owner_id",
};

const dynamicOperationalSources=new Set(['business.workflow.assignment','business.team.governance','business.team.handoff','business.system.incident','business.programme.updated','business.finance.refund','business.finance.payout','business.finance.fee_refund_authorized','business.finance.invoice_adjustment','business.finance.funding_verified','business.seller.live_clearance','business.company.live_financial_scope','business.workflow.reminder','business.system.email_health']);
export const hasOperationalNoticeSource = (template: string) => Object.hasOwn(operationalSources, template)||dynamicOperationalSources.has(template);
dynamicOperationalSources.add('business.gift.issued');dynamicOperationalSources.add('business.gift.redeemed');

export async function isCurrentCaseNotice(db: D1Database, notice: {
  template: string; relatedId: string | null; userId: string | null; audience: string; channel: string; requestId: string; requiredPermission?: string | null;
}): Promise<boolean> {
  if (!['business.return_request.update', 'business.complaint.update'].includes(notice.template)) return true;
  if (!notice.relatedId) return false;
  const table = notice.template === 'business.return_request.update' ? 'return_requests' : 'complaints';
  const source = await db.prepare(`SELECT operation_request_id marker FROM ${table} WHERE id=?`).bind(notice.relatedId).first<{marker:string|null}>();
  if (!source?.marker) return false;
  const key = notice.audience === 'staff'
    ? notice.requiredPermission === 'refund.approve.high_value' ? `high-value:${notice.userId}` : notice.userId
    : notice.audience === 'seller' ? 'seller' : notice.userId ? 'customer' : 'guest';
  return !!key && notice.requestId === await operationalNotificationRequestId(notice.template, source.marker, key, notice.channel);
}

export async function operationalNotificationRequestId(template: string, eventId: string, recipientKey: string, channel: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([template, eventId, recipientKey])));
  return `business:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}:${channel}`;
}

export async function isCurrentOperationalNotice(db: D1Database, notice: {
  template: string; relatedId: string | null; relatedType?: string | null; userId: string | null; audience: string; channel: string; requestId: string;
},now=Date.now()): Promise<boolean> {
  if(notice.template==='business.gift.issued'||notice.template==='business.gift.redeemed')return(await import('../gift-cards/notice-sources')).isCurrentGiftNotice(db,notice);
  if(notice.template==='business.workflow.assignment')return(await import('./review-task-assignment-notices')).isCurrentReviewAssignmentNotice(db,notice,now);
  if(notice.template==='business.team.governance'||notice.template==='business.team.handoff')return(await import('./team-notice-sources')).isCurrentTeamNotice(db,notice,now);
  if(notice.template==='business.system.incident')return(await import('./incident-review')).isCurrentIncidentNotice(db,notice,now);
  if(notice.template==='business.system.email_health')return (await import('./service-health-notifications')).isCurrentHealthNotice(db,notice);
  if(notice.template==='business.programme.updated')return (await import('./programme-notice-sources')).isCurrentProgrammeNotice(db,notice,now);
  if(notice.template==='business.workflow.reminder')return (await import('./reminder-notice-sources')).isCurrentReminderNotice(db,notice,now);
  if(['business.finance.refund','business.finance.payout','business.finance.fee_refund_authorized','business.finance.invoice_adjustment','business.finance.funding_verified','business.seller.live_clearance','business.company.live_financial_scope'].includes(notice.template))return (await import('./financial-notice-sources')).isCurrentFinancialNotice(db,notice,now);
  if(notice.template==='business.cancellation.updated')return (await import('../cancellation/notifications')).currentCancellationNotice(db,notice);
  if (!hasOperationalNoticeSource(notice.template)) return true;
  if (!notice.relatedId || !notice.userId) return false;
  if(notice.template==='business.seller.live_activation'){
    if(notice.relatedType!=='managed_live_activation'||!['seller','staff'].includes(notice.audience))return false;
    const source=await db.prepare('SELECT seller_id sellerId FROM managed_live_activation_decisions WHERE id=?').bind(notice.relatedId).first<{sellerId:string}>();if(!source)return false;
    if(notice.audience==='staff'){try{await(await import('../managed-commerce/live-activation-support')).managedLiveAuthority(db,notice.userId,source.sellerId);}catch(error){if(error instanceof Error&&'status' in error&&error.status===403)return false;throw error;}}
    const current=await(await import('../managed-commerce/live-readiness')).readManagedLiveEligibility(db,source.sellerId,now);if(!current.enabled||current.decision?.id!==notice.relatedId)return false;
  }
  if(notice.template==='business.seller.recovery.claim'&&notice.audience==='staff'&&!await db.prepare(`SELECT 1 FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE q.id=? AND q.submitted_by<>? AND s.user_id<>?
    AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders original_order ON original_order.id=r.order_id WHERE r.id=c.refund_id AND original_order.customer_id=?)`).bind(notice.relatedId,notice.userId,notice.userId,notice.userId).first())return false;
  if(notice.template==='business.seller.recovery'&&notice.audience==='staff'&&!await db.prepare(`SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND s.user_id<>?
    AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders original_order ON original_order.id=r.order_id WHERE r.id=c.refund_id AND original_order.customer_id=?)`).bind(notice.relatedId,notice.userId,notice.userId).first())return false;
  if(notice.template==='business.product.discount_suggestion'){
    const source=await import('../products/discount-advisory-store');if(!await source.currentDiscountAdvisory(db,notice.relatedId,now)||notice.audience==='staff'&&!await source.currentDiscountStaffRecipient(db,notice.relatedId,notice.userId))return false;
  }
  if(['business.order.response','business.order.preparation_update'].includes(notice.template)&&!await(await import('../orders/response-notifications')).currentResponseNotice(db,notice.relatedId))return false;
  if(notice.template==='business.payment.reminder'&&!await(await import('../payments/payment-maintenance')).isCurrentPaymentReminder(db,notice.relatedId,now))return false;
  if(['business.fee.terms','business.fee.followup'].includes(notice.template)&&!await(await import('../commission/terms-followup')).currentFeeEvent(db,notice.relatedId,now))return false;
  if(notice.template==='business.fee.holds'&&!await(await import('../commission/terms-followup')).currentFeeHoldBatch(db,notice.relatedId,now))return false;
  const sql = operationalSources[notice.template].replaceAll('JSON_VALUE(', (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE(' : 'json_extract(');
  const sources = await db.prepare(sql).bind(notice.relatedId)
    .all<{marker:string|null;ownerId:string|null;status?:string}>();
  for (const source of sources.results) {
    if (!source.marker || notice.audience !== 'staff' && source.ownerId !== notice.userId) continue;
    if (notice.template === 'business.account.status' && notice.relatedType !== `account_status_${source.status}`) continue;
    const keys = source.ownerId === notice.userId ? ['owner', notice.userId] : [notice.userId];
    for (const key of keys)
      if (notice.requestId === await operationalNotificationRequestId(notice.template, source.marker, key, notice.channel)) {
        if(['business.product.priority','business.product.availability','business.product.intake'].includes(notice.template)){
          const intake=notice.template==='business.product.intake',priority=notice.template==='business.product.priority',productSql=priority?'(SELECT product_id FROM product_priority_cases WHERE id=?)':'?',markerSql=intake?'EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND last_event_id=?)':priority?'EXISTS(SELECT 1 FROM product_priority_cases WHERE id=? AND last_event_id=?)':'EXISTS(SELECT 1 FROM product_availability_states WHERE product_id=? AND last_event_id=?)';
          const party=notice.audience==='staff'?(intake?independentProductIntakeStaffSql('?','?'):independentProductStaffSql(productSql,'?')): [intake?'EXISTS(SELECT 1 FROM product_intake_cases recipient_case JOIN product_intake_drafts recipient_draft ON recipient_draft.id=recipient_case.draft_id WHERE recipient_case.id=? AND recipient_draft.owner_id=?)':`EXISTS(SELECT 1 FROM products recipient_product JOIN seller_profiles recipient_seller ON recipient_seller.id=recipient_product.seller_id WHERE recipient_product.id=${productSql} AND recipient_seller.user_id=?)`];
          // Final native proof follows the async request hash: never return an
          // old staff copy after this exact source becomes personally owned.
          return !!await db.prepare(`SELECT 1 WHERE ${markerSql} AND ${party.map(predicate=>'('+predicate+')').join(' AND ')}`).bind(notice.relatedId,source.marker,...party.flatMap(()=>[notice.relatedId,notice.userId])).first();
        }
        return true;
      }
  }
  return false;
}

// Preserve existing request identities so a release/retry cannot re-enqueue
// already-created notifications under a newly invented key algorithm.
export async function catalogNotificationRequestId(template: string, eventId: string, recipientKey: string, audience: string, channel: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([template, eventId, recipientKey, audience])));
  return `business:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}:${channel}`;
}

export async function isCurrentCatalogNotice(db: D1Database, notice: {
  template: string; relatedId: string | null; userId: string | null; audience: string; channel: string; requestId: string;
}): Promise<boolean> {
  if (!Object.hasOwn(catalogReviewEvents, notice.template)) return true;
  if (!notice.relatedId || !notice.userId) return false;
  const event = catalogReviewEvents[notice.template as keyof typeof catalogReviewEvents];
  const source = await db.prepare(event.source === 'product'
    ? `SELECT p.status,p.review_request_id AS eventId,s.user_id AS ownerId,NULL AS stage FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?`
    : `SELECT s.status,s.review_request_id AS eventId,s.user_id AS ownerId,p.application_stage AS stage FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=?`)
    .bind(notice.relatedId).first<{status:string;eventId:string|null;ownerId:string;stage:string|null}>();
  if (!source) return false;
  if (notice.audience !== 'staff' && source.ownerId !== notice.userId) return false;
  if (event.purpose === 'review' && (source.status !== 'submitted' || source.stage && !['draft', 'submitted'].includes(source.stage))) return false;
  if (event.purpose === 'outcome' && !source.eventId) return false;
  return notice.requestId === await catalogNotificationRequestId(notice.template, source.eventId ?? notice.relatedId,
    notice.audience === 'staff' ? notice.userId : 'owner', notice.audience, notice.channel);
}
