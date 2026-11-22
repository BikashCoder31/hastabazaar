import assert from 'node:assert/strict';
import test from 'node:test';
import { customerRequestProgress, customerRequestTimeline, requestProgressForRecord } from '../components/commerce/customer-request-presentation';
import { addCustomerReturnClarification, createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { listCustomerRequestIndex, readCustomerAftercareContext, readOwnedCustomerRequest } from '../lib/returns/customer-aftercare-context';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';

void test('request actors follow the recorded review, reply, pickup, replacement and refund states', () => {
  const input = { kind: 'return' as const, status: 'under_investigation' };
  const expected = [
    [{ kind: 'complaint', status: 'open' }, 'hastabazaar', 0],
    [{ status: 'requested' }, 'seller', 1],
    [{ waitingFor: 'seller' }, 'seller', 1],
    [{ status: 'needs_customer_changes' }, 'you', 2],
    [{ kind: 'complaint', status: 'waiting_customer' }, 'you', 2],
    [{ kind: 'complaint', waitingFor: 'carrier' }, 'courier', 3],
    [{ waitingFor: 'platform' }, 'hastabazaar', 2],
    [{ status: 'rejected' }, 'done', 2],
    [{ kind: 'complaint', status: 'closed' }, 'done', 2],
    [{ status: 'approved' }, 'hastabazaar', 3],
    [{ status: 'in_transit' }, 'courier', 3],
    [{ phase: 'received' }, 'hastabazaar', 3],
    [{ phase: 'inspected' }, 'hastabazaar', 3],
    [{ outcome: 'replacement', replacementStatus: 'reserved' }, 'hastabazaar', 4],
    [{ outcome: 'replacement', replacementStatus: 'dispatched' }, 'courier', 4],
    [{ outcome: 'replacement', replacementStatus: 'delivered' }, 'hastabazaar', 4],
    [{ status: 'resolved', outcome: 'replacement', replacementStatus: 'delivered' }, 'done', 4],
    [{ refundStatus: 'payment_details_needed' }, 'you', 4],
    [{ status: 'resolved', refundStatus: 'returned_for_review' }, 'hastabazaar', 4],
    [{ refundStatus: 'confirmed_settled' }, 'done', 4],
    [{ refundStatus: 'corrected' }, 'done', 4],
  ] as const;
  for (const [record, actor, step] of expected) {
    const result = customerRequestProgress({ ...input, ...record });
    assert.deepEqual([result.actor, result.step], [actor, step], JSON.stringify(record));
  }
});

void test('the customer request shows the public conversation and stores evidence once on exact reply recovery', async () => {
  const fixture = await commerceOrderFixture();
  try {
    await fixture.deliver();
    const orderItemId = String(fixture.sqlite.prepare('SELECT id FROM order_items').get()!.id);
    const scope = { ...fixture.access, receiptTokenHash: null };
    const original = 'The delivered item has a crack in the handle that needs a refund.';
    const created = await createCustomerReturnRequest(fixture.database, {
      ...scope, orderItemId, quantity: 1, reason: 'damaged', requestedResolution: 'refund', detail: original,
      locale: 'en-NP', idempotencyKey: 'customer-redesign-original', evidence: [], now: Date.now(),
    });
    const request = { ...scope, returnRequestId: created.id, locale: 'en-NP' as const,
      message: 'The crack starts on the handle next to the painted edge.',
      requestId: 'customer-redesign-reply', now: Date.now() + 3 };
    const prompt = 'Please add a photo of the handle so we can review it.';
    const privateNote = 'Private supplier discussion recorded only for staff.';
    await reviewReturnAsAdmin(fixture.database, {
      returnRequestId: created.id, actorId: 'owner', actorRole: 'super_admin', action: 'request_changes',
      note: privateNote, publicMessageEn: prompt, publicMessageNe: 'कृपया ह्यान्डलको फोटो पठाउनुहोस्।',
      requestId: 'customer-redesign-clarification', now: request.now - 1,
    });
    const waiting = await readOwnedCustomerRequest(fixture.database, scope.customerId, 'return', created.id);
    assert.ok(waiting);
    assert.equal(requestProgressForRecord(waiting.record).actor, 'you');
    assert.ok(waiting.context?.events.some(event => event.message === prompt));
    assert.doesNotMatch(JSON.stringify(waiting), /Private supplier discussion/);
    assert.deepEqual(await listCustomerRequestIndex(fixture.database, 'other-shopper'), []);
    assert.equal(await readCustomerAftercareContext(fixture.database, { ...scope, customerId: 'other-shopper' }), null);
    assert.equal(await readOwnedCustomerRequest(fixture.database, 'other-shopper', 'return', created.id), null);

    const attachment = { id: 'first-photo', objectKey: 'private/return-evidence/test/photo',
      originalName: 'handle.png', mimeType: 'image/png', sizeBytes: 80, sha256: 'a'.repeat(64), nameSha256: 'b'.repeat(64) };
    assert.deepEqual(await addCustomerReturnClarification(fixture.database, { ...request, evidence: [attachment] }), { duplicate: false });
    const retry = { ...attachment, id: 'second-photo', objectKey: 'private/return-evidence/test/retry' };
    assert.deepEqual(await addCustomerReturnClarification(fixture.database, { ...request, evidence: [retry] }), { duplicate: true });
    await assert.rejects(addCustomerReturnClarification(fixture.database, { ...request, evidence: [{ ...retry, sha256: 'c'.repeat(64) }] }), /different clarification content/);
    await assert.rejects(addCustomerReturnClarification(fixture.database, { ...request, customerId: 'other-shopper' }), /unavailable/);
    const saved = await readOwnedCustomerRequest(fixture.database, scope.customerId, 'return', created.id);
    assert.ok(saved);
    assert.equal(requestProgressForRecord(saved.record).actor, 'hastabazaar');
    assert.deepEqual(saved.context?.photos.map(photo => photo.id), ['first-photo']);
    const timeline = customerRequestTimeline(saved.record, saved.context?.events ?? []);
    assert.ok(timeline.some(line => line.author === 'You' && line.message === original));
    assert.ok(timeline.some(line => line.author === 'You' && line.message === request.message));
    assert.ok(timeline.some(line => line.author === 'Hastabazaar' && line.message === prompt));
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id = ?').get(request.requestId)!.n, 1);
  } finally {
    await fixture.dispose();
  }
});
