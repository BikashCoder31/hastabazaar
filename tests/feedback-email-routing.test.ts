import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const {build} = require('esbuild') as typeof import('esbuild');
const feedback = {name: 'FICTIONAL QA CONTACT', email: 'qa-buyer@example.test', phone: '',
  topic: 'Website feedback', subject: 'FICTIONAL QA ONLY', orderReference: '',
  message: '<b>Fictional QA only</b>', pagePath: '/contact-us', rating: null};
type Message = {to: string; subject: string; text: string; html: string};

async function emailModule(origin: string | undefined, configured = true) {
  const messages: Message[] = [];
  const output = await build({
    entryPoints: ['lib/email/customer-feedback.ts'], absWorkingDir: process.cwd(),
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{name: 'feedback-email-boundary', setup(plugin) {
      plugin.onResolve({filter: /^cloudflare:workers$/}, (args) => ({path: args.path, namespace: 'feedback-env'}));
      plugin.onLoad({filter: /.*/, namespace: 'feedback-env'}, () => ({
        contents: 'export const env=globalThis.feedbackEnv;', loader: 'js',
      }));
    }}],
  });
  const feedbackModule = {exports: {} as {
    sendCustomerFeedbackEmail(value: typeof feedback): Promise<void>;
    FeedbackDeliveryUnavailableError: new (...args: string[]) => Error;
  }};
  runInNewContext(output.outputFiles[0].text, {require, module: feedbackModule, exports: feedbackModule.exports,
    feedbackEnv: {APP_ORIGIN: origin, EMAIL_DELIVERY_CONFIGURED: 'false',
      EMAIL: {configured, async send(message: Message) {messages.push(message);}}},
  });
  return {...feedbackModule.exports, messages};
}

void test('feedback on the exact staging origin targets only the QA mailbox', async () => {
  const email = await emailModule('https://staging.hastabazaar.com');
  await email.sendCustomerFeedbackEmail(feedback);
  assert.deepEqual(email.messages.map((message) => message.to), ['qa-staging@hastabazaar.com']);
  assert.match(email.messages[0].text, /FICTIONAL QA CONTACT/);
  assert.match(email.messages[0].html, /&lt;b&gt;Fictional QA only&lt;\/b&gt;/);
});

void test('feedback retains its production destination for every non-staging origin', async () => {
  for (const origin of [undefined, 'https://hastabazaar.com', 'https://www.hastabazaar.com',
    'https://staging.hastabazaar.com.evil.test', 'http://staging.hastabazaar.com',
    'https://staging.hastabazaar.com/', 'https://staging.hastabazaar.com:444']) {
    const email = await emailModule(origin);
    await email.sendCustomerFeedbackEmail(feedback);
    assert.deepEqual(email.messages.map((message) => message.to), ['hastabazaar98@gmail.com'], origin);
  }
});

void test('unconfigured feedback transport remains unavailable before sending on staging', async () => {
  const email = await emailModule('https://staging.hastabazaar.com', false);
  await assert.rejects(email.sendCustomerFeedbackEmail(feedback), email.FeedbackDeliveryUnavailableError);
  assert.deepEqual(email.messages, []);
});
