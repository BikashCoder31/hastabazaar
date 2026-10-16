import type { ManagedFinanceContext } from './payout-operations';
import { prepareManagedPayout, transitionManagedPayout, cancelManagedPayout, releaseManagedEligibility } from './payout-operations';
import { managedFinanceAction } from './finance-contract';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function handleManagedFinanceAction(db: D1Database, context: ManagedFinanceContext & { sellerId: string }, body: Record<string, unknown>) {
  const definition = managedFinanceAction(body.action);
  if (!definition || !context.form || context.form.formId !== definition.formId || Object.keys(body).some(key =>
    !['action','requestId','formVersion','customAnswers', ...definition.keys].includes(key)))
    return reply({ error: 'Invalid maker payment form request.' }, 400);
  if (typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.trim().length > 1000)
    return reply({ error: 'Add a review reason of 8–1,000 characters.' }, 400);
  if (!await db.prepare(`SELECT 1 FROM seller_profiles s WHERE s.id=? AND (
    EXISTS(SELECT 1 FROM seller_participation_profiles p WHERE p.seller_id=s.id AND p.participation_route='managed_maker')
    OR EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.seller_id=s.id))`).bind(context.sellerId).first())
    return reply({ error: 'Managed Maker financial records not found.' }, 404);
  const operation = { ...context, reason: body.reason };
  if (body.action === 'release_eligibility') {
    const receipt = await releaseManagedEligibility(db, operation);
    return reply({ ok: true, action: body.action, ...receipt });
  }
  if (body.action === 'prepare_sale_linked_payout') {
    if (typeof body.destinationReference !== 'string' || !Number.isSafeInteger(body.scheduledFor) || Number(body.scheduledFor) < 0 ||
      !Number.isSafeInteger(body.expectedAmountPaisa) || Number(body.expectedAmountPaisa) <= 0 ||
      typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedSnapshot))
      return reply({ error: 'Reload the balance preview and choose a valid Nepal-time processing date.' }, 400);
    const payoutId = await prepareManagedPayout(db, { ...operation, destinationReference: body.destinationReference,
      scheduledFor: Number(body.scheduledFor), expectedAmountPaisa: Number(body.expectedAmountPaisa), expectedSnapshot: body.expectedSnapshot });
    const row = await db.prepare(`SELECT next_json AS json FROM audit_logs WHERE request_id=? AND actor_id=?
      AND subject_type='managed_payout' AND subject_id=? AND action='managed_payout.prepared'`)
      .bind(context.requestId, context.actorId, payoutId).first<{ json: string }>();
    if (!row) return reply({ error: 'The payment result is uncertain. Retry the same recorded operation.' }, 503);
    const original = JSON.parse(row.json) as { status: string; amountPaisa: number };
    return reply({ ok: true, action: body.action, requestId: context.requestId, sellerId: context.sellerId,
      payoutId, status: original.status, amountPaisa: original.amountPaisa, simulation: true }, 201);
  }
  if (typeof body.payoutId !== 'string' || !body.payoutId || body.payoutId.length > 191 ||
    typeof body.expectedStatus !== 'string' || !['prepared','approved','processing','failed'].includes(body.expectedStatus))
    return reply({ error: 'Reload the payment and review its current status.' }, 400);
  if (!await db.prepare('SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=?').bind(body.payoutId, context.sellerId).first())
    return reply({ error: 'Payment not found for this maker.' }, 404);
  if (body.action === 'cancel_sale_linked_payout') {
    const receipt = await cancelManagedPayout(db, { ...operation, payoutId: body.payoutId, expectedStatus: body.expectedStatus });
    return reply({ ok: true, action: body.action, sellerId: context.sellerId, ...receipt });
  }
  if (body.action === 'record_sale_linked_payment' && (typeof body.providerReference !== 'string' || body.providerReference.trim().length < 3))
    return reply({ error: 'Record the simulated payment reference.' }, 400);
  const receipt = await transitionManagedPayout(db, { ...operation, payoutId: body.payoutId,
    expectedStatus: body.expectedStatus, action: body.action === 'approve_sale_linked_payout' ? 'approve' : 'mark_paid',
    providerReference: typeof body.providerReference === 'string' ? body.providerReference : undefined });
  return reply({ ok: true, action: body.action, sellerId: context.sellerId, ...receipt });
}
