import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverOrderEmails } from '../lib/email/order-updates';
import { deliverBusinessEmails, supportedTemplates } from '../lib/operations/business-notifications';
import { releaseReferralRewards, ensureWallet } from '../lib/db/repositories/wallet';
import { messageEventCatalog, messageEventsForAudience } from '../lib/operations/message-event-catalog';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { completeVersionFixture } from './helpers/complete-version-fixture';

const origin = 'http://localhost:3018';

function capture() {
  const messages: { to: string; subject: string; text: string }[] = [];
  return {
    messages,
    mail: {
      transport: 'capture' as const, transportKey: 'fictitious-m3-capture', handoffAware: true,
      async send(message: (typeof messages)[number], context?: {beforeHandoff?: () => Promise<void>}) {
        await context?.beforeHandoff?.();
        messages.push(message);
        return { outcome: 'captured' as const, transport: 'capture' as const, receipt: 'm3-capture-only' };
      },
    },
  };
}

void test('the audience lists come from the same catalog as all supported native email families', () => {
  const known = new Set(messageEventCatalog.map(event => event.key));
  assert.deepEqual(supportedTemplates.filter(key => !known.has(key)), []);
  for (const [audience, label, other] of [
    ['customer', 'Courier booked', 'Review a seller payout request'],
    ['seller', 'Late order', 'Bank payment claim'],
    ['super_admin', 'Parcel problem', 'Wallet reward'],
  ] as const) {
    const events = messageEventsForAudience(audience);
    assert.ok(events.some(event => event.label === label));
    assert.ok(!events.some(event => event.label === other));
    assert.ok(events.every(event => event.channels.join(',') === 'in_app,email'));
  }
});

void test('bank checkout pairs order placement and bank instructions for its customer', async () => {
  const f = await manualOrderFixture();
  try {
    const rows = f.sqlite.prepare(`SELECT template_key,recipient_user_id,channel FROM notification_messages
      WHERE related_id=? AND audience_role='customer' ORDER BY template_key,channel`).all(f.orderId);
    assert.deepEqual(rows.map(row => [row.template_key, row.recipient_user_id, row.channel]), [
      ['business.payment.order', 'customer', 'email'], ['business.payment.order', 'customer', 'in_app'],
      ['order.placed', 'customer', 'in_app'],
    ]);
    const { messages, mail } = capture();
    const instructions = f.sqlite.prepare(`SELECT id FROM notification_messages WHERE channel='email'
      AND template_key='business.payment.order' AND related_id=? AND recipient_user_id='customer'
      AND subject_en='Bank payment instructions ready'`).get(f.orderId);
    assert.ok(typeof instructions?.id === 'string');
    const orderResult = await deliverOrderEmails(f.db, mail, origin, { now: Date.now() + 100, orderId: f.orderId });
    const businessResult = await deliverBusinessEmails(f.db, mail, origin, { now: Date.now() + 100, jobId: instructions.id, limit: 1 });
    const orderMail = messages.filter(message => message.to === 'customer@local.hastabazaar.test');
    assert.equal(orderMail.length, 2, JSON.stringify({ orderResult, businessResult, subjects: orderMail.map(message => message.subject) }));
    assert.ok(orderMail.some(message => message.subject.includes('· Order placed ·')));
    assert.ok(orderMail.some(message => message.subject.includes('· Pay within ') && message.text.includes('/account/payments/')));
  } finally {
    f.dispose();
  }
});

void test('a released referral reward queues both copies for its owner and capture reveals no referred order details', async () => {
  const f = await completeVersionFixture();
  try {
    await ensureWallet(f.db, 'foreign', f.now);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=?,updated_at=? WHERE id='legacy-order'").run(f.now, f.now);
    f.sqlite.prepare(`INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,currency,idempotency_key,created_at,updated_at)
      VALUES('wallet-payment','legacy-order','manual_cod','cod','captured',13050,'NPR','wallet-payment',?,?)`).run(f.now, f.now);
    f.sqlite.prepare(`INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at)
      VALUES('customer','foreign','legacy-order','9800000000',500,7,?)`).run(f.now);
    const availableAt = f.now + 8 * 86_400_000;
    await releaseReferralRewards(f.db, 'foreign', availableAt);
    await releaseReferralRewards(f.db, 'foreign', availableAt + 1);
    const rows = f.sqlite.prepare(`SELECT recipient_user_id,channel FROM notification_messages
      WHERE template_key='business.wallet.referral_reward' ORDER BY channel`).all();
    assert.deepEqual(rows.map(row => [row.recipient_user_id, row.channel]), [['foreign', 'email'], ['foreign', 'in_app']]);
    const { messages, mail } = capture();
    await deliverBusinessEmails(f.db, mail, origin, { now: availableAt + 2 });
    const rewardMessages = messages.filter(message => message.subject.includes('Referral reward added to your wallet'));
    assert.equal(rewardMessages.length, 1);
    assert.equal(rewardMessages[0].to, 'foreign@local.hastabazaar.test');
    assert.match(rewardMessages[0].text, /\/account\/wallet/);
    assert.doesNotMatch(rewardMessages[0].text, /legacy-order|FIX-LEGACY|9800000000|customer@/);
  } finally {
    f.dispose();
  }
});
