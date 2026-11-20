import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { readSellerDraft, saveSellerDraft } from '../lib/sellers/draft-store';
import type { DraftSave } from '../lib/sellers/draft-contract';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';

void test('registration restores durable progress, recovers a committed 503 and clears private fields on account switch', async () => {
  const f = await completeVersionFixture();
  for (const userId of ['applicant', 'foreign']) await startSellerRegistration(f.db, { userId, requestId: `start-${userId}`, now: f.now });
  f.sqlite.exec("DELETE FROM seller_application_drafts WHERE user_id='applicant'");
  const bucket = { async put() { throw new Error('This fixture does not upload files.'); }, async delete() {} } as unknown as R2Bucket;
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const bundle = await build({ stdin: { sourcefile: 'registration-resume-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {SellerRegistrationIntakeForm} from './components/seller/seller-registration-intake-form';
    function Fixture(){const [account,setAccount]=useState('applicant'),[submitted,setSubmitted]=useState(false);return <>
      <button onClick={()=>setAccount('foreign')}>Switch account</button>
      <button onClick={()=>setSubmitted(true)}>Open submitted registration</button>
      <SellerRegistrationIntakeForm accountId={account} accountEmail={account+'@local.hastabazaar.test'} initial={submitted?{version:2,answers:{legalName:['Recorded submitted name'],hasBusinessTaxRegistration:['no']},documents:{},missing:[]}:undefined} />
      <a href="/seller">Leave registration</a></>;}
    createRoot(document.getElementById('root')!).render(<Fixture />);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'registration-fixture-boundaries', setup(builder) {
      stubFixtureLink(builder);
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'registration-stub' }));
      builder.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'registration-stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'registration-stub' }, args => ({ loader: 'js', contents: args.path === 'navigation'
        ? 'export function useRouter(){return {refresh(){}}}'
        : `const config={formId:'seller.application',version:1,publishedAt:0,fields:[]};export function usePublishedFormConfig(){return {config,status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){}}}` }));
    } }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let offline = false, uncertain = false, writes = 0, failedReadbacks = 0;
  const attempts: string[] = [];
  try {
    const page = await browser.newPage();
    // All traffic is intercepted; writes below use only completeVersionFixture's new :memory: database.
    await page.route('**/*', async (route: { request(): { url(): string; method(): string; headers(): Record<string,string>; postDataBuffer(): Buffer | null }; fulfill(response: unknown): Promise<void>; abort(): Promise<void> }) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'https://registration.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' });
      if (url.pathname !== '/api/seller-applications/draft') return route.abort();
      const owner = request.headers()['x-draft-account']; assert.ok(['applicant','foreign'].includes(owner));
      if (request.method() === 'GET') {
        if (failedReadbacks) { failedReadbacks--; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Readback unavailable"}' }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft: await readSellerDraft(f.db, owner) }) });
      }
      assert.equal(request.method(), 'PUT');
      if (offline) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fictional offline save"}' });
      const form = await new Request(request.url(), { method: 'POST', headers: { 'Content-Type': request.headers()['content-type'] }, body: new Uint8Array(request.postDataBuffer()!).buffer }).formData();
      const payload = form.get('payload');
      assert.equal(typeof payload, 'string');
      const input = JSON.parse(payload as string) as DraftSave;
      attempts.push(input.changeId);
      let draft;
      try { draft = await saveSellerDraft(f.db, bucket, owner, input, {}); writes++; }
      catch (error) { return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: error instanceof Error ? error.message : 'Draft changed' }) }); }
      if (uncertain) { uncertain = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fictional acknowledgement failure"}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft }) });
    });
    const mount = async () => { await page.goto('https://registration.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
    await mount(); await page.getByText('Progress saves automatically to your account.', { exact: true }).waitFor();
    const name = page.getByLabel('Full legal name / legal business name', { exact: true });
    await name.fill('Fictional private applicant');
    await page.getByLabel('Phone country').selectOption('BT');
    await page.getByLabel('Contact phone', { exact: false }).fill('17123456');
    assert.equal(await page.getByLabel('Contact phone', { exact: false }).evaluate((element: HTMLInputElement) => element.validity.valid), true);
    await page.getByLabel('Full pickup address', { exact: true }).fill('Fictional pickup address');
    await page.getByLabel('Pickup and return addresses are the same', { exact: true }).check();
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    assert.equal((await readSellerDraft(f.db, 'applicant'))?.answers.returnAddress[0], 'Fictional pickup address');
    await mount(); await page.getByText(/Saved progress restored/).waitFor();
    assert.equal(await name.inputValue(), 'Fictional private applicant');
    assert.equal(await page.getByLabel('Phone country').inputValue(), 'BT');
    assert.equal(await page.getByLabel('Pickup and return addresses are the same', { exact: true }).isChecked(), true);
    offline = true; await name.fill('Unsaved private edit');
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText(/Fictional offline save|Saving could not be confirmed/).waitFor();
    assert.equal(await name.inputValue(), 'Unsaved private edit');
    assert.equal((await readSellerDraft(f.db, 'applicant'))?.answers.legalName[0], 'Fictional private applicant');
    await page.getByRole('link', { name: 'Leave registration', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/');
    offline = false; uncertain = true;
    const before = writes; await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Saved progress recovered.', { exact: true }).waitFor();
    assert.equal(writes, before + 1); assert.equal((await readSellerDraft(f.db, 'applicant'))?.answers.legalName[0], 'Unsaved private edit');
    await name.fill('Recover after readback outage'); uncertain = true; failedReadbacks = 1;
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Saving could not be confirmed. Keep this page open and retry saving before leaving.', { exact: true }).waitFor();
    const pendingId = attempts.at(-1);
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    assert.equal(attempts.at(-1), pendingId, 'An uncertain attempt keeps its identity even when the first result lookup also fails.');
    const otherTab = (await readSellerDraft(f.db, 'applicant'))!;
    await saveSellerDraft(f.db, bucket, 'applicant', { revision: otherTab.revision, changeId: crypto.randomUUID(), attemptId: otherTab.attemptId,
      formVersion: 1, answers: { ...otherTab.answers, legalName: ['Saved in another tab'] }, files: {} }, {});
    await name.fill('My local correction'); await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByRole('button', { name: 'Review latest saved progress', exact: true }).click();
    await page.getByText('Saved in another tab', { exact: true }).waitFor(); assert.equal(await name.inputValue(), 'My local correction');
    await page.getByRole('button', { name: 'Keep my current entries', exact: true }).click();
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    assert.equal((await readSellerDraft(f.db, 'applicant'))?.answers.legalName[0], 'My local correction');
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await page.getByText('Progress saves automatically to your account.', { exact: true }).waitFor();
    assert.equal(await name.inputValue(), ''); assert.equal(await page.getByLabel('Full pickup address', { exact: true }).inputValue(), '');
    assert.equal(await readSellerDraft(f.db, 'foreign'), null);
    await name.fill('Old unsubmitted progress'); await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open submitted registration', exact: true }).click();
    await page.getByText(/Saved progress belongs to an earlier registration version/).waitFor();
    assert.equal(await name.inputValue(), 'Recorded submitted name', 'An older draft cannot silently replace the submitted registration values.');
    await page.getByRole('button', { name: 'Keep my current entries', exact: true }).click();
    await name.fill('New private correction'); await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    const correction = (await readSellerDraft(f.db, 'foreign'))!;
    assert.match(correction.attemptId, /^registration_v2_/); assert.equal(correction.answers.legalName[0], 'New private correction');
  } finally { await browser.close(); f.dispose(); }
});

void test('account revocation during a private draft save rolls back the new revision', async () => {
  const f = await completeVersionFixture();
  await startSellerRegistration(f.db, { userId: 'applicant', requestId: 'start-revocation', now: f.now });
  const bucket = {} as R2Bucket;
  try {
    const before = (await readSellerDraft(f.db, 'applicant', f.now))!;
    f.setBeforeBatch(() => { f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='applicant'"); });
    await assert.rejects(saveSellerDraft(f.db, bucket, 'applicant', { revision: before.revision, changeId: crypto.randomUUID(), attemptId: before.attemptId,
      formVersion: 1, answers: { legalName: ['Must not commit'] }, files: {} }, {}, f.now));
    assert.equal((await readSellerDraft(f.db, 'applicant', f.now))?.revision, before.revision);
  } finally { f.dispose(); }
});
