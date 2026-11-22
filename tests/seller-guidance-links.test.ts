import './helpers/written-guidance-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {sellerRegistrationScopeFixture} from './helpers/seller-registration-scope-fixture';


void test('public help provides accurate written seller guidance and native task destinations without needing media',async()=>{
 const page=(await import('../app/help/page')).default,html=renderToStaticMarkup(await page());
 assert.match(html,/id="seller-guide"/);
 for(const href of ['/sell/apply','/seller/registration','/seller/products/new','/seller/products/intakes','/seller/requests','/seller/finance'])assert.ok(html.includes('href="'+href+'"'),href);
 for(const href of ['/track','/account/orders','/account/refunds'])assert.ok(html.includes('href="'+href+'"'),href);
 assert.match(html,/Ask Hastabazaar to help finish it/);assert.match(html,/verified/i);assert.match(html,/Request a document change/i);assert.match(html,/lang="ne"/);assert.match(html,/Save progress/);
 assert.doesNotMatch(html,/<(?:video|audio)\b/,'Written help remains available without loading deferred media');
});

void test('native started applicant sees written guide outside the actual optional application form',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-c');const Page=(await import('../app/sell/apply/page')).default,html=renderToStaticMarkup(await Page());
  const formEnd = html.indexOf('</form>', html.indexOf('data-form-id="seller.application"'));
  assert.ok(formEnd >= 0 && html.indexOf('id="seller-guide"') > formEnd, 'Guide is outside the actual native form');
  assert.match(html, /href="#seller-guide"[^>]*>Written seller guide/);
  assert.match(html,/Submit application/);assert.match(html,/Save progress/);assert.match(html,/No phone code needed/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_profiles WHERE user_id='registration-c'").get()!.n,0,'Reading guidance does not approve or create a seller');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM account_phone_verifications WHERE user_id='registration-c'").get()!.n,0,'Guide does not introduce phone verification');
 }finally{f.dispose();}
});

void test('native applicant dashboard retains its permitted form and places the written guide before it',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-c');const Page=(await import('../app/seller/registration/page')).default,html=renderToStaticMarkup(await Page());
  assert.match(html,/Registration &amp; documents/);assert.match(html,/id="seller-guide"/);assert.ok(html.indexOf('id="seller-guide"')<html.indexOf('<form'));assert.match(html,/Save progress now/);assert.match(html,/Submit application/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_profiles WHERE user_id='registration-c'").get()!.n,0);
 }finally{f.dispose();}
});

void test('a Managed Maker can open Seller Center and resume a private product draft before live activation', async () => {
  const f = await sellerRegistrationScopeFixture();
  try {
    f.select('registration-a');
    const seller = f.sqlite.prepare("SELECT id FROM seller_profiles WHERE user_id='registration-a'").get();
    assert.ok(seller);
    f.sqlite.prepare("UPDATE seller_profiles SET status='under_review' WHERE id=?").run(seller.id);
    f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='approved_for_activation' WHERE seller_id=?").run(seller.id);

    const { default: SellPage } = await import('../app/sell/page');
    const entry = renderToStaticMarkup(await SellPage());
    assert.match(entry, /href="\/seller"[^>]*>Open Seller Center/);

    const { SellerApplicationWorkspace } = await import('../components/seller/application-workspace');
    const home = () => SellerApplicationWorkspace({ embedded: true, section: 'home' }).then(renderToStaticMarkup);
    const emptyHome = await home();
    assert.match(emptyHome, /Seller onboarding checklist/);
    assert.match(emptyHome, /Add your first product/);
    f.sqlite.prepare(`INSERT INTO product_intake_drafts(id,owner_id,seller_id,revision,answers_json,created_at,updated_at)
      VALUES('fictional-first-product','registration-a',?,1,'{}',1,1)`).run(seller.id);
    const draftHome = await home();
    assert.match(draftHome, /href="\/seller\/products\/new\?draftId=fictional-first-product"/);
    assert.match(draftHome, /Next step:[^<]*Send your first product for review/);
    assert.match(draftHome, /Continue saved draft/);
    assert.match(draftHome, /Add photos and details in five short steps, then press “Send for review”/);
    assert.match(draftHome, /Payouts need a verified bank account/);
  } finally { f.dispose(); }
});
