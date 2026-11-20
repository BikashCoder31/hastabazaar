import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { hostedSessionHash } from '../lib/auth/hosted-session';
import { getManagedMakerApplicationTerms } from '../lib/db/repositories/managed-maker-details';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { deliverBusinessEmails } from '../lib/operations/business-notifications';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { fakeProviderMail } from './helpers/fake-provider-mail';

const origin = 'https://seller-registration-email.example.test';
const actor = { userId: 'applicant', authSubject: 'subject-applicant', email: 'sign-in@example.test' };
type Fixture = { db: D1Database; actor: typeof actor; origin: string; runtime?: string; send: (message: { to: string; text: string }) => Promise<void> };
declare global { var sellerRegistrationEmailFixture: Fixture; }

// Only identity and mail transport are fixtures. The OTP, submission and delivery use real repositories.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {
    url: `data:text/javascript,${encodeURIComponent(`export const env={
      get DB(){return globalThis.sellerRegistrationEmailFixture.db},
      get APP_ORIGIN(){return globalThis.sellerRegistrationEmailFixture.origin},
      get HASTABAZAAR_RUNTIME_ENV(){return globalThis.sellerRegistrationEmailFixture.runtime},
      EMAIL:{configured:true,send(message){return globalThis.sellerRegistrationEmailFixture.send(message)}}
    }`)}`,
    shortCircuit: true,
  };
  if (specifier === '@/lib/auth/customer') return {
    url: 'data:text/javascript,export class CustomerAuthorizationError extends Error{};export async function requireExistingCustomerApi(){return globalThis.sellerRegistrationEmailFixture.actor}',
    shortCircuit: true,
  };
  if (specifier === '@/lib/auth/seller-center') return {
    url: 'data:text/javascript,export class SellerCenterAuthorizationError extends Error{};export async function requireSellerCenterApi(){return globalThis.sellerRegistrationEmailFixture.actor}',
    shortCircuit: true,
  };
  return next(specifier, context);
} });

void test('only the verified seller email receives seller notices and the sign-in mailbox stays separate', async () => {
  const f = await companyStoreMakerFixture();
  try {
    f.sqlite.prepare("UPDATE users SET auth_subject='subject-reviewer' WHERE id='reviewer'").run();
    const selectedEmail = 'seller-updates@example.org';
    const sent: { to: string; text: string }[] = [];
    globalThis.sellerRegistrationEmailFixture = {
      db: f.db, actor, origin,
      async send(message) { sent.push(message); },
    };
    f.sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at)
      VALUES(?,?,?,'Fictional new seller','active',1,1)`).run(actor.userId, actor.authSubject, actor.email);
    f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'customer',1)").run(actor.userId);
    const headers = { origin, cookie: 'hastabazaar_session=fictional-registration-session' };
    const now = Date.now();
    f.sqlite.exec(`CREATE TABLE user_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
    f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(
      hostedSessionHash(new Headers(headers)), actor.userId, now + 60_000, now, now,
    );
    await startSellerRegistration(f.db, { userId: actor.userId, requestId: 'start-email-test', now });
    const emailApi = await import('../app/api/seller-registrations/email/route');
    const registration = await import('../app/api/seller-registrations/route');
    const accountVerification = await import('../app/api/account/contact-verification/route');
    const otp = (action: object) => new Request(origin + '/api/seller-registrations/email', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    const terms = await getManagedMakerApplicationTerms(f.db, now, MANAGED_SUPPLIER_AGREEMENT_VERSION);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      requestId: 'verified-seller-email', formVersion: '1', email: selectedEmail,
      hasBusinessTaxRegistration: 'no', managedAgreementAccepted: 'yes',
      managedAgreementContext: terms.context, managedAgreementVersion: terms.version,
      applicationAcknowledgement: 'yes',
    })) form.set(key, value);
    const submit = () => registration.POST(new Request(origin + '/api/seller-registrations', {
      method: 'POST', headers, body: form,
    }));
    assert.equal((await submit()).status, 409);

    const requested = await emailApi.POST(otp({ action: 'request', email: selectedEmail }));
    const challenge = await requested.json() as { token: string; capturedCode?: string };
    assert.equal(requested.status, 200);
    assert.equal(challenge.capturedCode, undefined, 'the provider response must never include the code');
    assert.deepEqual(sent.map(message => message.to), [selectedEmail]);
    const code = sent[0].text.match(/\b\d{6}\b/)?.[0];
    assert.ok(code);
    const wrongPurpose = await accountVerification.POST(otp({
      action: 'verify', channel: 'email', token: challenge.token, code,
    }));
    assert.equal(wrongPurpose.status, 409, 'the seller code cannot verify the sign-in mailbox');
    assert.equal((await emailApi.POST(otp({
      action: 'verify', email: 'another@example.test', token: challenge.token, code,
    }))).status, 409, 'the code is bound to the selected address');
    const verified = await emailApi.POST(otp({ action: 'verify', email: selectedEmail, token: challenge.token, code }));
    assert.equal(verified.status, 200, await verified.text());
    assert.equal(verified.headers.get('set-cookie'), null);
    assert.equal(f.sqlite.prepare('SELECT email FROM users WHERE id=?').get(actor.userId)?.email, actor.email);
    assert.equal(f.sqlite.prepare('SELECT 1 FROM account_email_verifications WHERE user_id=?').get(actor.userId), undefined);

    const submitted = await submit();
    assert.equal(submitted.status, 201, await submitted.text());
    const saved = await registration.GET();
    const state = await saved.json() as { registration: { answers: Record<string, string[]> } };
    assert.deepEqual(state.registration.answers.registrationEmail, [selectedEmail]);

    sent.length = 0;
    const mail = fakeProviderMail({ async send(message) { sent.push(message); } });
    await deliverBusinessEmails(f.db, mail, origin, { now: Date.now() + 1 });
    assert.ok(sent.some(message => message.to === selectedEmail && message.text.includes('Seller application submitted')));
    assert.ok(sent.some(message => message.to === 'reviewer@local.hastabazaar.test' && message.text.includes('Seller application review needed')));
    assert.ok(sent.every(message => message.to !== actor.email));

    const localOrigin = 'http://localhost:3018';
    const localSignIn = 'sign-in@local.hastabazaar.test';
    const localSellerEmail = 'seller-updates@local.hastabazaar.test';
    f.sqlite.prepare('UPDATE users SET email=? WHERE id=?').run(localSignIn, actor.userId);
    globalThis.sellerRegistrationEmailFixture = {
      db: f.db, actor: { ...actor, email: localSignIn }, origin: localOrigin, runtime: 'local_staging',
      async send() { assert.fail('Local capture must not call a provider'); },
    };
    const localRequest = (action: object) => new Request(localOrigin + '/api/seller-registrations/email', {
      method: 'POST', headers: { ...headers, origin: localOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    assert.equal((await emailApi.POST(localRequest({ action: 'request', email: 'live-address@example.org' }))).status, 409);
    const captured = await emailApi.POST(localRequest({ action: 'request', email: localSellerEmail }));
    const localChallenge = await captured.json() as { token: string; capturedCode: string };
    assert.equal(captured.status, 200, JSON.stringify(localChallenge));
    assert.match(localChallenge.capturedCode, /^\d{6}$/);
    const accountCapture = await import('../app/api/account/contact-verification/capture/route');
    const accountCodes = await accountCapture.GET(new Request(localOrigin + '/api/account/contact-verification/capture', {
      headers: { cookie: headers.cookie },
    }));
    assert.deepEqual(await accountCodes.json(), { captures: [] }, 'seller codes stay out of account verification');
    assert.equal((await emailApi.POST(localRequest({
      action: 'verify', email: localSellerEmail, token: localChallenge.token, code: localChallenge.capturedCode,
    }))).status, 200);
  } finally {
    f.dispose();
  }
});
