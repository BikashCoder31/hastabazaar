import { listSellerReviewTasks } from '../workflows/review-tasks';
import { sellerReviewSnapshotSql } from './workspace-review-sources';
import { readOrderResponsePortion } from '../orders/response-workflow';
import { readRecoveryFollowup } from '../payments/recovery-followup';
import { getRecoveryRepaymentView } from '../payments/recovery-repayments';
export class SellerTaskAccessError extends Error {
}
export type SellerTaskFamily = 'review' | 'order' | 'return' | 'complaint' | 'cancellation' | 'payout' | 'recovery' | 'product';
export interface SellerWorkspaceTask {
    key: string;
    family: SellerTaskFamily;
    sourceId: string;
    reference: string;
    title: string;
    status: string;
    nextActor: string;
    sellerActionRequired: boolean;
    group: 'required' | 'waiting' | 'history' | 'suggestion';
    severity: 'urgent' | 'overdue' | 'normal';
    startedAt: number;
    updatedAt: number;
    dueAt: number | null;
    nextUpdateAt: number | null;
    href: string;
}
type Row = Record<string, string | number | null> & {
    id: string;
    stamp: string;
};
type Capture = {
    family: SellerTaskFamily;
    sql: string;
    values: unknown[];
    rows: Row[];
};
const terminal = new Set(['resolved', 'closed', 'rejected', 'cancelled', 'completed', 'delivered', 'paid', 'recorded_paid', 'settled', 'no_longer_needed']);
const n = (value: unknown) => value === null || value === undefined ? null : Number(value);
const s = (value: Row[string] | undefined) => String(value ?? '');
function actorSql(db:D1Database){const maria=(db as D1Database&{dialect?:string}).dialect==='mariadb',exact=(column:string,value:string)=>maria?'BINARY '+column+'=BINARY '+value:column+' COLLATE BINARY='+value;return "SELECT u.id,u.auth_subject AS subject,s.id AS sellerId,s.user_id AS ownerId,json_array(u.id,u.status,u.auth_subject,s.id,s.user_id) AS stamp FROM users u LEFT JOIN seller_profiles s ON s.user_id=u.id WHERE u.id=? AND "+exact('u.status',"'active'")+" AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND ("+exact('r.role',"'customer'")+" OR "+exact('r.role',"'seller'")+")) ORDER BY s.id";}
const livePayoutSql = `SELECT p.id,p.payout_number AS reference,p.amount_paisa AS amountPaisa,p.created_at AS startedAt,p.updated_at AS updatedAt,
 CASE WHEN p.status='paid' THEN CASE WHEN EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND t.state='paid' AND t.bank_at IS NOT NULL AND t.transaction_identity IS NOT NULL AND t.evidence_reference IS NOT NULL) THEN 'paid' ELSE 'recorded_paid' END ELSE COALESCE((SELECT t.state FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id ORDER BY t.prepared_at DESC,t.id DESC LIMIT 1),p.status) END AS status,
 json_array(p.id,p.status,p.amount_paisa,p.updated_at,(SELECT SUM(t.revision) FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id),(SELECT COUNT(*) FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id)) AS stamp
 FROM managed_payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id=? AND p.record_kind='live'`;
function orderKey(task: SellerWorkspaceTask) { const group = task.group === 'required' ? (task.family === 'order' || task.family === 'return' || task.family === 'complaint' || task.family === 'cancellation' ? 0 : task.severity !== 'normal' ? 0 : 1) : task.group === 'waiting' ? 3 : task.group === 'suggestion' ? 4 : 5; return [group, task.severity === 'urgent' ? 0 : task.severity === 'overdue' ? 1 : 2, task.dueAt ?? task.nextUpdateAt ?? Number.MAX_SAFE_INTEGER, task.startedAt, task.key] as const; }
function compare(a: readonly (number | string)[], b: readonly (number | string)[]) { for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i])
        continue;
    return a[i] < b[i] ? -1 : 1;
} return 0; }
function cursorKey(cursor: string | undefined, actorId: string, view: string) { if (!cursor)
    return null; try {
    const parsed = JSON.parse(decodeURIComponent(cursor));
    if (parsed.actorId !== actorId || parsed.view !== view || !Array.isArray(parsed.key) || parsed.key.length !== 5 || parsed.key.slice(0, 4).some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v)) || typeof parsed.key[4] !== 'string')
        throw new Error();
    return parsed.key as (number | string)[];
}
catch {
    throw new SellerTaskAccessError('This request-list position is invalid. Open the current list again.');
} }
/** Owner-only presentation of retained native records. No task, money, reminder or benefit is written. */
export async function readSellerWorkspaceTasks(db: D1Database, actorId: string, options: {
    now?: number;
    limit?: number;
    cursor?: string;
    view?: 'active' | 'all';
} = {}) {
    const now = options.now ?? Date.now(), limit = options.limit ?? 20, view = options.view ?? 'active';
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !['active', 'all'].includes(view))
        throw new SellerTaskAccessError('Use a supported request-list view.');
    const after = cursorKey(options.cursor, actorId, view), actor = (await db.prepare(actorSql(db)).bind(actorId).all<Row>()).results;
    if (!actor.length || actor.some(row => row.id !== actorId || row.ownerId!==null&&row.ownerId!==actorId))
        throw new SellerTaskAccessError('Current account access is required.');
    const tasks: SellerWorkspaceTask[] = [], unavailableFamilies: SellerTaskFamily[] = [], captures: Capture[] = [], proofIds=new Map<string,string>();
    async function family(name: SellerTaskFamily, sql: string, build: (rows: Row[]) => Promise<void> | void) { try {
        const rows = (await db.prepare(sql).bind(actorId).all<Row>()).results;
        const before = tasks.length;
        try {
            await build(rows);
            captures.push({ family: name, sql, values: [actorId], rows });
        }
        catch (error) {
            tasks.splice(before);
            throw error;
        }
    }
    catch {
        unavailableFamilies.push(name);
    } }
    function add(family: SellerTaskFamily, row: Row, title: string, nextActor: string, action: boolean, href: string, extra: Partial<SellerWorkspaceTask> = {}) { const status = s(row.status), dueAt = n(row.dueAt), nextUpdateAt = n(row.nextUpdateAt); const task:SellerWorkspaceTask={ key: family + ':' + row.id, family, sourceId: row.id, reference: s(row.reference) || row.id, title, status, nextActor, sellerActionRequired: action, group: terminal.has(status) ? 'history' : action ? 'required' : 'waiting', severity: action && dueAt !== null && dueAt < now ? 'overdue' : 'normal', startedAt: Number(row.startedAt ?? 0), updatedAt: Number(row.updatedAt ?? row.startedAt ?? 0), dueAt, nextUpdateAt, href, ...extra };tasks.push(task);proofIds.set(task.key,row.id); }
    await family('review', sellerReviewSnapshotSql, async (rows) => {
        for (const task of await listSellerReviewTasks(db, actorId)) {
            const action = task.status === 'waiting_on_seller'&&task.sourceStatus!=='unavailable';
            add('review', { id: task.id, stamp: '', status: task.sourceStatus, reference: task.sourceId, startedAt: task.startedAt, updatedAt: task.triagedAt ?? task.startedAt, dueAt: null, nextUpdateAt: action ? null : task.nextUpdateAt ?? task.dueAt }, task.title, action ? 'You' : task.nextActor === 'You' ? 'You' : 'Hastabazaar', action, task.sourceType==='seller_document'?'/seller/registration#document-'+encodeURIComponent(task.sourceId):task.sourceType==='commission_terms'&&rows.find(row=>row.id===task.id)?.termsRoute==='managed_maker'?'/sell/application#selling-fee-terms':task.href, {sourceId:task.sourceId,key:'review:'+task.sourceType+':'+task.sourceId+':'+task.sourceRevision, group: task.status === 'completed' || task.status === 'no_longer_needed' ? 'history' : action ? 'required' : 'waiting', severity: task.priority ? 'urgent' : 'normal' });
        }
    });
    await family('complaint', `SELECT c.id,c.reference_number AS reference,c.subject AS title,c.status,c.seller_response AS responded,c.priority,c.created_at AS startedAt,COALESCE((SELECT MAX(e.created_at) FROM complaint_events e WHERE e.complaint_id=c.id AND e.action<>'admin_assign_to_me'),c.created_at) AS updatedAt,c.waiting_for AS waitingFor,c.clarification_due_at AS dueAt,c.next_update_at AS nextUpdateAt,json_array(c.id,c.status,c.followup_revision,c.seller_response,c.waiting_for,c.clarification_due_at,c.next_update_at,c.updated_at,c.seller_id) AS stamp FROM complaints c JOIN seller_profiles s ON s.id=c.seller_id WHERE s.user_id=?`, rows => { for (const row of rows) {
        const action = !terminal.has(s(row.status)) && (row.responded === null || row.waitingFor === 'seller');
        add('complaint', row, s(row.title), 'Hastabazaar', action, '/seller/cases/complaints/' + encodeURIComponent(row.id), { nextActor: action ? 'You' : row.waitingFor === 'customer' ? 'Customer' : row.waitingFor === 'carrier' ? 'Carrier' : 'Hastabazaar', dueAt: action && row.waitingFor === 'seller' ? n(row.dueAt) : null, severity: action && (row.priority === 'urgent' || row.priority === 'critical') ? 'urgent' : action && row.waitingFor === 'seller' && n(row.dueAt) !== null && Number(row.dueAt) < now ? 'overdue' : 'normal' });
    } });
    await family('return', `SELECT r.id,r.reference_number AS reference,i.product_name_snapshot AS title,r.status,r.seller_response AS responded,r.requested_at AS startedAt,COALESCE((SELECT MAX(e.created_at) FROM return_request_events e WHERE e.return_request_id=r.id),r.requested_at) AS updatedAt,h.waiting_for AS waitingFor,h.clarification_due_at AS dueAt,h.next_update_at AS nextUpdateAt,json_array(r.id,r.status,r.seller_response,r.updated_at,i.seller_id,h.revision,h.waiting_for,h.clarification_due_at,h.next_update_at) AS stamp FROM return_requests r JOIN order_items i ON i.id=r.order_item_id JOIN seller_profiles s ON s.id=i.seller_id LEFT JOIN return_handling h ON h.case_id=r.id WHERE s.user_id=?`, rows => { for (const row of rows) {
        const action = !terminal.has(s(row.status)) && (row.status === 'requested' && row.responded === null || row.waitingFor === 'seller');
        add('return', row, 'Return: ' + s(row.title), action ? 'You' : row.waitingFor === 'customer' ? 'Customer' : row.waitingFor === 'carrier' ? 'Carrier' : 'Hastabazaar', action, '/seller/cases/returns/' + encodeURIComponent(row.id), { dueAt: action && row.waitingFor === 'seller' ? n(row.dueAt) : null });
    } });
    await family('order', `SELECT p.id,o.order_number AS reference,o.id AS orderId,o.status,p.created_at AS startedAt,o.updated_at AS updatedAt,(SELECT MIN(c.next_update_at) FROM order_response_cases c WHERE c.portion_id=p.id AND c.state NOT IN('resolved','closed')) AS nextUpdateAt,(SELECT c.id FROM order_response_cases c WHERE c.portion_id=p.id AND c.state NOT IN('resolved','closed') ORDER BY c.created_at,c.id LIMIT 1) AS caseId,json_array(p.id,p.seller_id,p.operator_mode,o.status,o.updated_at,(SELECT COALESCE(SUM(c.revision),0)+COUNT(*) FROM order_response_cases c WHERE c.portion_id=p.id),(SELECT SUM(r.revision) FROM order_response_items r WHERE r.portion_id=p.id),(SELECT COUNT(*) FROM order_response_items r WHERE r.portion_id=p.id),(SELECT COALESCE(SUM(h.revision),0)+COUNT(*) FROM order_fulfillment_holds h JOIN order_response_items r ON r.order_item_id=h.order_item_id WHERE r.portion_id=p.id)) AS stamp FROM order_response_portions p JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id=? AND p.operator_mode='seller'`, async (rows) => { for (const row of rows) {
        const portion = await readOrderResponsePortion(db, row.id);
        if (!portion)
            throw new Error('Original released scope unavailable');
        if (!portion.items.length)
            continue;
        const unanswered = portion.items.filter(item => item.status === 'confirmed' && !item.clock.responded), packing = portion.items.some(item => item.status === 'packing' && !item.clock.paused), action = !terminal.has(s(row.status)) && (packing || unanswered.some(item => !item.clock.paused));
        add('order', row, packing ? 'Continue packing' : 'Order preparation', action ? 'You' : row.caseId || unanswered.length ? 'Hastabazaar' : portion.items.some(item=>item.status==='dispatched') ? 'Carrier' : 'Hastabazaar', action, row.caseId ? '/seller/order-responses/' + encodeURIComponent(s(row.caseId)) : '/seller/orders/' + encodeURIComponent(s(row.orderId)), { severity: unanswered.some(item => item.clock.escalationDue) ? 'urgent' : unanswered.some(item => item.clock.reminderDue) ? 'overdue' : 'normal', startedAt: Math.min(...portion.items.map(item => item.releasedAt)), status: action ? packing ? 'packing' : 'response_needed' : unanswered.some(item => item.clock.paused) ? 'held' : s(row.status) });
    } });
    const cancellationScope=(db as D1Database&{dialect?:string}).dialect==='mariadb'?"JSON_CONTAINS(c.seller_ids_json,JSON_QUOTE(i.seller_id))=1":"EXISTS(SELECT 1 FROM json_each(c.seller_ids_json) scoped_seller WHERE scoped_seller.value=i.seller_id COLLATE BINARY)";
    await family('cancellation', `SELECT c.id,o.id AS orderId,o.order_number AS reference,c.status,c.created_at AS startedAt,o.updated_at AS updatedAt,c.next_update_at AS nextUpdateAt,json_array(c.id,c.revision,c.status,c.next_update_at,o.updated_at) AS stamp FROM order_cancellation_reviews c JOIN orders o ON o.id=c.order_id WHERE EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=o.id AND s.user_id=? AND ${cancellationScope})`, rows => { for (const row of rows)
        add('cancellation', row, 'Cancellation review', 'Hastabazaar', false, '/seller/orders/' + encodeURIComponent(s(row.orderId)),{group:row.status==='pending'?'waiting':'history'}); });
    await family('payout', `SELECT q.id,q.status,q.created_at AS startedAt,q.first_finance_due_at AS nextUpdateAt,p.status AS payoutStatus,(SELECT t.state FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id ORDER BY t.prepared_at DESC,t.id DESC LIMIT 1) AS packetState,EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state='paid' AND t.bank_at IS NOT NULL AND t.transaction_identity IS NOT NULL AND t.evidence_reference IS NOT NULL) AS paidCurrent,json_array(q.id,q.status,q.payout_id,q.first_finance_due_at,p.status,p.updated_at,(SELECT COALESCE(SUM(t.revision),0)+COUNT(*) FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id)) AS stamp FROM payout_requests q JOIN seller_profiles s ON s.id=q.seller_id LEFT JOIN payouts p ON p.id=q.payout_id WHERE s.user_id=?`, rows => { for (const row of rows)
        add('payout', row, 'Seller earnings payout', 'Hastabazaar', false, '/seller/finance#payout-request-' + encodeURIComponent(row.id), { status: row.payoutStatus==='paid'?(row.paidCurrent?'paid':'recorded_paid'):s(row.packetState)||s(row.payoutStatus)||s(row.status),nextUpdateAt:row.status==='submitted'?n(row.nextUpdateAt):null, group: terminal.has(row.payoutStatus==='paid'?'paid':s(row.packetState)||s(row.payoutStatus)||s(row.status)) ? 'history' : 'waiting' }); });
    await family('payout', livePayoutSql, rows => { for (const row of rows)
        add('payout', row, 'Live maker payout', 'Hastabazaar', false, '/seller/finance#live-payout-' + encodeURIComponent(row.id), { key: 'payout:live:' + row.id }); });
    await family('recovery', `SELECT c.id,c.state AS status,c.created_at AS startedAt,c.updated_at AS updatedAt,json_array(c.id,c.revision,c.state,c.updated_at,(SELECT MAX(e.revision) FROM seller_recovery_events e WHERE e.case_id=c.id)) AS stamp FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE s.user_id=?`, async (rows) => { for (const row of rows) {
        const followup = await readRecoveryFollowup(db, row.id, now), installment = followup.installments.find(item => item.collectiblePaisa > 0), action = followup.phase !== 'reconciliation' && (followup.needsResponse && followup.responseDueAt!==null || !!installment), due = followup.needsResponse ? followup.responseDueAt : installment?.dueAt ?? null;
        add('recovery', row, 'Recovery statement', action ? 'You' : 'Hastabazaar', action, '/seller/finance/recoveries/' + encodeURIComponent(row.id), { status: followup.phase, dueAt: due, nextUpdateAt: action ? null : followup.reviewDueAt ?? followup.nextActionAt, group: followup.phase === 'closed' ? 'history' : action ? 'required' : 'waiting', severity: due !== null && due < now ? 'overdue' : 'normal' });
    } });
    await family('recovery', `SELECT q.id,q.case_id AS caseId,q.status,q.created_at AS startedAt,q.next_review_at AS nextUpdateAt,json_array(q.id,q.revision,q.status,q.receipt_id,(SELECT COUNT(*) FROM company_receipt_reversals v WHERE v.receipt_id=q.receipt_id),c.revision) AS stamp FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE s.user_id=? AND q.submitted_by=s.user_id`, async (rows) => { const views = new Map<string, Awaited<ReturnType<typeof getRecoveryRepaymentView>>>(); for (const row of rows) {
        const caseId = s(row.caseId);
        if (!views.has(caseId))
            views.set(caseId, await getRecoveryRepaymentView(db, actorId, caseId));
        const claim = views.get(caseId)!.claims.find(value => value.id === row.id);
        if (!claim)
            continue;
        add('recovery', row, 'Repayment claim', claim.status === 'needs_evidence' ? 'You' : 'Hastabazaar', claim.status === 'needs_evidence', '/seller/finance/recoveries/claims/' + encodeURIComponent(row.id), { key: 'recovery:claim:' + row.id, status: claim.status, group: ['receipt_verified', 'not_received'].includes(claim.status) ? 'history' : claim.status === 'needs_evidence' ? 'required' : 'waiting' });
    } });
    await family('product', `SELECT p.id,p.name_en AS title,p.status,p.created_at AS startedAt,p.updated_at AS updatedAt,json_array(p.id,p.seller_id,p.status,p.updated_at,p.inventory_quantity) AS stamp FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id=? AND p.status IN('draft','needs_changes')`, rows => { for (const row of rows) {
        if (tasks.some(task => task.family === 'review' && task.reference === row.id))
            continue;
        add('product', row, s(row.title), row.status === 'needs_changes' ? 'You' : 'You', row.status === 'needs_changes', '/seller/products/' + encodeURIComponent(row.id) + '/edit', { group: row.status === 'draft' ? 'suggestion' : 'required' });
    } });
    const ordered = tasks.filter(task => view === 'all' || task.group !== 'history').sort((a, b) => compare(orderKey(a), orderKey(b))), remaining = after ? ordered.filter(task => compare(orderKey(task), after) > 0) : ordered, page = remaining.slice(0, limit);
    // One final read statement fences actor, native ownership and every displayed source snapshot.
    const clauses = [actorSql(db)], values: unknown[] = [actorId], expected = actor.map(row => ({ family: 'actor', id: row.id, stamp: row.stamp }));
    const selects = ["SELECT 'actor' AS family,identity_source.id,identity_source.stamp FROM (" + clauses[0] + ') identity_source'];
    for (const capture of captures) {
        const ids = page.filter(task => task.family === capture.family).map(task => proofIds.get(task.key)??task.sourceId), rows = capture.rows.filter(row => ids.includes(row.id));
        if (!rows.length)
            continue;
        selects.push('SELECT ? AS family,original_source.id,original_source.stamp FROM (' + capture.sql + ') original_source WHERE original_source.id IN(' + rows.map(() => '?').join(',') + ')');
        values.push(capture.family, ...capture.values, ...rows.map(row => row.id));
        expected.push(...rows.map(row => ({ family: capture.family, id: row.id, stamp: row.stamp })));
    }
    const actual = (await db.prepare(selects.join(' UNION ALL ')).bind(...values).all<{
        family: string;
        id: string;
        stamp: string;
    }>()).results, normalize = (rows: typeof actual) => JSON.stringify(rows.map(row => [row.family, row.id, row.stamp]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if (normalize(actual) !== normalize(expected))
        throw new SellerTaskAccessError('Account or original work changed while loading. Refresh the current workspace.');
    const hasMore = remaining.length > page.length, last = page.at(-1);
    return { tasks: page, nextCursor: hasMore && last ? encodeURIComponent(JSON.stringify({ actorId, view, key: orderKey(last) })) : null, hasMore, unavailableFamilies, observedAt: now, view };
}
export type SellerWorkspaceTasks = Awaited<ReturnType<typeof readSellerWorkspaceTasks>>;
/** Final page composition fence, after other private seller readers have completed. */
export async function assertSellerWorkspaceViewer(db: D1Database, actorId: string, sellerId: string, authSubject?: string) {
    const row = await db.prepare('SELECT * FROM ('+actorSql(db)+') current_viewer WHERE sellerId=?').bind(actorId, sellerId).first<{
        id: string;
        subject: string | null;
        sellerId: string;
        ownerId: string;
    }>();
    if (!row || row.id !== actorId || row.ownerId !== actorId || row.sellerId !== sellerId || authSubject !== undefined && row.subject !== authSubject)
        throw new SellerTaskAccessError('Current owner access changed. Refresh this workspace.');
}
export async function readSellerLivePayoutHistory(db: D1Database, actorId: string, sellerId: string) {
    const rows = (await db.prepare(livePayoutSql).bind(actorId).all<Row>()).results;
    const repeated = (await db.prepare(livePayoutSql).bind(actorId).all<Row>()).results;
    if (JSON.stringify(rows) !== JSON.stringify(repeated))
        throw new SellerTaskAccessError('Original payout changed while loading. Refresh its current status.');
    await assertSellerWorkspaceViewer(db, actorId, sellerId);
    return rows.map(row => ({ id: row.id, reference: s(row.reference), status: s(row.status), amountPaisa: Number(row.amountPaisa), createdAt: Number(row.startedAt) }));
}
