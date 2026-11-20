import { createHash } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Response } from 'playwright-core';
import { captureNativeInventory } from '../recovery/native-inventory.mjs';
import type { bindSelectedBrowserViews } from '../recovery/selected-native-views.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser, BrowserContext, Page, Route, Locator } from 'playwright-core';
import { getRefundFinanceWorkspace } from '../../lib/payments/refund-workspace';
import { formatPaisaExact } from '../../lib/marketplace/money-display';
import { passwordRecord } from '../../lib/auth/hosted-session';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '../../lib/db/repositories/marketplace-settings';
import { getCommonFeeState } from '../../lib/commission/coordinated-policy';
import { COMMISSION_NOTICE_MS, nepalDateTimeInput, parseNepalDateTime } from '../../lib/commission/rates';
import { getCommissionCheckoutAcceptance } from '../../lib/db/repositories/commission-rates';
import { getCommissionSetting } from '../../lib/db/repositories/marketplace-settings';
import { confirmOfferStock } from '../../lib/products/offer-inventory';
import { publishCategoryContract } from '../../lib/products/category-contracts';
import { saveProductWorkspace, submitProductIntake } from '../../lib/products/intake-workspace';
import { getProductPublicationReview, reviewProductPublication } from '../../lib/products/publication';
import { verifySellerDocument } from '../../lib/sellers/document-review';
import { seedCheckoutBuyer } from '../../tests/helpers/checkout-contact';
import { publicationCategory, publicationSnapshot } from '../../tests/helpers/product-publication-fixture';
import { totpAtCounter } from '../../lib/security/crypto';
import type { SecurityStore } from '../../lib/security/store';
import { sellerTaskTimestamp } from '../../lib/seller/task-presentation';
import { coreFormReceiptId } from '../../lib/forms/core-receipts';
import { evaluateFormHealth } from '../../lib/operations/form-health';
import { incidentHealthTransitionStatements } from '../../lib/operations/incident-review';
import type { SellerWorkspaceTask, SellerWorkspaceTasks } from '../../lib/seller/workspace-tasks';

export const commerceRuntime = {
  NODE_ENV: 'development',
  HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated',
  HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test',
} as const;

export function assertCommerceRuntime(environment: NodeJS.ProcessEnv) {
  assert.ok(!environment.SMTP_HOST && !environment.SMTP_USER && !environment.SMTP_PASSWORD &&
    environment.EMAIL_DELIVERY_CONFIGURED !== 'true', 'Live mail transport is incompatible with fictional commerce');
  for (const [name, value] of Object.entries(commerceRuntime)) {
    assert.equal(environment[name], value, 'Fictional commerce requires ' + name);
  }
}

type Actor = { id: string; email: string; password: string };
type OwnedCommerceEpoch = {
  db: D1Database;
  runtime: NodeJS.ProcessEnv;
  // The owner must check this exact DB binding and child configuration before either step.
  assertOwned: () => Promise<void>;
};

async function createActor(db: D1Database, id: string, role: 'seller' | 'customer', now: number, phone: string): Promise<Actor> {
  const email = id + '@local.hastabazaar.test';
  const password = Buffer.from(randomBytes(32)).toString('base64url');
  const credential = await passwordRecord(password);
  if (role === 'customer') await seedCheckoutBuyer(db, id, email, phone, now);
  else await db.batch([
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,'Fictional commerce seller','active','en',?,?)").bind(id, id, email, now, now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'seller',?)").bind(id, now),
  ]);
  await db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(id, credential.hash, credential.salt, now, now).run();
  return { id, email, password };
}

async function prepareSeller(db: D1Database, actor: Actor, reviewerId: string, now: number) {
  const id = actor.id + '-profile';
  // Fictional seed facts in the isolated epoch. Document review and terms use the real commands.
  await db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
    tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
    payout_account_reference,status,applicant_type,created_at,updated_at)
    VALUES(?,?,'Fictional Commerce Seller',?,'Fictional Registry',?,'PAN',?,'Fictional Seller','9800000000',?,
    'Bagmati','Kathmandu','Kathmandu','Fixture Ward',?,'approved','individual',?,?)`)
    .bind(id, actor.id, 'Fictional Commerce ' + actor.id, 'REG-' + id, 'PAN-' + id, actor.email, null, now, now).run();
  for (const kind of ['representative_identity', 'pan_certificate']) {
    const document = id + '-' + kind;
    await db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES(?,?,?,?,'fictional.png','image/png',100,'pending',?)`)
      .bind(document, id, kind, 'private/fictional/' + document, now).run();
    await verifySellerDocument(db, { sellerId: id, documentId: document, actorId: reviewerId,
      reason: 'Review this exact fictional seller evidence in an isolated test.', commandId: randomUUID(), now, expectedReviewId: null });
  }
  const terms = await getRegisteredSellerTerms(db, now);
  const acceptance = await prepareSellerCommissionAcceptance(db, { sellerId: id, actorId: actor.id,
    context: terms.context, requestId: randomUUID(), now, mode: 'approved_seller' });
  await db.batch([
    db.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id=?')
      .bind(terms.agreementVersion, now, id),
    ...acceptance.statements,
  ]);
  return { ...actor, sellerId: id };
}

export async function prepareCommerceBrowser(epoch: OwnedCommerceEpoch, reviewerId: string) {
  assertCommerceRuntime(epoch.runtime);
  await epoch.assertOwned();
  const db = epoch.db, now = Date.now() - 60_000, key = 'commerce-' + randomUUID().slice(0, 12);
  const buyer = await createActor(db, key + '-buyer', 'customer', now, '9811111111');
  const foreignBuyer = await createActor(db, key + '-other-buyer', 'customer', now, '9822222222');
  const seller = await prepareSeller(db, await createActor(db, key + '-seller', 'seller', now, ''), reviewerId, now);
  const foreignSeller = await prepareSeller(db, await createActor(db, key + '-other-seller', 'seller', now, ''), reviewerId, now);
  await db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES(?,?,?,1,0,?,?)")
    .bind(key, key, 'Fictional Commerce Cups ' + key, now, now).run();
  const staff = (expectedRevision: string | null) => ({ actorId: reviewerId, requestId: randomUUID(), expectedRevision, now });
  const owner = (expectedRevision: string | null) => ({ actorId: seller.id, requestId: randomUUID(), expectedRevision, now });
  await publishCategoryContract(db, staff(null), { categoryId: key, contract: publicationCategory.contract,
    reason: 'Review the ordering facts for the isolated fictional cups.' });
  const snapshot = publicationSnapshot();
  const name = 'Fictional Commerce Cup ' + key;
  snapshot.answers.nameEn = name;
  snapshot.answers.preparationDays = '2';
  const variants = [
    { id: key + '-medium', value: 'medium', label: 'Medium', price: '5600', quantity: 5 },
    { id: key + '-large', value: 'large', label: 'Large', price: '6700', quantity: 3 },
  ];
  snapshot.offers.axes = [{ id: 'size', label: 'Size', values: variants.map(({ value, label }) => ({ id: value, label })) }];
  snapshot.offers.offers = variants.map(variant => ({ ...snapshot.offers.offers[0], id: variant.id,
    selection: { size: variant.value }, price: variant.price, stockFamilyKey: variant.id, sku: variant.id,
    mediaId: variant.id, browseOnly: false }));
  const input = { ...snapshot, categoryId: key, formContext: null, draftId: null, sellerId: seller.sellerId, mediaIds: [] };
  const draft = await saveProductWorkspace(db, owner(null), input);
  for (const variant of variants) {
    await db.prepare(`INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,
      original_name,content_digest,state,created_at,completed_at) VALUES(?,?,?,?,?,'image/png',100,'fictional-cup.png',?,'ready',?,?)`)
      .bind(variant.id, draft.id, seller.id, randomUUID(), 'private/fictional/' + variant.id, 'fixture-' + variant.id, now, now).run();
  }
  const attached = await saveProductWorkspace(db, owner(String(draft.revision)),
    { ...input, draftId: draft.id, mediaIds: variants.map(variant => variant.id) });
  const submitted = await submitProductIntake(db, owner(String(attached.revision)),
    { draftId: draft.id, versionId: attached.versionId, intent: 'review', note: '' });
  const review = await getProductPublicationReview(db, reviewerId, submitted.caseId);
  await reviewProductPublication(db, staff(String(review.revision)), {
    caseId: submitted.caseId, versionId: review.candidate.versionId, expectedCaseRevision: String(review.caseRevision),
    action: 'approve_and_publish', reason: 'Independently review the two fictional physical options and their ordering facts.',
    checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
  });
  for (const variant of variants) await confirmOfferStock(db, owner(null), {
    offerId: variant.id, available: variant.quantity, reason: 'Count independent fictional inventory for this size.',
    independentStockConfirmed: true,
  });
  const product = await db.prepare('SELECT slug FROM products WHERE id=?').bind(review.productId).first<{ slug: string }>();
  assert.ok(product);
  return { buyer, foreignBuyer, seller, foreignSeller, name, variants, productId: review.productId, slug: product.slug };
}

const ordersSql = 'SELECT * FROM orders ORDER BY id';
const itemsSql = 'SELECT * FROM order_items ORDER BY id';
const reviewsSql = 'SELECT * FROM first_cod_reviews ORDER BY order_id';
const offersSql = 'SELECT * FROM order_item_offer_snapshots ORDER BY order_item_id';

async function inventory(db: D1Database) {
  const [orders, items, offers, reviews] = await Promise.all([ordersSql, itemsSql, offersSql, reviewsSql].map(async sql =>
    (await db.prepare(sql).all<Record<string, unknown>>()).results));
  return { orders, items, offers, reviews };
}

export async function readOriginalFulfillment(
  db: D1Database, orderId: string, itemIds: string[], expected: 'ready_for_pickup' | 'delivered',
) {
  const order = await db.prepare('SELECT status FROM orders WHERE id=?').bind(orderId).first<{ status: string }>();
  const { results: persisted } = await db.prepare('SELECT id,fulfillment_status FROM order_items WHERE order_id=?')
    .bind(orderId).all<{ id: string; fulfillment_status: string }>();
  assert.ok(order, 'Original order is missing from final readback');
  assert.equal(order.status, expected, 'Original order did not reach the expected final status');
  assert.ok(itemIds.length > 0, 'Original checkout must have items');
  assert.deepEqual(persisted.map(item => item.id).sort(), [...itemIds].sort(), 'Final item identities differ from the original checkout');
  assert.ok(persisted.every(item => item.fulfillment_status === order.status), 'Final original item statuses differ from the original order');
  return order.status;
}

function newRows(rows: Record<string, unknown>[], old: Record<string, unknown>[], key: string) {
  const existing = new Map(old.map(row => [row[key], row]));
  for (const row of rows) {
    if (!existing.has(row[key])) continue;
    assert.deepEqual(row, existing.get(row[key]), 'Original commerce row changed');
    existing.delete(row[key]);
  }
  assert.equal(existing.size, 0, 'Original commerce row removed');
  const oldKeys = new Set(old.map(row => row[key]));
  return rows.filter(row => !oldKeys.has(row[key]));
}

type SellerJourneyOptions = {
  origin: string; db: D1Database; signal: AbortSignal;
  seller: Page; foreignSeller: Page; foreignCustomer: Page;
  accounts: Awaited<ReturnType<typeof prepareCommerceBrowser>>;
  orderId: string; orderNumber: string;
};

export async function runSellerJourney(options: SellerJourneyOptions & { evidenceDirectory: string }) {
  const { origin, db, signal, seller, foreignSeller, foreignCustomer, accounts, orderId, orderNumber } = options;
  signal.throwIfAborted();
  const source = await db.prepare(
    'SELECT s.trading_name AS tradingName, sp.display_name AS publicName, p.name_en AS productName FROM seller_profiles s JOIN seller_public_profile_states sp ON sp.seller_id=s.id JOIN products p ON p.seller_id=s.id WHERE s.id=? AND s.user_id=? AND p.id=?'
  ).bind(accounts.seller.sellerId, accounts.seller.id, accounts.productId).first<{ tradingName: string; publicName: string; productName: string }>();
  assert.ok(source, 'J1 requires the admitted seller and exact published product');
  const routes = [
    ['/seller', source.tradingName, true],
    ['/seller/profile', 'Shop profile', false],
    ['/seller/registration', 'Registration & documents', false],
    ['/seller/products', 'My products', true],
    ['/seller/orders', 'Your orders', true],
    ['/seller/finance', 'Earnings and settlements', false],
    ['/seller/requests', 'Requests & help', false],
  ] as const;
  const orderPath = '/seller/orders/' + orderId;
  const productPath = '/seller/products/' + accounts.productId + '/answers';
  const makerPath = '/makers/' + accounts.seller.sellerId;
  const requests = '/seller/requests';
  const helpPath = '/help#seller-guide';
  const main = (page: Page) => page.locator('#main-content');
  const link = (scope: Page | ReturnType<typeof main>, href: string) => scope.locator('a[href="' + href + '"]');
  const heading = (page: Page, name: string) => main(page).getByRole('heading', { name, exact: true, level: 1 });
  const waitPath = (page: Page, path: string) => page.waitForURL(origin + path);
  const assertWidth = async (page: Page) => assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Unexpected horizontal overflow at ' + new URL(page.url()).pathname
  );
  const mobile = await seller.context().newPage();
  const screenshots: string[] = [];
  const accountInventory = async () => ({
    users: (await db.prepare('SELECT * FROM users ORDER BY id').all<Record<string, unknown>>()).results,
    roles: (await db.prepare('SELECT user_id,role,assigned_at,assigned_by FROM user_roles ORDER BY user_id,role')
      .all<{ user_id: string; role: string; assigned_at: number; assigned_by: string | null }>()).results,
  });
  const beforeAccount = await accountInventory();
  const ownerBefore = beforeAccount.users.find(row => row.id === accounts.seller.id);
  assert.ok(ownerBefore && !beforeAccount.roles.some(row => row.user_id === accounts.seller.id && row.role === 'customer'));
  let firstAccountVisitAt = 0;
  const pageErrors: string[] = [];
  const recordError = (error: Error) => pageErrors.push(error.message);
  seller.on('pageerror', recordError);
  mobile.on('pageerror', recordError);
  try {
    for (const [page, width] of [[seller, 1440], [mobile, 390]] as const) {
      await page.setViewportSize({ width, height: 900 });
      // Start away from Home so the initial link activation changes the route.
      await page.goto(origin + '/seller/orders');
      const skip = page.getByRole('link', { name: 'Skip to workspace', exact: true });
      await page.keyboard.press('Tab');
      assert.ok(await skip.evaluate(node => node === document.activeElement));
      await page.keyboard.press('Enter');
      assert.ok(await main(page).evaluate(node => node === document.activeElement));
      const desktop = page.getByRole('navigation', { name: 'Seller workspace', exact: true });
      const quick = page.getByRole('navigation', { name: 'Seller quick links', exact: true });
      const more = page.getByRole('navigation', { name: 'More seller pages', exact: true });
      const summary = page.locator('summary[data-mobile-shortcut="more"]');
      const moreDetails = page.locator('details').filter({ has: summary });
      if (width === 390) {
        await summary.press('Enter');
        await more.waitFor({ state: 'visible' });
        await page.keyboard.press('Tab');
        assert.ok(await more.evaluate(node => node.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        await more.waitFor({ state: 'hidden' });
        assert.ok(await summary.evaluate(node => node === document.activeElement));
      }
      for (const [path, title, primary] of routes) {
        signal.throwIfAborted();
        const useMore = width === 390 && !primary;
        const nav = width === 1440 ? desktop : primary ? quick : more;
        if (useMore) await summary.press('Enter');
        await link(nav, path).click();
        await waitPath(page, path);
        await heading(page, title).waitFor({ state: 'visible' });
        if (useMore) {
          assert.equal(await moreDetails.getAttribute('open'), null, 'Navigation must close More');
          await summary.press('Enter');
        }
        const current = nav.locator('a[aria-current="page"]');
        assert.equal(await current.count(), 1, path + ' must have one current link in its navigation');
        assert.equal(await current.getAttribute('href'), path);
        await assertWidth(page);
        if (useMore) await summary.press('Escape');
        const screenshot = 'j1-' + width + '-' + (path.split('/')[2] ?? 'home') + '.png';
        await page.screenshot({ path: join(options.evidenceDirectory, screenshot) });
        screenshots.push(screenshot);
      }
      if (width === 1440) firstAccountVisitAt = Date.now();
      await page.getByRole('link', { name: 'Switch to customer dashboard', exact: true }).click();
      await waitPath(page, '/account');
      await page.getByRole('link', { name: 'Switch to seller dashboard', exact: true }).click();
      await waitPath(page, '/seller');
      await heading(page, source.tradingName).waitFor();
    }

    const afterAccount = await accountInventory();
    const ownerAfter = afterAccount.users.find(row => row.id === accounts.seller.id);
    const customerRole = afterAccount.roles.find(row => row.user_id === accounts.seller.id && row.role === 'customer');
    assert.ok(ownerAfter && customerRole && customerRole.assigned_by === null);
    const updatedAt = Number(ownerAfter.updated_at);
    assert.ok(updatedAt >= firstAccountVisitAt && updatedAt <= Date.now() && updatedAt > Number(ownerBefore.updated_at));
    assert.equal(Number(customerRole.assigned_at), updatedAt);
    assert.ok(isDeepStrictEqual(
      afterAccount.roles.filter(row => row !== customerRole), beforeAccount.roles
    ), 'Customer dashboard added a role outside the exact fictional seller');
    assert.ok(isDeepStrictEqual(
      afterAccount.users.map(row => row === ownerAfter ? { ...row, updated_at: ownerBefore.updated_at } : row),
      beforeAccount.users
    ), 'Customer dashboard changed a user field outside the fictional seller updated_at');

    await seller.goto(origin + '/seller/profile');
    await link(main(seller), makerPath).click();
    await waitPath(seller, makerPath);
    await heading(seller, source.publicName).waitFor();
    await seller.goto(origin + '/seller/products');
    await link(main(seller), productPath).click();
    await waitPath(seller, productPath);
    const productTitle = 'Answer history for ' + source.productName;
    await heading(seller, productTitle).waitFor();
    const hiddenProduct = await foreignSeller.goto(origin + productPath);
    assert.equal(hiddenProduct?.status(), 404);
    assert.equal(await heading(foreignSeller, productTitle).count(), 0);
    await foreignCustomer.goto(origin + productPath);
    await waitPath(foreignCustomer, '/sell');
    await foreignCustomer.goto(origin + orderPath);
    await waitPath(foreignCustomer, '/sell');

    const endpoint = origin + '/api/seller/workspace-tasks';
    const getTasks = async (page: Page, query: string, status: number): Promise<SellerWorkspaceTasks | null> => {
      const response = await page.request.get(endpoint + query);
      assert.equal(response.status(), status);
      assert.equal(response.headers()['cache-control'], 'no-store');
      return status === 200 ? response.json() : null;
    };
    const all = await getTasks(seller, '?view=all', 200);
    const active = await getTasks(seller, '?view=active', 200);
    const foreign = await getTasks(foreignSeller, '?view=all', 200);
    await getTasks(foreignCustomer, '', 403);
    const anonymous = await seller.context().browser()!.newContext({ serviceWorkers: 'block' });
    try {
      assert.equal((await anonymous.request.get(endpoint)).status(), 401);
    } finally {
      await anonymous.close();
    }
    assert.ok(all && active && foreign);
    const portion = await db.prepare(
      'SELECT p.id, o.order_number AS reference, o.updated_at AS updatedAt, o.status FROM order_response_portions p JOIN orders o ON o.id=p.order_id WHERE p.order_id=? AND p.seller_id=? AND p.operator_mode=?'
    ).bind(orderId, accounts.seller.sellerId, 'seller').first<{ id: string; reference: string; updatedAt: number; status: string }>();
    assert.ok(portion);
    assert.equal(portion.reference, orderNumber);
    const release = await db.prepare(
      'SELECT MIN(released_at) AS startedAt FROM order_response_items WHERE portion_id=?'
    ).bind(portion.id).first<{ startedAt: number | null }>();
    assert.ok(release?.startedAt);
    const key = 'order:' + portion.id;
    const task = all.tasks.find(row => row.key === key);
    assert.ok(task, 'J1 Requests requires the released order task');
    assert.deepEqual([task.sourceId, task.reference, task.href, task.startedAt, task.updatedAt, task.status, task.group, task.nextActor],
      [portion.id, orderNumber, orderPath, Number(release.startedAt), Number(portion.updatedAt), portion.status, 'waiting', 'Hastabazaar']);
    assert.deepEqual(active.tasks.find(row => row.key === key), task);
    assert.ok(!foreign.tasks.some(row => row.reference === orderNumber || row.sourceId === portion.id));
    assert.ok(!active.tasks.some(row => row.group === 'history'));

    const taskLocator = (page: Page, row: SellerWorkspaceTask) => main(page).locator('[id="task-' + row.key.replaceAll(':', '-') + '"]');
    await seller.goto(origin + '/seller');
    const onHome = taskLocator(seller, task);
    await onHome.waitFor();
    const taskText = await onHome.innerText();
    assert.ok(taskText.includes('Reference ' + orderNumber));
    assert.ok(taskText.includes(portion.status.replaceAll('_', ' ') + ' · Waiting for Hastabazaar'));
    assert.ok(taskText.includes('Recorded ' + sellerTaskTimestamp(Number(release.startedAt))));
    if (task.updatedAt > task.startedAt) assert.ok(taskText.includes('Updated ' + sellerTaskTimestamp(task.updatedAt)));
    await seller.getByRole('link', { name: 'View all requests →', exact: true }).click();
    await waitPath(seller, requests);
    const views = seller.getByRole('navigation', { name: 'Request views', exact: true });
    const allHistory = all.tasks.filter(row => row.group === 'history');
    for (const [label, view] of [['Current work', 'active'], ['All records', 'all']]) {
      await views.getByRole('link', { name: label, exact: true }).click();
      await waitPath(seller, requests + '?view=' + view);
      assert.equal(await taskLocator(seller, task).innerText(), taskText);
      for (const history of allHistory) {
        const card = taskLocator(seller, history);
        if (view === 'active') assert.equal(await card.count(), 0);
        else {
          await card.waitFor({ state: 'visible' });
          assert.ok((await card.innerText()).includes('Recorded outcome — no current action'));
        }
      }
    }
    const orderLink = taskLocator(seller, task).getByRole('link', { name: 'Open record →', exact: true });
    assert.equal(await orderLink.getAttribute('href'), orderPath);
    await orderLink.click();
    await waitPath(seller, orderPath);
    await heading(seller, orderNumber).waitFor();

    await mobile.goto(origin + requests + '?view=active');
    const resources = mobile.getByRole('navigation', { name: 'Request resources', exact: true });
    const guideLink = resources.getByRole('link', { name: 'Written seller guide and contact', exact: true });
    await resources.getByRole('link', { name: 'Application and agreement history', exact: true }).press('Tab');
    assert.ok(await guideLink.evaluate(node => node === document.activeElement));
    await mobile.keyboard.press('Enter');
    await waitPath(mobile, helpPath);
    const guide = mobile.locator('#seller-guide');
    const steps = guide.locator('details');
    assert.equal(await steps.getAttribute('open'), null);
    await guide.locator('summary').press('Space');
    await guide.getByRole('heading', { name: 'Register with available details', exact: true }).waitFor();
    assert.equal(await guide.locator('input, select, textarea, button, form, video, audio').count(), 0);
    await assertWidth(mobile);
    await guide.getByRole('link', { name: 'Requests & help', exact: true }).press('Enter');
    await waitPath(mobile, requests);
    const currentOrder = taskLocator(mobile, task).getByRole('link', { name: 'Open record →', exact: true });
    await currentOrder.press('Enter');
    await waitPath(mobile, orderPath);
    await heading(mobile, orderNumber).waitFor();
    assert.deepEqual(pageErrors, [], 'Unexpected owner-page browser errors');
    return {
      desktopRoutes: routes.map(([path]) => path), mobileRoutes: routes.map(([path]) => path),
      viewportEvidence: screenshots, keyboardSkipMoreEscape: true, customerDashboardRoundTrip: true,
      customerDashboardDelta: { userId: accounts.seller.id, addedRole: 'customer', updatedAt },
      writtenHelpToOrder: true,
      productAnswerHistoryPath: productPath, publicMakerPath: makerPath,
      orderTask: { key, reference: orderNumber, path: orderPath, startedAt: task.startedAt, updatedAt: task.updatedAt, status: task.status, nextActor: task.nextActor },
      historyRowsCompared: allHistory.length, foreignSellerProductStatus: 404,
      foreignSellerOrderStatus: 404, foreignCustomerSellerDestination: '/sell',
      taskApiStatuses: { seller: 200, foreignSeller: 200, customer: 403, anonymous: 401 },
    };
  } finally {
    seller.off('pageerror', recordError);
    await mobile.close();
  }
}


export async function runCommerceBrowser(options: {
  epoch: OwnedCommerceEpoch; browser: Browser; origin: string; admin: Actor; signal: AbortSignal;
  accounts: Awaited<ReturnType<typeof prepareCommerceBrowser>>;
  aftercareJourney?: { support: Actor; finance: FinanceSessions };
  exceptionJourney?: {db: Connection; ownerPage: Page; owner: Actor};
  giftIssuer?: {page:Page;id:string};
  referralManager?: {page: Page; id: string};
  sellerJourney?: (options: SellerJourneyOptions) => ReturnType<typeof runSellerJourney>;
}) {
  const { epoch, browser, origin, admin, signal, accounts } = options;
  const endpoint = new URL(origin);
  assert.ok(endpoint.origin === origin && endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' &&
    endpoint.port && endpoint.port !== '3018', 'Commerce browser requires an isolated loopback port');
  assertCommerceRuntime(epoch.runtime);
  assert.equal(epoch.runtime.APP_ORIGIN, origin, 'Browser and admitted runtime origins must match');
  await epoch.assertOwned();
  const before = await inventory(epoch.db);
  const contexts: BrowserContext[] = [];
  const open = async (actor: Actor, destination: string) => {
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    contexts.push(context);
    const page = await context.newPage();
    await signInPackagedBrowser(page, origin, actor, destination);
    if (destination === '/security') await waitForPackagedStaffEnrollment(page, origin);
    else await page.waitForURL(origin + destination);
    return page;
  };
  async function post(page: Page, path: string, action: () => Promise<void>, status: number) {
    signal.throwIfAborted();
    const [response] = await Promise.all([page.waitForResponse(response =>
      response.request().method() === 'POST' && response.url() === origin + path), action()]);
    assert.equal(response.status(), status, path + ' rejected the fictional browser action');
    return response;
  }
  try {
    const shop = '/shop?q=' + encodeURIComponent(accounts.name);
    const buyer = await open(accounts.buyer, shop);
    const foreign = await open(accounts.foreignBuyer, '/account/orders');
    const giftWallet = options.giftIssuer ? await runGiftWalletJourney({epoch,issuer:options.giftIssuer.page,
      issuerId:options.giftIssuer.id,buyer,buyerId:accounts.buyer.id,foreignBuyer:foreign,foreignBuyerId:accounts.foreignBuyer.id,signal}) : undefined;
    const walletCheckout = giftWallet && options.aftercareJourney ? giftWallet : undefined;
    const walletBalanceBeforeCheckout = walletCheckout ? await readWalletBalance(epoch, accounts.buyer.id) : 0;
    if (walletCheckout) {
      assert.equal(walletBalanceBeforeCheckout, walletCheckout.amountPaisa, 'Fresh fixture buyer must have only the redeemed gift credit');
    }
    if (giftWallet) await buyer.goto(origin + shop);
    await buyer.locator('a[href="/products/' + accounts.slug + '"]').first().click();
    await buyer.waitForURL(origin + '/products/' + accounts.slug);
    const choice = buyer.getByLabel('Size', { exact: true });
    const add = buyer.getByRole('button', { name: 'Add to cart', exact: true });
    await choice.waitFor();
    assert.equal(await add.isDisabled(), true);
    for (const variant of accounts.variants) {
      await choice.selectOption(variant.value);
      await post(buyer, '/api/cart', () => add.click(), 200);
      await buyer.getByText('Added to your cart.', { exact: true }).waitFor();
    }
    await buyer.goto(origin + '/cart');
    for (const variant of accounts.variants) await buyer.getByText('Size: ' + variant.label, { exact: false }).first().waitFor();
    await buyer.locator('a[href="/checkout"]').click();
    await buyer.waitForURL(origin + '/checkout');
    await buyer.getByLabel(/^Recipient name/).fill('Fictional Commerce Recipient');
    await buyer.getByLabel(/^Recipient phone/).fill('9811111111');
    await buyer.locator('#province').click();
    await buyer.getByRole('option', { name: 'Bagmati', exact: true }).click();
    await buyer.getByLabel(/^District/).fill('Kathmandu');
    await buyer.getByLabel(/^Municipality/).fill('Kathmandu');
    await buyer.getByLabel(/^Street, tole or locality/).fill('Fictional Commerce Ward');
    await buyer.getByRole('radio', { name: /Cash on delivery/ }).check();
    if (walletCheckout) {
      await buyer.getByRole('checkbox', { name: /^Use shopping credit/ }).check();
    }
    await buyer.locator('#checkout-terms').check();
    await buyer.getByText('Total on delivery', { exact: true }).waitFor();
    const response = await post(buyer, '/api/checkout', () =>
      buyer.getByRole('button', { name: 'Place COD order', exact: true }).click(), 201);
    const result = await response.json() as { orderNumber: string };
    assert.ok(/^[A-Za-z0-9-]+$/.test(result.orderNumber));
    const receipt = '/orders/' + result.orderNumber;
    await buyer.waitForURL(origin + receipt);
    await buyer.context().clearCookies({ name: 'hastabazaar_receipt' });
    await buyer.goto(origin + '/account/orders');
    await buyer.locator('a[href="' + receipt + '"]').first().click();
    await buyer.getByText(result.orderNumber, { exact: true }).first().waitFor();

    const placed = await inventory(epoch.db);
    const [order, ...duplicates] = newRows(placed.orders, before.orders, 'id');
    assert.ok(order && !duplicates.length && typeof order.id === 'string');
    assert.equal(order.order_number, result.orderNumber);
    assert.equal(order.customer_id, accounts.buyer.id);
    assert.equal(order.payment_mode, 'cod');
    const orderId = order.id;
    const walletSpend = walletCheckout ? await (async () => {
      assert.equal((response.request().postDataJSON() as {useWallet?:boolean}).useWallet, true);
      const spentPaisa = walletCheckout.amountPaisa;
      assert.equal(order.wallet_credit_paisa, spentPaisa);
      const entries = await readOrderWalletEntries(epoch, orderId);
      assert.deepEqual(entries, [{
        id: 'spend:' + orderId, user_id: accounts.buyer.id, kind: 'order_spend',
        amount_paisa: -spentPaisa, platform_amount_paisa: spentPaisa,
      }]);
      const balanceAfterSpend = await readWalletBalance(epoch, accounts.buyer.id);
      assert.equal(balanceAfterSpend, walletBalanceBeforeCheckout - spentPaisa);
      await buyer.goto(origin + '/account/wallet');
      await requireWalletActivity(buyer, result.orderNumber, 'Used at checkout', -spentPaisa);
      return { giftId: walletCheckout.giftId, orderId, spentPaisa, balanceBeforeCheckout: walletBalanceBeforeCheckout,
        balanceAfterSpend, debit: entries[0] };
    })() : undefined;
    const reviews = newRows(placed.reviews, before.reviews, 'order_id');
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].order_id, orderId);
    assert.equal(reviews[0].status, 'pending');
    const items = newRows(placed.items, before.items, 'id');
    const offers = newRows(placed.offers, before.offers, 'order_item_id');
    assert.equal(items.length, 2);
    assert.equal(offers.length, 2);
    for (const variant of accounts.variants) {
      const offer = offers.find(row => row.offer_id === variant.id);
      assert.ok(offer && typeof offer.snapshot_json === 'string');
      const item = items.find(row => row.id === offer.order_item_id);
      assert.ok(item);
      assert.equal(item.order_id, orderId);
      assert.equal(item.seller_id, accounts.seller.sellerId);
      assert.equal(item.product_id, accounts.productId);
      assert.equal(Number(item.quantity), 1);
      assert.equal(Number(item.unit_price_paisa), Number(variant.price) * 100);
      assert.equal(Number(item.line_total_paisa), Number(variant.price) * 100);
    }

    await foreign.goto(origin + '/account/orders');
    assert.equal(await foreign.locator('a[href="' + receipt + '"]').count(), 0);
    const hiddenReceipt = await foreign.goto(origin + receipt);
    assert.equal(hiddenReceipt?.status(), 404);
    assert.equal(await foreign.getByText('Fictional Commerce Recipient', { exact: true }).count(), 0);

    const sellerPath = '/seller/orders/' + orderId;
    const seller = await open(accounts.seller, '/seller/orders');
    await seller.locator('a[href="' + sellerPath + '"]').first().click();
    await seller.getByText('Awaiting staff confirmation of this first-time COD order.', { exact: false }).waitFor();
    const foreignSeller = await open(accounts.foreignSeller, '/seller/orders');
    const hiddenSeller = await foreignSeller.goto(origin + sellerPath);
    assert.equal(hiddenSeller?.status(), 404);
    assert.equal(await foreignSeller.getByRole('heading', { name: result.orderNumber, exact: true }).count(), 0);

    const adminPath = '/admin/orders/' + orderId;
    const enrollment = await open(admin, '/security');
    const authenticator = await activateAuthenticator(enrollment, admin.password);
    await enrollment.context().close();
    const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    contexts.push(freshContext);
    assert.equal((await freshContext.cookies()).length, 0, 'Fresh sign-in must begin without a session');
    const staff = await freshContext.newPage();
    await signInPackagedBrowser(staff, origin, admin, '/admin/orders');
    const challenge = staff.locator('form[data-form-id="system.security-mfa-verify"]');
    await challenge.waitFor();
    assert.equal(new URL(staff.url()).pathname, '/security');
    await challenge.getByText('Password confirmed.', { exact: false }).waitFor();
    assert.equal(await challenge.getByLabel('Current password', { exact: true }).count(), 0,
      'Fresh password login must establish the real single-use password challenge');
    const pending = (await freshContext.cookies()).find(cookie => cookie.name === 'hastabazaar_session');
    assert.ok(pending);
    // Enrollment consumes its TOTP counter; use the next real clock window, never replay it.
    while (Math.floor(Date.now() / 30_000) <= authenticator.counter) await delay(200, undefined, { signal });
    await challenge.getByLabel('Authenticator code', { exact: true }).fill(totpAtCounter(authenticator.manualKey, Math.floor(Date.now() / 30_000)));
    await post(staff, '/api/security/verify', () => challenge.getByRole('button', { name: 'Verify and continue', exact: true }).click(), 200);
    await staff.waitForURL(origin + '/admin/orders');
    const verified = (await freshContext.cookies()).find(cookie => cookie.name === 'hastabazaar_session');
    assert.ok(verified?.httpOnly && verified.sameSite === 'Lax' && verified.value !== pending.value,
      'Fresh TOTP verification must rotate the pending session');
    await staff.goto(origin + '/admin/orders');
    await staff.locator('a[href="' + adminPath + '"]').first().click();
    await staff.getByRole('heading', { name: result.orderNumber, exact: true }).waitFor();
    const confirmation = staff.locator('form[data-form-id="staff.first-cod-confirmation"]');
    await confirmation.getByLabel('Confirmation reason').fill('Confirmed the exact fictional buyer and order for isolated acceptance.');
    await post(staff, '/api' + adminPath + '/first-cod-confirmation', () =>
      confirmation.getByRole('button', { name: 'Confirm COD order', exact: true }).click(), 200);
    await seller.reload();
    for (const [label, state] of [['Start selected preparation', 'packing'], ['Selected items ready for pickup', 'ready_for_pickup']]) {
      const button = seller.getByRole('button', { name: label, exact: true });
      await button.waitFor();
      const rows = seller.locator('fieldset input[type="checkbox"]');
      assert.equal(await rows.count(), items.length);
      for (const row of await rows.all()) await row.check();
      await post(seller, '/api' + sellerPath + '/fulfillment', () => button.click(), 200);
      const current = (await inventory(epoch.db)).items.filter(item => item.order_id === orderId);
      assert.equal(current.length, items.length);
      assert.ok(current.every(item => item.fulfillment_status === state));
    }
    await staff.reload();
    await staff.getByRole('heading', { name: result.orderNumber, exact: true }).waitFor();
    for (const variant of accounts.variants) await staff.getByText('Size: ' + variant.label, { exact: false }).first().waitFor();
    const after = await inventory(epoch.db);
    const finalReviews = newRows(after.reviews, before.reviews, 'order_id');
    assert.equal(finalReviews.length, 1);
    assert.equal(finalReviews[0].order_id, orderId);
    assert.equal(finalReviews[0].status, 'confirmed');
    assert.equal(finalReviews[0].confirmed_by, admin.id);
    assert.deepEqual(newRows(after.offers, before.offers, 'order_item_id'), offers, 'Original variant snapshots changed');
    const finalItems = newRows(after.items, before.items, 'id');
    const itemFacts = (row: Record<string, unknown>) => [row.id, row.order_id, row.product_id, row.seller_id,
      row.product_name_snapshot, row.sku_snapshot, row.unit_price_paisa, row.quantity, row.line_total_paisa];
    assert.deepEqual(finalItems.map(itemFacts), items.map(itemFacts), 'Original item and price facts changed');
    const finalOrders = newRows(after.orders, before.orders, 'id');
    const orderFacts = (row: Record<string, unknown>) => [row.id, row.order_number, row.customer_id, row.shipping_address_json,
      row.item_subtotal_paisa, row.delivery_charge_paisa, row.grand_total_paisa, row.payment_mode, row.payment_status];
    assert.deepEqual(finalOrders.map(orderFacts), [orderFacts(order)]);
    const sellerJourney = options.sellerJourney ? await options.sellerJourney({
      origin, db: epoch.db, signal, seller, foreignSeller, foreignCustomer: foreign,
      accounts, orderId, orderNumber: result.orderNumber,
    }) : undefined;
    const support = options.aftercareJourney ? await open(options.aftercareJourney.support, '/security') : undefined;
    if (support && options.aftercareJourney) {
      await activateAuthenticator(support, options.aftercareJourney.support.password);
    }
    const aftercare = options.aftercareJourney && support ? await (async () => {
      const finance = options.aftercareJourney!.finance;
      let paid: Awaited<ReturnType<typeof runFinanceBeforeReturn>> | undefined;
      const aftercare = await runAftercareJourney({epoch,origin,signal,accounts,buyer,staff,foreign,support,
        supportId:options.aftercareJourney!.support.id,orderId,orderNumber:result.orderNumber,order,items,offers,staffId:admin.id,
        beforeReturn: async source => { paid = await runFinanceBeforeReturn({epoch,...finance,seller,source,collectorId:admin.id,
          foreignSeller:{page:foreignSeller,id:accounts.foreignSeller.id}}); },
      });
      assert.ok(paid);
      const refundId = await approveOriginalReturnEntitlement({epoch,approver:finance.approver,returnId:aftercare.returnId,orderId});
      const caseSource=await epoch.db.prepare('SELECT operation_request_id FROM return_requests WHERE id=?').bind(aftercare.returnId)
        .first<{operation_request_id:string}>();
      const caseReader={page:buyer,id:accounts.buyer.id,audience:'customer' as const,href:'/orders/'+result.orderNumber+'#aftercare-title'};
      const approvedCaseNotice=await readCustomerCaseNotice({epoch,reader:caseReader,type:'return_request',sourceId:aftercare.returnId,
        sourceRequest:caseSource?.operation_request_id,previousId:aftercare.caseNotices.at(-1)?.id,recordSelector:'#aftercare-title',
        foreign:{...caseReader,page:foreign,id:accounts.foreignBuyer.id}});
      // Refresh genuine customer password authentication before private destination submission.
      await signInPackagedBrowser(buyer,origin,accounts.buyer,'/account/refunds');
      await buyer.waitForURL(origin+'/account/refunds');
      const refund = await runFinancePostPayoutRefund({epoch,...finance,buyer,seller,foreignBuyer:foreign,
        source:paid.source,refundId,paidPayoutId:paid.payout.payoutId,fundingStatementId:paid.funding.fundingStatementId,
        foreignBuyerId:accounts.foreignBuyer.id,walletSpend});
      const manual = await runFinanceManualCheckout({epoch,buyer,seller,verifier:finance.approver,accounts,originalOrderId:orderId,accountVersionId:finance.accountVersionId});
      return {...aftercare,approvedCaseNotice,finance:{beforeReturn:paid,refund,manual}};
    })() : undefined;
    const itemIds = items.map(item => String(item.id));
    const exception = options.exceptionJourney ? await runSeparateExceptionJourney({epoch,origin,signal,accounts,buyer,seller,staff,admin,originalOrderId:orderId,...options.exceptionJourney}) : undefined;
    const finalFulfillmentStatus = await readOriginalFulfillment(epoch.db, orderId, itemIds, aftercare ? 'delivered' : 'ready_for_pickup');
    const referral = options.referralManager ? await runReferralJourney({
      epoch, accounts, signal, buyer: foreign, referrer: buyer, seller, foreignSeller, open,
      manager: options.referralManager, originalOrderId: orderId, staff, staffId: admin.id,
      support: support && options.aftercareJourney ? {page: support, id: options.aftercareJourney.support.id} : undefined,
    }) : undefined;
    return { exception, aftercare, sellerJourney, giftWallet, walletSpend, referral, orderId, orderNumber: result.orderNumber, itemIds,
      offerIds: accounts.variants.map(variant => variant.id), finalFulfillmentStatus, staffFreshTotpChallenge: true };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}



async function runProgrammeCohort(options: {
  epoch: OwnedCommerceEpoch;
  accounts: Awaited<ReturnType<typeof prepareCommerceBrowser>>;
  signal: AbortSignal;
  seller: Page;
  foreignSeller: Page;
  manager: { page: Page; id: string };
  originalOrderId: string;
}) {
  const { epoch, accounts, signal, seller, foreignSeller, manager, originalOrderId } = options;
  const origin = epoch.runtime.APP_ORIGIN!;
  const db = epoch.db;
  const sellerId = accounts.seller.sellerId;
  const otherSellerId = accounts.foreignSeller.sellerId;
  signal.throwIfAborted();
  await epoch.assertOwned();
  const original = await readProgrammeOrder(db, originalOrderId);
  const state = await getCommonFeeState(db, Date.now());
  assert.deepEqual(state.issues, [], 'Programme fixture requires reconciled, paired current fee sources');
  assert.ok(state.current.registered && state.current.managed);
  const current = state.current.registered;
  assert.ok(original.items.every(item => item.seller_id === sellerId && Number(item.commission_bps) === current.basisPoints));
  const basisPoints = current.basisPoints < 10_000 ? current.basisPoints + 1 : current.basisPoints - 1;
  const date = nepalDateTimeInput(state.asOf + COMMISSION_NOTICE_MS + 86_400_000);
  const effectiveAt = parseNepalDateTime(date);
  const reason = 'Verify prospective common fee and exact seller consent in the isolated package.';

  async function submit(page: Page, path: string, button: Locator) {
    signal.throwIfAborted();
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url() === origin + path && result.request().method() === 'POST'),
      button.click(),
    ]);
    assert.equal(response.status(), 200, path);
    return response;
  }

  await manager.page.goto(origin + '/admin/commission');
  const management = manager.page.locator('#rate-management');
  await management.getByLabel('Fee percentage', { exact: true }).fill(String(basisPoints / 100));
  await management.getByLabel('Common start · Nepal time', { exact: true }).fill(date);
  await management.getByLabel('Policy reason', { exact: true }).fill(reason);
  await management.getByRole('button', { name: 'Review publication', exact: true }).click();
  const published = await submit(manager.page, '/api/admin/common-fee-policy',
    management.getByRole('button', { name: 'Confirm reviewed action', exact: true }));
  const receipt = await published.json() as { id: string; registeredSettingId: string; managedSettingId: string };
  await management.getByText('Both route versions were published with the same start.', { exact: true }).waitFor();
  const announced = await getCommonFeeState(db, Date.now());
  assert.deepEqual(announced.issues, []);
  assert.deepEqual(announced.current, state.current);
  const policy = announced.upcoming;
  assert.ok(policy && policy.id === receipt.id);
  assert.deepEqual([policy.registeredSettingId, policy.managedSettingId, policy.basisPoints, policy.effectiveAt, policy.reason, policy.replacesId],
    [receipt.registeredSettingId, receipt.managedSettingId, basisPoints, effectiveAt, reason, state.upcoming?.id ?? null]);
  assert.ok(effectiveAt - policy.publishedAt >= COMMISSION_NOTICE_MS);
  assert.equal(await db.prepare('SELECT published_by FROM commission_common_policies WHERE id=?')
    .bind(policy.id).first('published_by'), manager.id);

  const upcoming = (page: Page) => page.locator('#selling-fee-terms article')
    .filter({ has: page.getByRole('heading', { name: 'Upcoming selling fee · ' + basisPoints / 100 + '%', exact: true }) });
  await seller.goto(origin + '/seller');
  const offer = upcoming(seller);
  const accept = offer.getByRole('button', { name: 'Accept upcoming terms', exact: true });
  await accept.waitFor();
  assert.equal(await accept.isDisabled(), true);
  await offer.getByRole('checkbox').check();
  const accepted = await submit(seller, '/api/seller/fee-terms', accept);
  const acceptanceRequest = accepted.request().postDataJSON() as { requestId: string; versionId: string; accepted: boolean };
  assert.deepEqual([acceptanceRequest.versionId, acceptanceRequest.accepted], [receipt.registeredSettingId, true]);
  await offer.getByText('Accepted for this version', { exact: true }).waitFor();
  await foreignSeller.goto(origin + '/seller');
  await upcoming(foreignSeller).getByRole('button', { name: 'Accept upcoming terms', exact: true }).waitFor();
  const history = await db.prepare(`SELECT id, seller_id, commission_bps, accepted_by, accepted_at, acceptance_request_id
    FROM seller_agreement_acceptance_history WHERE commission_setting_version_id=? AND seller_id IN (?,?)`)
    .bind(receipt.registeredSettingId, sellerId, otherSellerId)
    .all<{ id: string; seller_id: string; commission_bps: number; accepted_by: string; accepted_at: number; acceptance_request_id: string }>();
  assert.equal(history.results.length, 1);
  const proof = history.results[0];
  assert.deepEqual([proof.seller_id, Number(proof.commission_bps), proof.accepted_by, proof.acceptance_request_id],
    [sellerId, basisPoints, accounts.seller.id, acceptanceRequest.requestId]);
  assert.ok(Number(proof.accepted_at) >= policy.publishedAt && Number(proof.accepted_at) < effectiveAt);

  // The mounted server still runs at actual time. Evaluate the same checkout consent reader at exact boundaries.
  const before = await getCommissionSetting(db, effectiveAt - 1);
  const after = await getCommissionSetting(db, effectiveAt);
  assert.deepEqual([before.versionId, before.basisPoints, after.versionId, after.basisPoints],
    [current.versionId, current.basisPoints, receipt.registeredSettingId, basisPoints]);
  const [currentProof, otherCurrentProof, futureProof, otherFutureProof] = await Promise.all([
    getCommissionCheckoutAcceptance(db, sellerId, before, effectiveAt - 1),
    getCommissionCheckoutAcceptance(db, otherSellerId, before, effectiveAt - 1),
    getCommissionCheckoutAcceptance(db, sellerId, after, effectiveAt),
    getCommissionCheckoutAcceptance(db, otherSellerId, after, effectiveAt),
  ]);
  assert.ok(currentProof && otherCurrentProof);
  assert.notEqual(currentProof.id, proof.id);
  assert.deepEqual(futureProof, { kind: 'current_acceptance', id: proof.id });
  assert.equal(otherFutureProof, null);

  const originalSellerOrder = '/seller/orders/' + originalOrderId;
  await seller.goto(origin + originalSellerOrder);
  await seller.getByText('Snapshotted marketplace commission', { exact: true }).waitFor();
  assert.equal((await foreignSeller.goto(origin + originalSellerOrder))?.status(), 404);
  assert.deepEqual(await readProgrammeOrder(db, originalOrderId), original);
  return { policyId: policy.id, registeredSettingId: policy.registeredSettingId, managedSettingId: policy.managedSettingId,
    effectiveAt, currentBasisPoints: current.basisPoints, nextBasisPoints: basisPoints, upcomingConsentId: proof.id,
    boundaryConsent: { before: [currentProof.id, otherCurrentProof.id], at: [futureProof.id, otherFutureProof] } };
}

async function readProgrammeOrder(db: D1Database, orderId: string) {
  const items = (await db.prepare(`SELECT id, seller_id, commission_bps, commission_base_paisa, commission_paisa
    FROM order_items WHERE order_id=? ORDER BY id`).bind(orderId).all<{
      id: string; seller_id: string; commission_bps: number; commission_base_paisa: number; commission_paisa: number;
    }>()).results;
  assert.ok(items.length > 0);
  const acceptance = await db.prepare('SELECT terms_snapshot_json FROM order_policy_acceptances WHERE order_id=?')
    .bind(orderId).first<string>('terms_snapshot_json');
  assert.ok(acceptance);
  return { items, acceptance };
}

async function runReferralJourney(options: {
  epoch: OwnedCommerceEpoch;
  accounts: Awaited<ReturnType<typeof prepareCommerceBrowser>>;
  signal: AbortSignal;
  buyer: Page;
  referrer: Page;
  seller: Page;
  foreignSeller: Page;
  open: (actor: Actor, path: string) => Promise<Page>;
  manager: { page: Page; id: string };
  originalOrderId: string;
  staff: Page;
  staffId: string;
  support?: {page: Page; id: string};
}) {
  const { epoch, accounts, signal, buyer, referrer, seller, foreignSeller, open, manager, originalOrderId, staff, staffId, support } = options;
  await epoch.assertOwned();
  const origin = epoch.runtime.APP_ORIGIN!;
  const db = epoch.db;
  const variant = accounts.variants[1];
  const campaign = () => db.prepare(`SELECT enabled, friend_discount_paisa AS discount,
    reward_paisa AS reward, minimum_subtotal_paisa AS minimum, return_window_days AS waitDays,
    updated_at AS updatedAt FROM referral_campaign WHERE id='default'`)
    .first<{ enabled: number; discount: number; reward: number; minimum: number; waitDays: number; updatedAt: number }>();
  const original = await campaign();
  assert.ok(original && Number(original.enabled) === 1 && Number(original.minimum) <= Number(variant.price) * 100,
    'Referral journey requires an existing active offer applicable to the original catalogue fixture');
  const programme = await runProgrammeCohort(options);
  const revisedDiscount = Number(original.discount) + (Number(original.discount) + 100 < Number(original.minimum)
    && Number(original.discount) <= 999_900 ? 100 : -100);
  assert.ok(revisedDiscount >= 100 && revisedDiscount % 100 === 0);

  const referralsPath = '/account/referrals';
  await referrer.goto(origin + referralsPath);
  const code = await referrer.getByLabel('Your referral code', { exact: true }).inputValue();
  const invitation = new URL(await referrer.getByLabel('Your invitation link', { exact: true }).inputValue());
  assert.equal(invitation.origin, origin);
  assert.equal(await db.prepare('SELECT user_id FROM wallet_accounts WHERE referral_code=?')
    .bind(code).first('user_id'), accounts.buyer.id);

  async function submit(page: Page, path: string, method: string, button: string, status: number) {
    signal.throwIfAborted();
    const [response] = await Promise.all([
      page.waitForResponse(value => value.url() === origin + path && value.request().method() === method),
      page.getByRole('button', { name: button, exact: true }).click(),
    ]);
    assert.equal(response.status(), status, path);
    return response;
  }
  async function prepareCheckout(page: Page, phone: string) {
    await page.goto(invitation.href);
    await page.waitForURL(url => url.origin === origin && url.pathname === '/referral-terms');
    await page.goto(origin + '/products/' + accounts.slug);
    await page.getByLabel('Size', { exact: true }).selectOption(variant.value);
    await submit(page, '/api/cart', 'POST', 'Add to cart', 200);
    await page.getByText('Added to your cart.', { exact: true }).waitFor();
    await page.goto(origin + '/checkout');
    assert.ok(await page.locator('#referral-code').inputValue() === code, 'The invited checkout should retain its referral code');
    await page.getByLabel(/^Recipient name/).fill('Fictional Referral Recipient');
    await page.getByLabel(/^Recipient phone/).fill(phone);
    await page.locator('#province').click();
    await page.getByRole('option', { name: 'Bagmati', exact: true }).click();
    await page.getByLabel(/^District/).fill('Kathmandu');
    await page.getByLabel(/^Municipality/).fill('Kathmandu');
    await page.getByLabel(/^Street, tole or locality/).fill('Fictional Referral Ward');
    await page.getByRole('radio', { name: /Cash on delivery/ }).check();
    await page.locator('#checkout-terms').check();
    await page.getByText('Referral discount (subject to eligibility)', { exact: true }).waitFor();
  }

  await prepareCheckout(buyer, '9822222222');
  const response = await submit(buyer, '/api/checkout', 'POST', 'Place COD order', 201);
  const { orderNumber } = await response.json() as { orderNumber: string };
  const receipt = '/orders/' + orderNumber;
  await buyer.waitForURL(origin + receipt);
  const order = await db.prepare('SELECT id, customer_id, referral_discount_paisa FROM orders WHERE order_number=?')
    .bind(orderNumber).first<{ id: string; customer_id: string; referral_discount_paisa: number }>();
  assert.ok(order && order.id !== originalOrderId);
  assert.deepEqual([order.customer_id, Number(order.referral_discount_paisa)], [accounts.foreignBuyer.id, Number(original.discount)]);
  const readTerms = () => db.prepare(`SELECT customer_id, referrer_id, reward_paisa, wait_days, status
    FROM referral_redemptions WHERE order_id=?`).bind(order.id).first<{
      customer_id: string; referrer_id: string; reward_paisa: number; wait_days: number; status: string;
    }>();
  const terms = await readTerms();
  assert.ok(terms);
  assert.deepEqual([terms.customer_id, terms.referrer_id, Number(terms.reward_paisa), Number(terms.wait_days), terms.status],
    [accounts.foreignBuyer.id, accounts.buyer.id, Number(original.reward), Number(original.waitDays), 'pending']);

  const readAcceptance = (id: string) => db.prepare(`SELECT actor_user_id, acceptance_method, terms_snapshot_json
    FROM order_policy_acceptances WHERE order_id=?`).bind(id).first<{
      actor_user_id: string; acceptance_method: string; terms_snapshot_json: string;
    }>();
  const [acceptance, priorAcceptance] = await Promise.all([readAcceptance(order.id), readAcceptance(originalOrderId)]);
  assert.ok(acceptance && priorAcceptance);
  assert.deepEqual([acceptance.actor_user_id, acceptance.acceptance_method],
    [accounts.foreignBuyer.id, 'affirmative_checkbox']);
  const consent = JSON.parse(acceptance.terms_snapshot_json).sellerCommissionConsent[accounts.seller.sellerId];
  assert.ok(consent && typeof consent.id === 'string' && consent.id.length > 0);
  assert.deepEqual(consent, JSON.parse(priorAcceptance.terms_snapshot_json).sellerCommissionConsent[accounts.seller.sellerId]);
  const sellerOrder = '/seller/orders/' + order.id;
  await seller.goto(origin + sellerOrder);
  await seller.getByText('Snapshotted marketplace commission', { exact: true }).waitFor();
  assert.equal((await foreignSeller.goto(origin + sellerOrder))?.status(), 404);
  const itemTerms = await db.prepare(`SELECT seller_id, commission_base_paisa, platform_discount_paisa,
    referral_discount_paisa, line_total_paisa FROM order_items WHERE order_id=?`)
    .bind(order.id).first<{ seller_id: string; commission_base_paisa: number; platform_discount_paisa: number;
      referral_discount_paisa: number; line_total_paisa: number }>();
  assert.ok(itemTerms);
  assert.equal(itemTerms.seller_id, accounts.seller.sellerId);
  const prospectiveOrder = await readProgrammeOrder(db, order.id);
  assert.ok(prospectiveOrder.items.every(item => Number(item.commission_bps) === programme.currentBasisPoints));
  assert.notEqual(consent.id, programme.upcomingConsentId);
  assert.deepEqual([Number(itemTerms.commission_base_paisa), Number(itemTerms.line_total_paisa)],
    [Number(variant.price) * 100, Number(variant.price) * 100]);
  assert.deepEqual([Number(itemTerms.platform_discount_paisa), Number(itemTerms.referral_discount_paisa)],
    [Number(original.discount), Number(original.discount)]);

  const staleActor = await createActor(db, accounts.buyer.id + '-referral-stale', 'customer', Date.now(), '9833333333');
  const stale = await open(staleActor, '/account/orders');
  await prepareCheckout(stale, '9833333333');

  const settings = '/admin/referrals?view=settings';
  await manager.page.goto(origin + settings);
  const form = manager.page.locator('form').filter({ has: manager.page.locator('input[name="discount"]') });
  await form.locator('input[name="discount"]').fill(String(revisedDiscount / 100));
  const reason = 'Review the next fictional referral checkout in the isolated package.';
  await form.getByLabel(/Reason for this change/).fill(reason);
  await form.getByRole('button', { name: 'Review changes', exact: true }).click();
  const changed = await submit(manager.page, '/api/admin/referrals', 'PUT', 'Confirm and save offer', 200);
  assert.equal((await changed.json()).saved, true);
  await manager.page.getByText('Offer saved. Existing orders keep their original offer.', { exact: true }).waitFor();
  const current = await campaign();
  assert.ok(current && Number(current.updatedAt) > Number(original.updatedAt));
  assert.equal(Number(current.discount), revisedDiscount);
  const request = changed.request().postDataJSON() as { requestId: string };
  const audit = await db.prepare(`SELECT id, actor_id, reason, previous_json, next_json FROM audit_logs
    WHERE action='referral.offer.updated' AND subject_type='referral_campaign' AND subject_id='default' AND request_id=?`)
    .bind(request.requestId).first<{ id: string; actor_id: string; reason: string; previous_json: string; next_json: string }>();
  assert.ok(audit);
  assert.deepEqual([audit.actor_id, audit.reason], [manager.id, reason]);
  assert.equal(Number(JSON.parse(audit.previous_json).friendDiscountPaisa), Number(original.discount));
  assert.equal(Number(JSON.parse(audit.next_json).friendDiscountPaisa), revisedDiscount);
  const denied = await seller.evaluate(async (body) => {
    const response = await fetch('/api/admin/referrals', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return response.status;
  }, changed.request().postDataJSON());
  assert.equal(denied, 403);
  assert.deepEqual(await campaign(), current);
  assert.equal(Number(await db.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action='referral.offer.updated' AND request_id=?")
    .bind(request.requestId).first('total')), 1);

  const rejection = await submit(stale, '/api/checkout', 'POST', 'Place COD order', 409);
  assert.equal((await rejection.json()).code, 'quote_changed');
  await stale.getByRole('button', { name: 'Review updated checkout', exact: true }).waitFor();
  assert.ok(await stale.locator('#referral-code').inputValue() === code, 'Quote rejection should retain the selected referral code');
  assert.equal(await stale.getByLabel(/^Street, tole or locality/).inputValue(), 'Fictional Referral Ward');
  assert.equal(await db.prepare('SELECT id FROM orders WHERE customer_id=?').bind(staleActor.id).first(), null);
  assert.equal(await db.prepare('SELECT order_id FROM referral_redemptions WHERE customer_id=?').bind(staleActor.id).first(), null);
  assert.deepEqual(await readTerms(), terms);
  assert.deepEqual(await readAcceptance(order.id), acceptance);
  assert.equal(Number(await db.prepare('SELECT referral_discount_paisa FROM orders WHERE id=?')
    .bind(order.id).first('referral_discount_paisa')), Number(original.discount));

  await referrer.goto(origin + referralsPath);
  await referrer.getByText('Awaiting delivery and collection', { exact: true }).waitFor();
  assert.equal((await referrer.goto(origin + receipt))?.status(), 404);
  await manager.page.goto(origin + '/admin/referrals?view=activity&q=' + encodeURIComponent(orderNumber));
  await manager.page.getByText(orderNumber, { exact: true }).first().waitFor();
  const rewardLifecycle = support ? await runReferralRewardHold({
    epoch, signal, buyer, referrer, seller, staff, staffId, support, manager: manager.page,
    buyerId: accounts.foreignBuyer.id, referrerId: accounts.buyer.id, sellerId: accounts.seller.sellerId,
    orderId: order.id, orderNumber, waitDays: Number(terms.wait_days),
  }) : undefined;
  assert.deepEqual(await readTerms(), terms);
  return { programme, rewardLifecycle, orderId: order.id, campaignAuditId: audit.id, originalDiscountPaisa: Number(original.discount),
    revisedDiscountPaisa: revisedDiscount, staleQuoteStatus: 409, foreignReceiptStatus: 404, foreignSellerStatus: 404, sellerCampaignWriteStatus: 403 };
}
async function runReferralRewardHold(input: {
  epoch: OwnedCommerceEpoch; signal: AbortSignal;
  buyer: Page; referrer: Page; seller: Page; staff: Page; manager: Page; support: {page: Page; id: string};
  buyerId: string; referrerId: string; sellerId: string; staffId: string;
  orderId: string; orderNumber: string; waitDays: number;
}) {
  const {epoch, signal, buyer, referrer, seller, staff, manager, support, buyerId,
    referrerId, sellerId, staffId, orderId, orderNumber, waitDays} = input;
  await epoch.assertOwned();
  const {db, runtime} = epoch;
  const origin = runtime.APP_ORIGIN!;
  const staffPath = '/admin/orders/' + orderId;
  const receipt = '/orders/' + orderNumber;
  const rows = async (sql: string, ...params: string[]) =>
    (await db.prepare(sql).bind(...params).all<AftercareRow>()).results;
  const one = async (sql: string, ...params: string[]) => {
    const result = await rows(sql, ...params);
    assert.equal(result.length, 1);
    return result[0];
  };
  const post = async (page: Page, path: string, click: () => Promise<void>, expected = 200) => {
    signal.throwIfAborted();
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url() === origin + path && response.request().method() === 'POST'),
      click(),
    ]);
    assert.equal(response.status(), expected, path);
    return response;
  };
  const startingBalance = await readWalletBalance(epoch, referrerId);
  const requirePendingCredit = async (label: string) => {
    await referrer.goto(origin + '/account/referrals');
    await referrer.getByText(label, {exact: true}).first().waitFor();
    assert.deepEqual(await rows("SELECT id FROM wallet_entries WHERE order_id=? AND kind='referral_reward'", orderId), []);
    assert.equal(await readWalletBalance(epoch, referrerId), startingBalance);
  };
  await requirePendingCredit('Awaiting delivery and collection');

  await staff.goto(origin + staffPath);
  const firstCodReview = () => db.prepare('SELECT status, confirmed_by FROM first_cod_reviews WHERE order_id=?')
    .bind(orderId).first<{status: string; confirmed_by: string | null}>();
  const review = await firstCodReview();
  if (review) {
    assert.equal(review.status, 'pending');
    const confirmation = staff.locator('form[data-form-id="staff.first-cod-confirmation"]');
    await confirmation.getByLabel('Confirmation reason').fill('Confirm the separate fictional referred customer and their first COD order.');
    await post(staff, '/api' + staffPath + '/first-cod-confirmation', () =>
      confirmation.getByRole('button', {name: 'Confirm COD order', exact: true}).click());
    assert.deepEqual(await firstCodReview(), {status: 'confirmed', confirmed_by: staffId});
  }

  const sellerPath = '/seller/orders/' + orderId;
  await seller.goto(origin + sellerPath);
  for (const [label, state] of [['Start selected preparation', 'packing'], ['Selected items ready for pickup', 'ready_for_pickup']]) {
    const button = seller.getByRole('button', {name: label, exact: true});
    await button.waitFor();
    const selection = seller.locator('fieldset input[type="checkbox"]');
    assert.equal(await selection.count(), 1);
    await selection.check();
    await post(seller, '/api' + sellerPath + '/fulfillment', () => button.click());
    assert.equal((await one('SELECT fulfillment_status FROM order_items WHERE order_id=?', orderId)).fulfillment_status, state);
  }

  await staff.reload();
  const order = await one('SELECT grand_total_paisa FROM orders WHERE id=?', orderId);
  const {parcelId, due, cash} = await runDeliveredCodParcel({
    buyer, staff, origin, orderId, orderNumber, staffId, sellerId, grandTotalPaisa: Number(order.grand_total_paisa),
    rows, one, post,
  });
  assert.equal(Number((await one('SELECT remitted_paisa FROM shipping_parcels WHERE shipping_job_id=?', parcelId)).remitted_paisa), 0);
  const remittanceClaimId = String(cash[1].id);
  const reconciliation = await runFinanceCodRemittance({epoch, approver: manager, collectorId: staffId,
    source: {orderId, orderNumber, buyerId, sellerId, parcelId, remittanceClaimId, duePaisa: due},
  });
  const delivered = await one('SELECT status, payment_status, delivered_at FROM orders WHERE id=?', orderId);
  assert.deepEqual([delivered.status, delivered.payment_status], ['delivered', 'paid']);
  assert.ok((await rows("SELECT id FROM payments WHERE order_id=? AND status='captured'", orderId)).length > 0);
  assert.equal(Number((await one('SELECT remitted_paisa FROM shipping_parcels WHERE shipping_job_id=?', parcelId)).remitted_paisa), due);

  const deliveredAt = Number(delivered.delivered_at);
  const eligibleAfter = deliveredAt + waitDays * 86_400_000;
  assert.ok(Number.isSafeInteger(deliveredAt) && deliveredAt > 0 && Number.isSafeInteger(waitDays) && waitDays >= 7);
  const requireWaitingPeriod = async () => {
    assert.ok(Date.now() < eligibleAfter, 'Use an owned order within its recorded referral waiting period');
    const displayDate = new Intl.DateTimeFormat('en-NP', {dateStyle: 'medium', timeZone: 'Asia/Kathmandu'}).format(eligibleAfter);
    await requirePendingCredit('Eligible after ' + displayDate);
  };
  await requireWaitingPeriod();

  await buyer.goto(origin + receipt);
  await buyer.getByRole('button', {name: 'Get help or raise a complaint'}).click();
  const complaintForm = buyer.locator('form[data-form-id="commerce.complaint"]');
  const itemId = String((await one('SELECT id FROM order_items WHERE order_id=?', orderId)).id);
  await complaintForm.locator('[name="orderItemId"]').selectOption(itemId);
  await complaintForm.locator('[name="category"]').selectOption('delivery');
  await complaintForm.locator('[name="subject"]').fill('Fictional referred order delivery question');
  await complaintForm.locator('[name="detail"]').fill('Please confirm the handoff record for this fictional delivery.');
  const complaint = await (await post(buyer, receipt + '/complaints', () =>
    complaintForm.getByRole('button', {name: 'Send complaint', exact: true}).click(), 201)).json() as {id: string};
  const readComplaint = () => one('SELECT order_id, order_item_id, customer_id, status FROM complaints WHERE id=?', complaint.id);
  assert.deepEqual(await readComplaint(), {order_id: orderId, order_item_id: itemId, customer_id: buyerId, status: 'open'});
  await requirePendingCredit('on hold');

  const complaintPath = '/admin/cases/complaints/' + complaint.id;
  await support.page.goto(origin + complaintPath);
  const action = support.page.locator('form[data-form-id="staff.complaint-case-action"]')
    .filter({has: support.page.getByRole('button', {name: 'Apply action', exact: true})});
  await action.getByLabel('Action', {exact: true}).selectOption('resolve');
  await action.getByLabel('Internal case note').fill('Checked the recorded courier handoff against the exact fictional order.');
  await action.getByLabel('Customer message').fill('We confirmed the delivery handoff on your fictional order.');
  await action.getByLabel('Resolution').fill('The recorded handoff answers the delivery question.');
  const resolved = await post(support.page, '/api/admin/complaints/' + complaint.id, () =>
    action.getByRole('button', {name: 'Apply action', exact: true}).click());
  const {idempotencyKey} = resolved.request().postDataJSON() as {idempotencyKey: string};
  assert.equal((await readComplaint()).status, 'resolved');
  assert.equal((await one("SELECT actor_id FROM complaint_events WHERE complaint_id=? AND request_id=? AND action='admin_resolve'",
    complaint.id, idempotencyKey)).actor_id, support.id);
  assert.equal((await one('SELECT delivered_at FROM orders WHERE id=?', orderId)).delivered_at, delivered.delivered_at);
  await requireWaitingPeriod();

  return {parcelId, receiptId: reconciliation.receiptId, complaintId: complaint.id,
    deliveredAt, waitDays, eligibleAfter, status: 'pending_waiting_period',
    rewardEntriesAfterResolution: 0, walletBalanceAfterResolution: startingBalance};
}
async function activateAuthenticator(page: Page, password: string) {
  const session = async () => (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
  const passwordSession = await session();
  assert.ok(passwordSession);
  const post = (route: string, data: Record<string, unknown>) => page.evaluate(async ({ route, data }) => {
    const response = await fetch('/api/security/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() as { setupId?: string; manualKey?: string; recoveryCodes?: string[]; status?: string } };
  }, { route, data });
  const setup = await post('setup', { password });
  assert.equal(setup.status, 200, 'Commerce operator authenticator setup receiver');
  const { setupId, manualKey } = setup.body;
  assert.ok(typeof setupId === 'string' && typeof manualKey === 'string', 'Authenticator setup returned a challenge');
  const counter = Math.floor(Date.now() / 30_000);
  const code = totpAtCounter(manualKey, counter);
  const confirm = await post('confirm', { setupId, password, code });
  assert.equal(confirm.status, 200, 'Commerce operator authenticator confirmation receiver');
  assert.ok(confirm.body.recoveryCodes?.length, 'The authenticator confirmation issued recovery codes');
  const activate = await post('confirm', { setupId, password, acknowledge: true });
  assert.equal(activate.status, 200, 'Commerce operator authenticator activation receiver');
  assert.equal(activate.body.status, 'active');
  const verified = await session();
  assert.ok(verified?.httpOnly && verified.sameSite === 'Lax' && verified.value !== passwordSession.value,
    'Commerce operator activation must rotate to a protected verified session');
  return { manualKey, counter };
}


async function signInPackagedBrowser(page: Page, origin: string, account: Actor, destination: string) {
  await page.goto(origin + '/login?return_to=' + encodeURIComponent(destination));
  const form = page.locator('form[data-form-id="identity.login-password"]');
  await form.locator('[name="email"]').fill(account.email);
  await form.locator('[name="password"]').fill(account.password);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert.equal((await response).status(), 303);
  const cookie = (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Lax', 'Genuine development session required');
}

export async function waitForPackagedStaffEnrollment(page: Page, origin: string) {
  // /auth/continue redirects authenticated identities directly to /security;
  // requireAuthenticatedUser sends pending sessions there with return_to=/security.
  // Both render the enrollment workspace. Accept no other destination or query.
  await page.waitForURL(url => {
    if (url.origin !== origin || url.pathname !== '/security' || url.hash) return false;
    const query = [...url.searchParams.entries()];
    return query.length === 0 || (query.length === 1 &&
      query[0][0] === 'return_to' && query[0][1] === '/security');
  });
}
export async function prepareCommerceStaff(db: D1Database, store: SecurityStore, grantorId: string, permission: 'order.manage' | 'support.manage' = 'order.manage'): Promise<Actor> {
  const id = 'commerce-staff-' + randomUUID(), email = id + '@local.hastabazaar.test';
  const password = Buffer.from(randomBytes(32)).toString('base64url'), now = Date.now(), credential = await passwordRecord(password);
  await store.registerStaff(id, now, [
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,'Fictional Commerce Operator','active','en',?,?)").bind(id,id,email,now,now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,'admin',?,?)").bind(id,grantorId,now),
    db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,credential.hash,credential.salt,now,now),
    db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)').bind(id,JSON.stringify([permission]),grantorId,now),
  ]);
  return {id,email,password};
}

const adminJourneyLimitedGrants = ['seller.application.review', 'product.review', 'catalog.manage', 'order.manage'] as const;

export async function preparePackagedAdminJourney(epoch: OwnedCommerceEpoch, store: SecurityStore, grantorId: string) {
  await epoch.assertOwned();
  const { db } = epoch;
  assert.equal((await store.readAccount(grantorId))?.value.status, 'active');
  async function enroll(role: 'admin' | 'super_admin', displayName: string): Promise<Actor> {
    const id = randomUUID(), email = id + '@local.hastabazaar.test';
    const password = Buffer.from(randomBytes(32)).toString('base64url'), credential = await passwordRecord(password);
    const now = Date.now();
    await epoch.assertOwned();
    await store.registerStaff(id, now, [
      db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)").bind(id, id, email, displayName, now, now),
      db.prepare('INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,?,?,?)').bind(id, role, grantorId, now),
      db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, credential.hash, credential.salt, now, now),
      ...(role === 'admin' ? [db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)')
        .bind(id, JSON.stringify(adminJourneyLimitedGrants), grantorId, now)] : []),
    ]);
    assert.equal((await store.readAccount(id))?.value.status, 'pending');
    return { id, email, password };
  }
  const limitedStaff = await enroll('admin', 'Fictional Admin Journey Staff');
  const superAdmin = await enroll('super_admin', 'Fictional Admin Journey Super Admin');
  return { limitedStaff, superAdmin };
}

const adminJourneyAreas = [
  { area: 'A01', path: '/admin', heading: 'Overview', limited: 'Overview' },
  { area: 'A02', path: '/admin/sellers', heading: 'Seller management', limited: 'Seller management' },
  { area: 'A03', path: '/admin/catalog', heading: 'Categories and occasions', limited: 'Categories and occasions' },
  { area: 'A04', path: '/admin/orders', heading: 'Orders', limited: 'Orders' },
  { area: 'A05', path: '/admin/payments', heading: 'Incoming payments', limited: null },
  { area: 'A06', path: '/admin/fees', heading: 'Fees, programs & promotions', limited: null },
  { area: 'A07', path: '/admin/team', heading: 'Team & business policies', limited: 'My responsibilities' },
  { area: 'A08', path: '/admin/system-health', heading: 'System health & records', limited: null },
] as const;

export async function runPackagedAdminJourney(options: {
  epoch: OwnedCommerceEpoch;
  browser: Browser;
  origin: string;
  signal: AbortSignal;
  actors: Awaited<ReturnType<typeof preparePackagedAdminJourney>>;
  commerce: Awaited<ReturnType<typeof runCommerceBrowser>>;
  productId: string;
  commerceOperatorId: string;
}) {
  const { epoch, browser, origin, signal, actors, commerce, productId, commerceOperatorId } = options;
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.hostname === '127.0.0.1' && url.protocol === 'http:' && url.port && url.port !== '3018');
  assert.equal(epoch.runtime.APP_ORIGIN, origin);
  await epoch.assertOwned();
  const contexts: BrowserContext[] = [];
  async function openPage() {
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    return context.newPage();
  }

  async function freshStaffSession(account: Actor) {
    const enrollment = await openPage();
    await signInPackagedBrowser(enrollment, origin, account, '/security');
    await waitForPackagedStaffEnrollment(enrollment, origin);
    const { manualKey, counter } = await activateAuthenticator(enrollment, account.password);
    await enrollment.context().close();

    const page = await openPage();
    assert.deepEqual(await page.context().cookies(), []);
    await signInPackagedBrowser(page, origin, account, '/admin');
    const challenge = page.locator('form[data-form-id="system.security-mfa-verify"]');
    await challenge.getByText('Password confirmed.', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/security');
    const session = async () => (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
    const pending = await session();
    assert.ok(pending);
    while (Math.floor(Date.now() / 30_000) <= counter) await delay(200, undefined, { signal });
    await challenge.getByLabel('Authenticator code', { exact: true }).fill(totpAtCounter(manualKey, Math.floor(Date.now() / 30_000)));
    const verification = page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/security/verify');
    await challenge.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    assert.equal((await verification).status(), 200);
    await page.waitForURL(origin + '/admin');
    const verified = await session();
    assert.ok(verified?.httpOnly && verified.sameSite === 'Lax' && verified.value !== pending.value,
      'Fresh authenticator verification must rotate the password-only session');
    return page;
  }

  const main = (page: Page) => page.locator('#main-content');
  const nav = (page: Page) => page.getByRole('navigation', { name: 'Staff workspace' });
  async function visit(page: Page, path: string, heading: string) {
    const link = nav(page).locator('a[href="' + path + '"]');
    await link.click();
    await page.waitForURL(origin + path);
    await main(page).getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(await link.getAttribute('aria-current'), 'page');
  }
  async function deny(page: Page, path: string) {
    await page.goto(origin + '/admin');
    await main(page).getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    assert.equal(await nav(page).locator('a[href="' + path + '"]').count(), 0, path + ' leaked through restricted navigation');
    await page.goto(origin + path);
    await page.waitForURL(origin + '/staff-access-denied');
    await page.goto(origin + '/admin');
    await main(page).getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  }

  const readSourceFacts = async () => {
    const { db } = epoch;
    const order = await db.prepare('SELECT order_number,status,payment_status,updated_at FROM orders WHERE id=?').bind(commerce.orderId).first();
    const review = await db.prepare("SELECT id,actor_id,request_id FROM audit_logs WHERE subject_type='order' AND subject_id=? AND action='order.first_cod_confirmed'").bind(commerce.orderId).all<{id: string; actor_id: string}>();
    const product = await db.prepare("SELECT c.id AS caseId,c.state,c.revision,l.base_version_id AS publishedVersion,t.id AS taskId FROM product_publication_links l JOIN product_intake_cases c ON c.draft_id=l.draft_id JOIN review_tasks t ON t.source_id=c.id AND t.source_type='product_intake_review' WHERE l.product_id=?").bind(productId).all<{caseId: string; state: string; publishedVersion: string; taskId: string}>();
    assert.ok(order && order.order_number === commerce.orderNumber);
    assert.equal(review.results.length, 1);
    assert.equal(review.results[0].actor_id, commerceOperatorId);
    assert.equal(product.results.length, 1);
    assert.equal(product.results[0].state, 'resolved');
    assert.ok(product.results[0].publishedVersion);
    return { order, codAudit: review.results[0], product: product.results[0] };
  };

  try {
    // Each session starts in a fresh context after its own enrollment.
    const limited = await freshStaffSession(actors.limitedStaff);
    const owner = await freshStaffSession(actors.superAdmin);
    const before = await readSourceFacts();
    for (const area of adminJourneyAreas) {
      signal.throwIfAborted();
      await visit(owner, area.path, area.heading);
      if (area.limited) await visit(limited, area.path, area.limited);
      else await deny(limited, area.path);
    }
    await visit(owner, '/admin/homepage', 'Homepage products');
    await visit(owner, '/admin/reviews', 'Product reviews');
    await visit(limited, '/admin/reviews', 'Product reviews');
    await deny(limited, '/admin/homepage');
    await deny(limited, '/admin/products/publications');
    await deny(limited, '/admin/progress');
    await deny(limited, '/admin/system-health/records');

    // An existing commerce candidate is the completed product source for this run.
    await visit(owner, '/admin', 'Overview');
    await main(owner).getByText(/current health observations are unknown|System health is unknown: current observations could not be read/i).waitFor();
    const queue = owner.getByRole('region', { name: 'Shared review queue', exact: true });
    const search = queue.getByLabel('Find a seller, order, record or review type');
    await queue.getByRole('button', { name: 'Completed', exact: true }).click();
    await search.fill(before.product.caseId);
    await owner.waitForURL(url => url.searchParams.get('reviewQ') === before.product.caseId &&
      url.searchParams.get('reviewView') === 'completed');
    await queue.getByText('1 matching tasks · Page 1 of 1', { exact: true }).waitFor();
    const openReview = owner.locator('[id="review-task-' + before.product.taskId + '"] [data-review-open]');
    await openReview.click();
    await owner.waitForURL(url => url.pathname === '/admin/products/publications/' + before.product.caseId);
    await main(owner).getByRole('heading', { name: 'Submitted and published facts', exact: true }).waitFor();
    await main(owner).getByRole('link', { name: 'Back to results', exact: true }).click();
    await owner.waitForURL(url => url.pathname === '/admin' && url.searchParams.get('reviewQ') === before.product.caseId &&
      url.searchParams.get('reviewView') === 'completed' && url.hash === '#review-task-' + before.product.taskId);
    await owner.waitForFunction(taskId => document.activeElement === document.getElementById('review-task-' + taskId)?.querySelector('[data-review-open]'), before.product.taskId);
    assert.equal(await search.inputValue(), before.product.caseId);

    // Second actual source: the exact native first-COD confirmation audit row.
    await visit(owner, '/admin/system-health', 'System health & records');
    await owner.getByRole('navigation', { name: 'System health areas' }).getByRole('link', { name: 'Records & audit' }).click();
    await main(owner).getByRole('heading', { name: 'Records & audit', exact: true }).waitFor();
    const recordsFilter = owner.locator('form[data-form-id="staff.system-records-filter"]');
    const recordsReference = recordsFilter.locator('[name="reference"]');
    await recordsReference.fill(before.codAudit.id);
    await recordsFilter.locator('[name="type"]').fill('action');
    await recordsFilter.locator('[name="action"]').fill('order.first_cod_confirmed');
    await recordsFilter.getByRole('button', { name: 'Find scoped records', exact: true }).click();
    const filteredRecords = (url: URL) => url.pathname === '/admin/system-health/records' &&
      url.searchParams.get('reference') === before.codAudit.id && url.searchParams.get('type') === 'action' &&
      url.searchParams.get('action') === 'order.first_cod_confirmed';
    await owner.waitForURL(filteredRecords);
    const record = main(owner).locator('ol > li').filter({ hasText: before.codAudit.id });
    await record.getByText('Recorded actor: ' + commerceOperatorId, { exact: true }).waitFor();
    assert.equal(await main(owner).locator('ol > li').count(), 1);
    await record.getByRole('link', { name: 'Open authorized source', exact: true }).click();
    await owner.waitForURL(url => url.pathname === '/admin/orders/' + commerce.orderId);
    await main(owner).getByRole('heading', { name: commerce.orderNumber, exact: true }).waitFor();
    await main(owner).getByRole('link', { name: 'Back to results', exact: true }).click();
    await owner.waitForURL(filteredRecords);
    await record.getByText('Recorded actor: ' + commerceOperatorId, { exact: true }).waitFor();
    assert.equal(await recordsReference.inputValue(), before.codAudit.id);
    await epoch.assertOwned();
    assert.deepEqual(await readSourceFacts(), before, 'Navigation changed the exact source facts');
    return {
      areas: adminJourneyAreas.map(area => ({ area: area.area, path: area.path, superAdmin: 'visible', limitedStaff: area.limited ? 'visible' : 'denied' })),
      auth: 'fresh password and TOTP on both fictional staff accounts',
      completedProductTask: before.product.taskId, codConfirmationAudit: before.codAudit.id,
      verifiedReadback: ['product source, filter, selected row and focus', 'COD action audit source and filter', 'source row facts'],
      incomplete: ['A01 recorded-work actor/date/count browser reuse', 'A02 applicant document correction, review and activation',
        'A03 browser assistance, approval/publication actions and private cost/media fences', 'A04 aftercare and dispatch',
        'A05 payment action and original finance evidence', 'A06 effective-version and programme actions',
        'A07 assignments, policies and authority changes', 'A08 incident, email and form evidence workflows'],
    };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

// J5 additive composition. Deliberately callable only inside a newly admitted owned epoch.
export type FinanceOriginalSource = { orderId:string; orderNumber:string; sellerId:string; buyerId:string; parcelId:string; remittanceClaimId:string; duePaisa:number };
export const financeJourneySeparateScope = [
  'Managed/live/fixed parallel sources: reuse managed-live-financial-lifecycle and native payout fixtures',
  'Current/upcoming programmes, consent, referral reward release and promotions need their separate applicable paid/held fixtures',
  'Native races, replay, failure/no-debit/returned-debit and deadline edges remain constituent native gates',
] as const;
export function assertFinanceSourceIdentity(source:FinanceOriginalSource) {
  for(const key of ['orderId','orderNumber','sellerId','buyerId','parcelId','remittanceClaimId'] as const) assert.ok(typeof source[key]==='string'&&source[key].length>0,key);
  assert.ok(Number.isSafeInteger(source.duePaisa)&&source.duePaisa>0);
  assert.notEqual(source.sellerId,source.buyerId);
}
export async function prepareFinanceJourneyActors(epoch:OwnedCommerceEpoch,store:SecurityStore,grantorId:string) {
  await epoch.assertOwned(); assertCommerceRuntime(epoch.runtime);
  async function enroll(role:'admin'|'super_admin') {
    const id=randomUUID(),email=id+'@local.hastabazaar.test',password=Buffer.from(randomBytes(32)).toString('base64url'),credential=await passwordRecord(password),now=Date.now(),db=epoch.db;
    await store.registerStaff(id,now,[
      db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,'Fictional Finance Journey','active','en',?,?)").bind(id,id,email,now,now),
      db.prepare('INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,?,?,?)').bind(id,role,grantorId,now),
      db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,credential.hash,credential.salt,now,now),
      ...(role==='admin'?[db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)').bind(id,JSON.stringify(['payout.prepare','refund.approve.standard']),grantorId,now)]:[]),
    ]);
    assert.equal((await store.readAccount(id))?.value.status,'pending'); return {id,email,password};
  }
  return {preparer:await enroll('admin'),approver:await enroll('super_admin')};
}
export async function openFinanceJourneySession(options:{epoch:OwnedCommerceEpoch;browser:Browser;origin:string;signal:AbortSignal;actor:Actor}) {
  const {epoch,browser,origin,signal,actor}=options;
  await epoch.assertOwned(); assertCommerceRuntime(epoch.runtime);
  const u=new URL(origin); assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.ok(u.port&&u.port!=='3018');assert.equal(epoch.runtime.APP_ORIGIN,origin);
  async function context(){const c=await browser.newContext({serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());return c;}
  const enrollment=await context();let key:string,counter:number;
  try {const p=await enrollment.newPage();await signInPackagedBrowser(p,origin,actor,'/security');await waitForPackagedStaffEnrollment(p,origin);const result=await activateAuthenticator(p,actor.password);key=result.manualKey;counter=result.counter;} finally {await enrollment.close();}
  const active=await context();
  try {const page=await active.newPage();await signInPackagedBrowser(page,origin,actor,'/admin');const form=page.locator('form[data-form-id="system.security-mfa-verify"]');await form.getByText('Password confirmed.',{exact:false}).waitFor();
    while(Math.floor(Date.now()/30000)<=counter!)await delay(200,undefined,{signal});
    await form.getByLabel('Authenticator code',{exact:true}).fill(totpAtCounter(key!,Math.floor(Date.now()/30000)));
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/security/verify'&&r.request().method()==='POST');
    await form.getByRole('button',{name:'Verify and continue',exact:true}).click();assert.equal((await response).status(),200);await page.waitForURL(origin+'/admin');return page;
  }catch(error){await active.close();throw error;}
}
const financeReason='Independently review this exact original fictional source and retained evidence in the owned isolated epoch.';
const financeNepalTime=()=>new Date(Date.now()+345*60000).toISOString().slice(0,16);
async function financeClick(page:Page,path:string,click:()=>Promise<void>){const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await click();const response=await pending;assert.ok(response.ok(),path+' '+response.status()+' '+await response.text());return response.json();}
async function financeAction(page:Page,label:string,path:string,values:Record<string,string|boolean>,scope?:string) {
  const root=scope?page.locator(scope):page;
  const form=root.getByRole('form',{name:label,exact:true});
  await root.locator('summary').filter({hasText:label}).click();
  for(const [name,value]of Object.entries(values)){const field=form.locator('[name="'+name+'"]');if(typeof value==='boolean')await field.setChecked(value);else if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value);}
  const result=await financeClick(page,path,()=>form.getByRole('button',{name:label,exact:true}).click());await page.reload();return result;
}
export async function runFinanceCodRemittance(options:{epoch:OwnedCommerceEpoch;approver:Page;source:FinanceOriginalSource;collectorId:string}) {
  const {epoch,approver:page,source,collectorId}=options;await epoch.assertOwned();assertFinanceSourceIdentity(source);const db=epoch.db,origin=epoch.runtime.APP_ORIGIN!;
  const before=(await db.prepare('SELECT * FROM parcel_cash_records WHERE shipping_job_id=? ORDER BY id').bind(source.parcelId).all()).results;
  const identity='FICTIONAL-J5-HANDOVER-'+randomUUID();
  await page.goto(origin+'/admin/payments?order='+encodeURIComponent(source.orderNumber)+'&parcel='+encodeURIComponent(source.parcelId)+'&remittance='+encodeURIComponent(source.remittanceClaimId));
  await page.locator('summary').filter({hasText:'Record authorized company cash actually handed over'}).click();
  const fields:Record<string,string>={'Independent handover receipt identity':identity,'Actual collector name':'Fictional Original Collector','Collector account reference, when known':collectorId,'Authorized company cash custody reference':'FICTIONAL-CUSTODY-'+source.parcelId,'Cash actually received (paisa)':String(source.duePaisa),'Handover timestamp (Nepal time)':financeNepalTime(),'Independent authorized handover evidence':'FICTIONAL-HANDOVER-'+source.remittanceClaimId,'Company cash verification reason':financeReason};
  for(const [label,value]of Object.entries(fields))await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel('I independently confirmed the authorized company handover, amount and custody.',{exact:true}).check();
  await financeClick(page,'/api/admin/payments',()=>page.getByRole('button',{name:'Record actual company cash',exact:true}).click());await page.reload();
  const receipt=await db.prepare('SELECT id,amount_minor FROM company_money_receipts WHERE transaction_identity=?').bind(identity).first<{id:string;amount_minor:number}>();assert.ok(receipt);assert.equal(Number(receipt.amount_minor),source.duePaisa);
  await page.getByLabel('Collected parcel',{exact:true}).selectOption(source.parcelId);
  await page.getByLabel('Actual company receipt',{exact:true}).selectOption(receipt.id);
  await page.getByLabel('Actual cash to allocate (paisa; 0 for costs only)',{exact:true}).fill(String(source.duePaisa));
  await page.getByLabel('Existing collector claim or historical report',{exact:true}).selectOption(source.remittanceClaimId);
  await page.getByLabel('Receipt / parcel allocation evidence reference',{exact:true}).fill('FICTIONAL-EXACT-'+identity);
  await page.getByLabel('Independent reconciliation and cost decision',{exact:true}).fill(financeReason);
  await financeClick(page,'/api/admin/payments',()=>page.getByRole('button',{name:'Record exact COD reconciliation',exact:true}).click());
  const allocation=await db.prepare('SELECT * FROM cod_company_receipt_allocations WHERE shipping_job_id=? AND receipt_id=?').bind(source.parcelId,receipt.id).first<Record<string,unknown>>();assert.ok(allocation);assert.equal(Number(allocation.amount_paisa),source.duePaisa);assert.equal(allocation.cash_record_id,source.remittanceClaimId);
  const after=(await db.prepare('SELECT * FROM parcel_cash_records WHERE shipping_job_id=? ORDER BY id').bind(source.parcelId).all()).results;assert.equal(after.length,before.length,'Reconciliation must not recollect customer cash');
  return {receiptId:receipt.id,allocation,originalCash:before,reconciledCash:after};
}
// Prerequisites are native source facts, never repaired with balance or clock writes.
type JourneyNoticeReader = {page: Page; id: string; audience: 'customer' | 'seller' | 'staff'; href: string};

async function journeyNoticeItems(reader: JourneyNoticeReader, origin: string) {
  assert.equal(new URL(reader.page.url()).origin, origin);
  return reader.page.evaluate(async ({id,audience}) => {
    const result = await fetch('/api/notifications?audience=' + audience, {headers:{'X-Hastabazaar-Actor':id}});
    if (!result.ok) throw new Error('Notification panel rejected the signed-in journey actor: ' + result.status);
    return (await result.json() as {items: (SharedTeamPanelItem & {subjectEn:string})[]}).items;
  }, {id:reader.id,audience:reader.audience});
}

async function acknowledgeJourneyNotice(options:{
  epoch:OwnedCommerceEpoch; reader:JourneyNoticeReader; sourceId:string; type:string; template:string;
  eventKey:string; previousId?:string; foreign?:JourneyNoticeReader; recordSelector?:string; recordText?:string;
}) {
  const {epoch,reader,sourceId,type,template,eventKey,previousId,foreign,recordSelector,recordText}=options;
  await epoch.assertOwned();
  const origin=epoch.runtime.APP_ORIGIN!;
  const {page,id,audience,href}=reader;
  const matches=(await epoch.db.prepare(`SELECT id,read_at FROM notification_messages WHERE recipient_user_id=?
    AND audience_role=? AND related_type=? AND related_id=? AND template_key=? AND request_id=? AND channel='in_app'`)
    .bind(id,audience,type,sourceId,template,eventKey).all<{id:string;read_at:number|null}>()).results;
  assert.equal(matches.length,1,'Expected a single current in-app message for the exact actor and source event');
  const [notice]=matches;
  assert.equal(notice.read_at,null);
  const sameSource=(item:SharedTeamPanelItem)=>item.relatedId===sourceId&&item.relatedType===type;
  const restore=page.url();
  const listPath={customer:'/account/notifications',seller:'/seller/notifications',staff:'/admin/notifications'}[audience];
  assert.equal((await page.goto(origin+listPath))?.status(),200);
  const items=await journeyNoticeItems(reader,origin);
  assert.deepEqual(items.filter(sameSource).map(item=>[item.id,item.channel,item.readAt]),[[notice.id,'in_app',null]]);
  if(previousId) assert.ok(items.every(item=>item.id!==previousId),'Superseded notice must leave the panel');
  if(foreign) {
    assert.ok((await journeyNoticeItems(foreign,origin)).every(item=>!sameSource(item)));
    const foreignRows=await epoch.db.prepare(`SELECT id FROM notification_messages WHERE recipient_user_id=? AND audience_role=?
      AND related_type=? AND related_id=? AND template_key=?`).bind(foreign.id,foreign.audience,type,sourceId,template).all();
    assert.equal(foreignRows.results.length,0,'The other account must receive no channel for this source');
    const denied=await foreign.page.evaluate(async ({noticeId,actorId})=>{
      const response=await fetch('/api/notifications/'+noticeId+'/read',{method:'POST',headers:{'X-Hastabazaar-Actor':actorId}});
      return response.status;
    },{noticeId:notice.id,actorId:foreign.id});
    assert.equal(denied,404,'Another signed-in recipient cannot acknowledge the exact notice ID');
    assert.equal((await epoch.db.prepare('SELECT read_at FROM notification_messages WHERE id=?').bind(notice.id)
      .first<{read_at:number|null}>())?.read_at,null);
  }
  const subject=items.find(item=>item.id===notice.id)!.subjectEn;
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:subject,exact:true})})
    .filter({has:page.locator('a[href='+JSON.stringify(href)+']')});
  assert.equal(await card.count(),1);
  const mark=card.getByRole('button',{name:'Mark as read',exact:true});
  const readPath=(audience==='staff'?'/api/admin/notifications/':'/api/notifications/')+notice.id+'/read';
  const [response]=await Promise.all([page.waitForResponse(candidate=>candidate.url()===origin+readPath&&
    candidate.request().method()==='POST'),mark.click()]);
  assert.equal(response.status(),200);
  assert.deepEqual(await response.json(),{ok:true});
  const persisted=await epoch.db.prepare('SELECT read_at FROM notification_messages WHERE id=? AND recipient_user_id=?')
    .bind(notice.id,id).first<{read_at:number}>();
  assert.ok(Number(persisted?.read_at)>0);
  await page.reload();
  assert.equal(await mark.count(),0);
  assert.equal(Number((await journeyNoticeItems(reader,origin)).find(item=>item.id===notice.id)?.readAt),Number(persisted?.read_at));
  const destination=card.getByRole('link',{name:'Open related record',exact:true});
  await Promise.all([page.waitForURL(origin+href),destination.click()]);
  if(recordText) await page.getByText(recordText,{exact:true}).waitFor();
  if(recordSelector) await page.locator(recordSelector).waitFor();
  await page.goto(restore);
  return {id:notice.id,sourceId,eventKey,type,href,readAt:Number(persisted?.read_at),supersedes:previousId};
}

async function readCustomerCaseNotice(options:{
  epoch:OwnedCommerceEpoch; reader:JourneyNoticeReader; type:'return_request'|'complaint'; sourceId:string;
  sourceRequest:unknown; previousId?:string; foreign?:JourneyNoticeReader; recordSelector:string;
}) {
  assert.equal(typeof options.sourceRequest,'string');
  const template='business.'+options.type+'.update';
  const digest=createHash('sha256').update(JSON.stringify([template,options.sourceRequest,'customer'])).digest('hex');
  return acknowledgeJourneyNotice({...options,template,eventKey:'business:'+digest+':in_app'});
}

async function readFinanceJourneyNotice(options:{
  epoch:OwnedCommerceEpoch; reader:JourneyNoticeReader; family:'finance.refund'|'finance.payout'; sourceId:string;
  status:string; previousId?:string; foreign?:JourneyNoticeReader;
}) {
  const {epoch,family,sourceId,status}=options;
  const marker=await epoch.db.prepare('SELECT current_event_id,current_status FROM operational_notice_states WHERE family=? AND source_id=?')
    .bind(family,sourceId).first<{current_event_id:string;current_status:string}>();
  assert.equal(marker?.current_status,status);
  assert.ok(marker.current_event_id);
  return acknowledgeJourneyNotice({...options,type:family==='finance.refund'?'refund_obligation':'payout_transfer',
    template:'business.'+family,eventKey:'business:'+createHash('sha256').update(JSON.stringify(['business.'+family,marker.current_event_id,'owner'])).digest('hex')+':in_app',
    recordSelector:family==='finance.refund'?'#refund-'+sourceId:undefined,recordText:family==='finance.payout'?sourceId:undefined});
}

export async function runFinancePayoutPacket(options:{epoch:OwnedCommerceEpoch;preparer:Page;approver:Page;seller:Page;source:FinanceOriginalSource;payoutId:string;foreignSeller:{page:Page;id:string};accountVersionId:string;preparerId:string;approverId:string}) {
  const {epoch,preparer,approver,seller,source,payoutId,accountVersionId,preparerId,approverId}=options;await epoch.assertOwned();assertFinanceSourceIdentity(source);assert.notEqual(preparerId,approverId);const db=epoch.db,origin=epoch.runtime.APP_ORIGIN!;
  const entries=(await db.prepare('SELECT e.* FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id JOIN order_items i ON i.id=e.order_item_id WHERE pe.payout_id=? AND i.order_id=?').bind(payoutId,source.orderId).all()).results;assert.ok(entries.length,'Original order must fund this payout');
  const foreignBefore=(await db.prepare('SELECT * FROM seller_ledger_entries WHERE seller_id<>? ORDER BY id').bind(source.sellerId).all()).results;
  await preparer.goto(origin+'/admin/payments/payouts');
  await financeAction(preparer,'Prepare exact payout instruction','/api/admin/payout-transfers',{accountVersionId,reason:financeReason},'#payout-source-registered-'+payoutId);
  const read=()=>db.prepare('SELECT * FROM payout_transfer_packets WHERE registered_payout_id=?').bind(payoutId).first<Record<string,unknown>>();
  const original=await read();assert.ok(original);assert.equal(original.state,'prepared');assert.equal(original.prepared_by,preparerId);assert.equal(original.seller_id,source.sellerId);
  const sellerActor=await db.prepare('SELECT user_id FROM seller_profiles WHERE id=?').bind(source.sellerId).first<{user_id:string}>();
  assert.ok(sellerActor);
  const payoutNotice={epoch,family:'finance.payout' as const,sourceId:String(original.id),
    reader:{page:seller,id:sellerActor.user_id,audience:'seller' as const,href:'/seller/financial-notices/payout_transfer/'+original.id}};
  const foreignNotice={...payoutNotice.reader,...options.foreignSeller};
  const notices=[await readFinanceJourneyNotice({...payoutNotice,status:'packet_prepared',foreign:foreignNotice})];
  const snapshots:Record<string,unknown>[]=[original];
  for(const [label,state,values]of [
    ['Approve exact payout and source','approved',{}],['Begin one manual payout instruction','processing',{}],
    ['Record an uncertain payout outcome','uncertain',{evidenceReference:'FICTIONAL-PENDING-'+original.id}],
    ['Confirm actual completed payout','paid',{transactionIdentity:'FICTIONAL-PAID-'+original.id,bankAt:financeNepalTime(),completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-PAID-EVIDENCE-'+original.id}],
  ] as const){await approver.goto(origin+'/admin/payments/payouts');await financeAction(approver,label,'/api/admin/payout-transfers',{...values,reason:financeReason},'#packet-'+original.id);const row=await read();assert.ok(row);assert.equal(row.state,state);assert.equal(row.beneficiary_version_id,original.beneficiary_version_id);assert.equal(row.amount_paisa,original.amount_paisa);assert.equal(row.source_snapshot_json,original.source_snapshot_json);assert.equal(row.approved_by,approverId);snapshots.push(row);
    notices.push(await readFinanceJourneyNotice({...payoutNotice,status:state==='processing'?'packet_started':'packet_'+state,
      previousId:notices.at(-1)?.id,foreign:foreignNotice}));
  }
  assert.deepEqual((await db.prepare('SELECT * FROM seller_ledger_entries WHERE seller_id<>? ORDER BY id').bind(source.sellerId).all()).results,foreignBefore);
  await seller.goto(origin+'/seller/finance');await seller.locator('#main-content').getByText(/paid/i).first().waitFor();await epoch.assertOwned();return {payoutId,packetId:original.id,originalOrderId:source.orderId,snapshots,entries,notices};
}
export async function runFinanceManualAllocation(options:{epoch:OwnedCommerceEpoch;verifier:Page;orderId:string;orderNumber:string;accountVersionId:string;buyerId:string;duePaisa:number}) {
  const {epoch,verifier:page,orderId,orderNumber,accountVersionId,buyerId,duePaisa}=options;await epoch.assertOwned();const identity='FICTIONAL-J5-MANUAL-'+randomUUID();
  await page.goto(epoch.runtime.APP_ORIGIN+'/admin/payments?order='+encodeURIComponent(orderNumber));
  await page.locator('summary').filter({hasText:'Record an actual company bank credit'}).click();await page.getByLabel('Verified company account',{exact:true}).selectOption(accountVersionId);
  for(const [label,value]of Object.entries({'Bank timestamp (Nepal time)':financeNepalTime(),'Actual credited amount in minor units (paisa for NPR)':String(duePaisa),'Actual credited currency':'NPR','Independent bank transaction identity':identity,'Payer / independent matching context':'Original fictional authenticated buyer '+buyerId,'Restricted completed-credit evidence reference':'FICTIONAL-CREDIT-'+identity,'Verification reason':financeReason}))await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel('Verified payer account, if known',{exact:true}).selectOption(buyerId);await page.getByLabel('I independently checked completed company credit and the recorded interests.',{exact:true}).check();await financeClick(page,'/api/admin/payments',()=>page.getByRole('button',{name:'Record verified credit',exact:true}).click());await page.reload();
  const receipt=await epoch.db.prepare('SELECT id FROM company_money_receipts WHERE transaction_identity=?').bind(identity).first<{id:string}>();assert.ok(receipt);
  await page.getByLabel('Receipt',{exact:true}).selectOption(receipt.id);await page.getByLabel('Original order',{exact:true}).selectOption(orderId);await page.getByLabel('Amount to allocate (paisa)',{exact:true}).fill(String(duePaisa));await page.getByLabel('Independent matching rationale',{exact:true}).fill(financeReason);
  await financeClick(page,'/api/admin/payments',()=>page.getByRole('button',{name:'Record the exact allocation',exact:true}).click());
  const allocations=(await epoch.db.prepare('SELECT * FROM manual_payment_allocations WHERE order_id=? AND receipt_id=?').bind(orderId,receipt.id).all()).results;assert.equal(allocations.length,1);assert.equal(Number(allocations[0].amount_paisa),duePaisa);return {orderId,receiptId:receipt.id,allocations};
}
export async function runFinancePostPayoutRefund(options:{epoch:OwnedCommerceEpoch;preparer:Page;approver:Page;buyer:Page;seller:Page;foreignBuyer:Page;foreignBuyerId:string;source:FinanceOriginalSource;refundId:string;paidPayoutId:string;fundingStatementId:string;preparerId:string;approverId:string;
  walletSpend?: {orderId:string;spentPaisa:number;balanceAfterSpend:number;debit:OrderWalletEntry}}) {
  const {epoch,preparer,approver,buyer,seller,foreignBuyer,source,refundId,paidPayoutId,fundingStatementId,preparerId,approverId,walletSpend}=options;await epoch.assertOwned();assertFinanceSourceIdentity(source);assert.notEqual(preparerId,approverId);const db=epoch.db,origin=epoch.runtime.APP_ORIGIN!;
  const paid=await db.prepare("SELECT p.* FROM payout_transfer_packets p WHERE p.registered_payout_id=? AND p.seller_id=? AND p.state='paid'").bind(paidPayoutId,source.sellerId).first<Record<string,unknown>>();assert.ok(paid,'Customer refund must follow this original seller paid packet');
  const refund=await db.prepare('SELECT r.*,i.order_id,t.order_item_id FROM refunds r JOIN return_requests t ON t.id=r.return_request_id JOIN order_items i ON i.id=t.order_item_id WHERE r.id=?').bind(refundId).first<Record<string,unknown>>();assert.ok(refund);assert.equal(refund.order_id,source.orderId);
  let expectedWalletRefund = 0;
  if (walletSpend) {
    assert.equal(walletSpend.orderId, source.orderId);
    const statement = await db.prepare(
      "SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='order_statement' ORDER BY issued_at,id LIMIT 1",
    ).bind(source.orderId).first<{snapshot_json:string}>();
    assert.ok(statement, 'Refund must use the original issued line allocation');
    const {items} = JSON.parse(statement.snapshot_json) as {items:{orderItemId:string;lineTotalPaisa:number;billingWalletPaisa:number}[]};
    const line = items.find(item => item.orderItemId === refund.order_item_id);
    assert.ok(line && Number.isSafeInteger(line.billingWalletPaisa) && line.billingWalletPaisa > 0);
    assert.equal(refund.item_amount_paisa, line.lineTotalPaisa);
    expectedWalletRefund = line.billingWalletPaisa;
    assert.ok(expectedWalletRefund < walletSpend.spentPaisa, 'One returned line restores its share of the original debit');
    assert.equal(refund.wallet_credit_paisa, expectedWalletRefund);
    assert.deepEqual(await readOrderWalletEntries(epoch, source.orderId), [walletSpend.debit]);
    assert.equal(await readWalletBalance(epoch, source.buyerId), walletSpend.balanceAfterSpend);
  }
  await preparer.goto(origin+'/admin/payments/refunds?search='+encodeURIComponent(source.orderNumber));
  await financeAction(preparer,'Open original refund obligation','/api/admin/refunds',{reason:financeReason},'#refund-source-'+refundId);
  const obligation=await db.prepare("SELECT * FROM refund_obligations WHERE source_kind='return_refund' AND source_id=?").bind(refundId).first<Record<string,unknown>>();assert.ok(obligation);assert.equal(obligation.customer_id,source.buyerId);
  if (walletSpend) assert.equal(obligation.wallet_paisa, expectedWalletRefund);
  const refundNotice={epoch,family:'finance.refund' as const,sourceId:String(obligation.id),
    reader:{page:buyer,id:source.buyerId,audience:'customer' as const,href:'/account/refunds#refund-'+obligation.id}};
  const foreignNotice={...refundNotice.reader,page:foreignBuyer,id:options.foreignBuyerId};
  const notices=[await readFinanceJourneyNotice({...refundNotice,status:'opened',foreign:foreignNotice})];
  await buyer.goto(origin+'/account/refunds');const own=buyer.locator('article').filter({hasText:source.orderNumber});const destination=own.getByRole('form',{name:'Private refund destination',exact:true});
  for(const [name,value]of Object.entries({holder:'Fictional Original Buyer',bank:'Fictional Buyer Bank',branch:'Fictional Branch',accountNumber:'FICTIONAL-'+source.buyerId,evidenceReference:'FICTIONAL-BUYER-OWNERSHIP-'+obligation.id,authorization:'I authorize the exact original customer-owned fictional account for this original refund.',reason:financeReason}))await destination.locator('[name="'+name+'"]').fill(value);
  await financeClick(buyer,'/api/account/refunds',()=>destination.getByRole('button',{name:'Save private instructions for verification',exact:true}).click());
  notices.push(await readFinanceJourneyNotice({...refundNotice,status:'destination_submitted',previousId:notices.at(-1)?.id}));
  const beneficiary=await db.prepare('SELECT * FROM refund_destination_versions WHERE obligation_id=?').bind(obligation.id).first<Record<string,unknown>>();assert.ok(beneficiary);assert.equal(beneficiary.submitted_by,source.buyerId);
  await approver.goto(origin+'/admin/payments/refunds?obligation='+obligation.id);
  await financeAction(approver,'Verify exact beneficiary','/api/admin/refunds',{ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-VERIFY-'+beneficiary.id,reason:financeReason},'#refund-obligation-'+obligation.id);
  notices.push(await readFinanceJourneyNotice({...refundNotice,status:'destination_verified',previousId:notices.at(-1)?.id}));
  await preparer.goto(origin+'/admin/payments/refunds?obligation='+obligation.id);
  await financeAction(preparer,'Prepare exact refund packet','/api/admin/refunds',{destinationVersionId:String(beneficiary.id),fundingStatementId,reason:financeReason},'#refund-obligation-'+obligation.id);
  if (walletSpend) {
    assert.deepEqual(await readOrderWalletEntries(epoch, source.orderId), [walletSpend.debit]);
    assert.equal(await readWalletBalance(epoch, source.buyerId), walletSpend.balanceAfterSpend);
  }
  notices.push(await readFinanceJourneyNotice({...refundNotice,status:'packet_prepared',previousId:notices.at(-1)?.id}));
  const read=()=>db.prepare('SELECT * FROM outgoing_payment_packets WHERE obligation_id=?').bind(obligation.id).first<Record<string,unknown>>();const original=await read();assert.ok(original);assert.equal(original.prepared_by,preparerId);const snapshots:Record<string,unknown>[]=[original];
  for(const [label,state,values]of [
    ['Approve exact amount and source','approved',{}],['Begin one manual instruction','processing',{}],
    ['Record an uncertain outcome','uncertain',{evidenceReference:'FICTIONAL-REFUND-UNCERTAIN-'+original.id}],
    ['Confirm actual completed transfer','paid',{transactionIdentity:'FICTIONAL-REFUND-PAID-'+original.id,bankAt:financeNepalTime(),completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-REFUND-EVIDENCE-'+original.id}],
  ] as const){await approver.goto(origin+'/admin/payments/refunds?obligation='+obligation.id);await financeAction(approver,label,'/api/admin/refunds',{...values,reason:financeReason},'#refund-obligation-'+obligation.id);const row=await read();assert.ok(row);assert.equal(row.state,state);assert.equal(row.destination_version_id,original.destination_version_id);assert.equal(row.amount_paisa,original.amount_paisa);assert.equal(row.approved_by,approverId);snapshots.push(row);
    if (walletSpend && state !== 'paid') {
      assert.deepEqual(await readOrderWalletEntries(epoch, source.orderId), [walletSpend.debit]);
      assert.equal(await readWalletBalance(epoch, source.buyerId), walletSpend.balanceAfterSpend);
    }
    notices.push(await readFinanceJourneyNotice({...refundNotice,status:state==='processing'?'packet_started':'packet_'+state,
      previousId:notices.at(-1)?.id,foreign:foreignNotice}));
  }
  await approver.goto(origin+'/admin/payments/recoveries');const sourceScope=approver.locator('div').filter({has:approver.locator('p').filter({hasText:refundId})}).filter({has:approver.getByRole('form',{name:'Open original recovery review',exact:true})}).last();
  // Select the exact original source container, not the first recovery in the queue.
  const open=sourceScope.getByRole('form',{name:'Open original recovery review',exact:true});await sourceScope.locator('summary').filter({hasText:'Open original recovery review'}).click();await open.locator('[name="reason"]').fill(financeReason);await financeClick(approver,'/api/admin/recoveries',()=>open.getByRole('button',{name:'Open original recovery review',exact:true}).click());
  const recovery=await db.prepare("SELECT * FROM seller_recovery_cases WHERE source_kind='refund' AND source_id=?").bind(refundId).first<Record<string,unknown>>();assert.ok(recovery);assert.equal(recovery.seller_id,source.sellerId);assert.ok(Number(recovery.exposure_paisa)>0);
  await approver.goto(origin+'/admin/payments/recoveries/'+recovery.id);await financeAction(approver,'Approve reviewed recovery cap','/api/admin/recoveries',{evidenceReference:'FICTIONAL-ORIGINAL-RECOVERY-'+recovery.id,reason:financeReason});
  const retained=await db.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').bind(recovery.id).first<Record<string,unknown>>();assert.ok(retained);assert.equal(retained.approved_by,approverId);assert.ok(Number(retained.approved_cap_paisa)>0);assert.equal(Number(retained.absorbed_paisa),0);assert.equal(Number(retained.historical_recovered_paisa),0);
  const recoveries=(await db.prepare('SELECT * FROM seller_recovery_allocations WHERE case_id=?').bind(recovery.id).all()).results;assert.equal(recoveries.length,0,'Outstanding liability remains; no fabricated repayment');
  await buyer.goto(origin+'/account/refunds');await buyer.locator('article').filter({hasText:source.orderNumber}).getByText(/paid|completed/i).first().waitFor();
  await foreignBuyer.goto(origin+'/account/refunds');assert.equal(await foreignBuyer.getByText(source.orderNumber,{exact:false}).count(),0);
  await seller.goto(origin+'/seller/finance');const recoveryLink=seller.locator('a[href*="'+recovery.id+'"]');assert.equal(await recoveryLink.count(),1);await recoveryLink.click();await seller.getByText(source.orderNumber,{exact:false}).first().waitFor();
  assert.deepEqual(await db.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').bind(paid.id).first(),paid,'Refund must retain original completed payout');await epoch.assertOwned();
  const walletRefund = walletSpend ? await (async () => {
    const completed = await db.prepare('SELECT status FROM refunds WHERE id=?').bind(refundId).first<{status:string}>();
    assert.equal(completed?.status, 'paid');
    const credit = {
      id: 'refund:' + refundId, user_id: source.buyerId, kind: 'refund',
      amount_paisa: expectedWalletRefund, platform_amount_paisa: -expectedWalletRefund,
    };
    const entries = await readOrderWalletEntries(epoch, source.orderId);
    assert.deepEqual(entries, [credit, walletSpend.debit]);
    const balanceAfterRefund = await readWalletBalance(epoch, source.buyerId);
    assert.equal(balanceAfterRefund, walletSpend.balanceAfterSpend + expectedWalletRefund);
    await buyer.goto(origin + '/account/wallet');
    await requireWalletActivity(buyer, source.orderNumber, 'Return credit restored', expectedWalletRefund);
    await foreignBuyer.goto(origin + '/account/wallet');
    assert.equal(await foreignBuyer.getByText(source.orderNumber, {exact:false}).count(), 0);
    return {orderId:source.orderId, refundId, credit:entries[0], balanceAfterRefund};
  })() : undefined;
  return {originalOrderId:source.orderId,refundId,obligationId:obligation.id,packetId:original.id,snapshots,notices,walletRefund,recovery:retained,disposition:'approved original liability retained outstanding; no repayment or absorption',separateScope:financeJourneySeparateScope};
}
export async function runFinanceOriginalPayoutRequest(options:{epoch:OwnedCommerceEpoch;seller:Page;preparer:Page;source:FinanceOriginalSource}) {
  const {epoch,seller,preparer,source}=options;await epoch.assertOwned();assertFinanceSourceIdentity(source);const origin=epoch.runtime.APP_ORIGIN!,db=epoch.db;
  await preparer.goto(origin+'/admin/payouts?sellerId='+encodeURIComponent(source.sellerId));
  await financeClick(preparer,'/api/admin/payouts/accrue',()=>preparer.getByRole('button',{name:'Accrue delivered earnings',exact:true}).click());
  await seller.goto(origin+'/seller/finance');const form=seller.locator('form[data-form-id="seller.payout-request"]');await form.locator('[name="note"]').fill('Original delivered fictional order '+source.orderNumber);
  await financeClick(seller,'/api/seller/payout-requests',()=>form.getByRole('button',{name:'Request available payout',exact:true}).click());
  const request=await db.prepare("SELECT * FROM payout_requests WHERE seller_id=? AND status='submitted'").bind(source.sellerId).first<Record<string,unknown>>();assert.ok(request,'Missing eligible original earnings is a stop, not a ledger repair');
  await preparer.goto(origin+'/admin/payouts?request='+request.id);const review=preparer.locator('form[data-form-id="staff.payout-request-action"]');await review.locator('[name="action"]').selectOption('prepare');await review.locator('[name="note"]').fill(financeReason);
  await financeClick(preparer,'/api/admin/payout-requests/'+request.id,()=>review.getByRole('button',{name:'Save decision',exact:true}).click());
  const prepared=await db.prepare('SELECT * FROM payout_requests WHERE id=?').bind(request.id).first<Record<string,unknown>>();
  const payoutId = prepared?.payout_id;
  assert.ok(prepared && typeof payoutId === 'string' && payoutId.length > 0, 'Prepared payout must have a nonempty string ID');
  assert.equal(prepared.status, 'prepared');
  return { requestId: request.id, payoutId };
}
export async function runFinanceFundingVerification(options:{epoch:OwnedCommerceEpoch;approver:Page;approverId:string;accountVersionId:string;cashPaisa:number;restrictedPaisa:number}) {
  const {epoch,approver,approverId,accountVersionId,cashPaisa,restrictedPaisa}=options;await epoch.assertOwned();assert.ok(cashPaisa>restrictedPaisa&&restrictedPaisa>=0);const identity='FICTIONAL-J5-STATEMENT-'+randomUUID();
  const workspace = await getRefundFinanceWorkspace(epoch.db, approverId);
  assert.ok(workspace.superAdmin);
  const matching = workspace.funding.filter(account => account.versionId === accountVersionId);
  assert.equal(matching.length, 1, 'The exact company funding account version must appear once');
  const [account] = matching;
  const fundingSection = 'section:has(> h2:text-is("Company funding evidence"))';
  // The funding view renders the workspace accounts in order and does not expose version IDs in the DOM.
  const scope = fundingSection + ' > article:nth-of-type(' + (workspace.funding.indexOf(account) + 1) + ')';
  await approver.goto(epoch.runtime.APP_ORIGIN+'/admin/payments/refunds');
  assert.equal(await approver.locator(fundingSection).count(), 1);
  assert.equal(await approver.locator(fundingSection + ' > article').count(), workspace.funding.length);
  const card = approver.locator(scope);
  assert.equal(await card.locator('form[aria-label="Verify actual company funds"]').count(), 1);
  assert.ok((await card.locator('> p').innerText()).startsWith(account.label + ' · '), 'Selected funding card must display the exact masked account label');
  const endpoint = epoch.runtime.APP_ORIGIN + '/api/admin/refunds';
  const verifyAccountRequest = async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const body = request.postDataJSON() as {action?:string;input?:{accountVersionId?:string}};
    if (body?.action !== 'verify_funding' || body.input?.accountVersionId !== accountVersionId) {
      return route.fulfill({status:400,body:'Funding form submitted a different action or company account version'});
    }
    return route.fallback();
  };
  await approver.route(endpoint, verifyAccountRequest);
  try {
    await financeAction(approver,'Verify actual company funds','/api/admin/refunds',{statementIdentity:identity,asOf:new Date(Date.now()+345*60000-60000).toISOString().slice(0,16),cashPaisa:(cashPaisa/100).toFixed(2),restrictedPaisa:(restrictedPaisa/100).toFixed(2),evidenceReference:'FICTIONAL-STATEMENT-'+identity,restrictionsReference:'FICTIONAL-RESTRICTIONS-'+identity,availableFundsConfirmed:true,reason:financeReason},scope);
  } finally {
    await approver.unroute(endpoint, verifyAccountRequest);
  }
  const statement=await epoch.db.prepare('SELECT * FROM company_funding_statements WHERE statement_identity=?').bind(identity).first<Record<string,unknown>>();assert.ok(statement);assert.equal(statement.account_version_id,accountVersionId);assert.equal(Number(statement.cash_paisa),cashPaisa);assert.equal(Number(statement.restricted_paisa),restrictedPaisa);return {fundingStatementId:String(statement.id),statement};
}

type AftercareSeed = Awaited<ReturnType<typeof prepareCommerceBrowser>>;
type AftercareRow = Record<string, unknown>;

async function runDeliveredCodParcel(input: {
  buyer: Page; staff: Page; origin: string; orderId: string; orderNumber: string;
  staffId: string; sellerId: string; grandTotalPaisa: number;
  rows: (sql: string, ...params: string[]) => Promise<AftercareRow[]>;
  one: (sql: string, ...params: string[]) => Promise<AftercareRow>;
  post: (page: Page, path: string, click: () => Promise<void>, expected?: number) => Promise<import('playwright').Response>;
}) {
  const {buyer, staff, origin, orderId, orderNumber, staffId, sellerId, grandTotalPaisa, rows, one, post} = input;
  const receipt = '/orders/' + orderNumber;
  const staffPath = '/admin/orders/' + orderId;
  const parcelPath = '/api' + staffPath + '/parcels';
  const parcelRead = () => one(
    `SELECT j.id,j.status,j.order_id,j.seller_id,p.version,p.method,p.cod_due_paisa,p.collected_paisa,p.remitted_paisa,p.delivered_at
       FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=? AND j.direction='outbound'`, orderId);
  assert.equal((await rows('SELECT id FROM shipping_jobs WHERE order_id=?', orderId)).length, 0);
  await post(staff, parcelPath, () => staff.getByRole('button', { name: 'Prepare seller parcels', exact: true }).click());
  const prepared = await parcelRead();
  assert.equal(prepared.seller_id, sellerId);
  assert.equal(prepared.order_id, orderId);
  const due = Number(prepared.cod_due_paisa);
  assert.equal(due, grandTotalPaisa);
  assert.ok(due > 0 && typeof prepared.id === 'string');
  const parcelId = prepared.id;
  const tracking = 'FIXTURE-' + orderNumber;
  const collection = tracking + '-CASH';
  const remittance = tracking + '-CLAIM';
  const steps: { action: string; state: unknown; requestId: string; eventId: unknown }[] = [];
  let collectionReplayBody: string | null = null;
  const cashRead = () => rows('SELECT id,kind,amount_paisa,evidence_reference,status,created_by,approved_by FROM parcel_cash_records WHERE shipping_job_id=? ORDER BY kind,id', parcelId);
  for (const [action, expectedState] of [['assign', 'pickup_requested'], ['dispatch', 'dispatched'], ['collect', 'dispatched'],
    ['deliver', 'delivered'], ['propose_remittance', 'delivered']]) {
    await staff.reload();
    const form = staff.locator('form[data-form-id="staff.parcel-control"]');
    await form.getByLabel('Action', { exact: true }).selectOption(action);
    if (action === 'assign') {
      await form.getByLabel('Delivery method').selectOption('courier');
      await form.getByLabel('Courier company').fill('Fictional acceptance courier');
      await form.getByLabel('Tracking / handover reference').fill(tracking);
    }
    if (action === 'collect' || action === 'propose_remittance') {
      await form.getByLabel('Amount in NPR').fill((due / 100).toFixed(2));
      await form.getByLabel('Supporting document or reference').fill(action === 'collect' ? collection : remittance);
    }
    await form.getByLabel('Operational note').fill('Record the exact fictional parcel handoff and the associated evidence.');
    const response = await post(staff, parcelPath, () => form.getByRole('button', { name: 'Save parcel action' }).click());
    const payload = response.request().postDataJSON() as { requestId: string; jobId: string; version: number };
    assert.equal(payload.jobId, parcelId);
    assert.ok(payload.requestId);
    const current = await parcelRead();
    assert.equal(current.status, expectedState);
    assert.equal(Number(current.version), payload.version + 1);
    const event = await one('SELECT id,actor_id FROM parcel_operation_events WHERE shipping_job_id=? AND action=?', parcelId, action);
    assert.equal(event.actor_id, staffId);
    assert.equal(event.id, payload.requestId);
    steps.push({ action, state: current.status, requestId: payload.requestId, eventId: event.id });
    if (action === 'collect') collectionReplayBody = response.request().postData();
  }
  const delivered = await parcelRead();
  assert.ok(Number(delivered.delivered_at) > 0);
  assert.equal(Number(delivered.collected_paisa), due);
  assert.equal(Number(delivered.remitted_paisa), 0);
  const cash = await cashRead();
  assert.deepEqual(cash.map(row => [row.kind, Number(row.amount_paisa), row.evidence_reference, row.status, row.created_by, row.approved_by]),
    [['collection', due, collection, 'posted', staffId, null], ['remittance', due, remittance, 'pending', staffId, null]]);
  await staff.reload();
  assert.ok(collectionReplayBody);
  const collectionReplay = await staff.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return { status: response.status, body: await response.json() as { ok: boolean } };
  }, { path: parcelPath, body: collectionReplayBody });
  assert.deepEqual(collectionReplay, { status: 200, body: { ok: true } });
  assert.deepEqual(await parcelRead(), delivered);
  assert.deepEqual(await cashRead(), cash);
  await staff.getByText(remittance, { exact: false }).first().waitFor();
  await buyer.goto(origin + receipt);
  await buyer.getByText('COD payment is recorded as collected.', { exact: false }).waitFor();
  await buyer.getByText('delivered · Fictional acceptance courier', { exact: true }).waitFor();
  await buyer.getByText('Cash allocated: Rs. ' + (due / 100).toFixed(2) + ' · Collection recorded: Rs. ' + (due / 100).toFixed(2), { exact: true }).waitFor();

  return {parcelId, due, steps, cashRead, cash, delivered};
}

export async function runAftercareJourney(input: {
  epoch: OwnedCommerceEpoch; origin: string; signal: AbortSignal; accounts: AftercareSeed;
  buyer: Page; staff: Page; foreign: Page; support: Page; supportId: string; orderId: string; orderNumber: string;
  order: AftercareRow; items: AftercareRow[]; offers: AftercareRow[]; staffId: string;
  beforeReturn: (source: FinanceOriginalSource) => Promise<void>;
}) {
  const { epoch, origin, signal, accounts, buyer, staff, foreign, support, supportId, orderId, orderNumber, order, items, offers, staffId } = input;
  assertCommerceRuntime(epoch.runtime);
  assert.equal(epoch.runtime.APP_ORIGIN, origin);
  const endpoint = new URL(origin);
  assert.ok(endpoint.origin === origin && endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' &&
    endpoint.port && endpoint.port !== '3018', 'Aftercare requires an isolated loopback port');
  await epoch.assertOwned();
  const db = epoch.db;
  const rows = async (sql: string, ...params: string[]) =>
    (await db.prepare(sql).bind(...params).all<AftercareRow>()).results;
  const one = async (sql: string, ...params: string[]) => {
    const result = await rows(sql, ...params);
    assert.equal(result.length, 1);
    return result[0];
  };
  const post = async (page: Page, path: string, click: () => Promise<void>, expected = 200) => {
    signal.throwIfAborted();
    const [response] = await Promise.all([page.waitForResponse(response =>
      response.url() === origin + path && response.request().method() === 'POST'), click()]);
    assert.equal(response.status(), expected, path + ' did not record the expected action');
    return response;
  };
  const receipt = '/orders/' + orderNumber;
  const { parcelId, due, steps, cashRead, cash, delivered } = await runDeliveredCodParcel({
    buyer, staff, origin, orderId, orderNumber, staffId, sellerId: accounts.seller.sellerId,
    grandTotalPaisa: Number(order.grand_total_paisa), rows, one, post,
  });
  await input.beforeReturn({orderId,orderNumber,sellerId:accounts.seller.sellerId,buyerId:accounts.buyer.id,parcelId,remittanceClaimId:String(cash[1].id),duePaisa:due});
  const reconciledCash = await cashRead();
  await buyer.goto(origin + receipt);
  const itemId = items.find(item => item.sku_snapshot === accounts.variants[0].id)?.id;
  assert.equal(typeof itemId, 'string');
  const originalItemId = String(itemId);
  await buyer.getByRole('button', { name: 'Return or replace an item' }).click();
  const returnForm = buyer.locator('form[data-form-id="commerce.return-request"]');
  await returnForm.locator('[name="orderItemId"]').selectOption(originalItemId);
  await returnForm.locator('[name="reason"]').selectOption('defective');
  const returnDetail = 'The original delivered fictional cup has a documented defect.';
  await returnForm.locator('[name="detail"]').fill(returnDetail);
  const returned = await (await post(buyer, receipt + '/returns', () =>
    returnForm.getByRole('button', { name: 'Send return request' }).click(), 201)).json() as { id: string; referenceNumber: string };
  await buyer.getByText(returned.referenceNumber, { exact: false }).first().waitFor();
  const returnRow = await one('SELECT * FROM return_requests WHERE id=?', returned.id);
  assert.deepEqual([returnRow.order_item_id, returnRow.requested_by, Number(returnRow.quantity), returnRow.intake_channel,
    returnRow.detail, returnRow.policy_snapshot_json, Number(returnRow.delivered_at_snapshot)],
  [originalItemId, accounts.buyer.id, 1, 'web', returnDetail, order.return_policy_snapshot_json, Number(delivered.delivered_at)]);

  const caseReader={page:buyer,id:accounts.buyer.id,audience:'customer' as const,href:receipt+'#aftercare-title'};
  const caseNotices=[await readCustomerCaseNotice({epoch,reader:caseReader,type:'return_request',sourceId:returned.id,
    sourceRequest:returnRow.operation_request_id,recordSelector:'#aftercare-title'})];

  await buyer.getByRole('button', { name: 'Get help or raise a complaint' }).click();
  const complaintForm = buyer.locator('form[data-form-id="commerce.complaint"]');
  const complaintItem = items.find(item => item.id !== originalItemId)?.id;
  assert.equal(typeof complaintItem, 'string');
  await complaintForm.locator('[name="orderItemId"]').selectOption(String(complaintItem));
  await complaintForm.locator('[name="category"]').selectOption('delivery');
  await complaintForm.locator('[name="subject"]').fill('Fictional delivery follow-up');
  await complaintForm.locator('[name="detail"]').fill('Please review the delivery handoff of the other original fictional item.');
  const complaint = await (await post(buyer, receipt + '/complaints', () =>
    complaintForm.getByRole('button', { name: 'Send complaint' }).click(), 201)).json() as { id: string; referenceNumber: string };
  await buyer.getByText(complaint.referenceNumber, { exact: false }).first().waitFor();
  const complaintRow = await one('SELECT * FROM complaints WHERE id=?', complaint.id);
  assert.deepEqual([complaintRow.order_id, complaintRow.order_item_id, complaintRow.customer_id, complaintRow.intake_channel],
    [orderId, complaintItem, accounts.buyer.id, 'web']);
  assert.equal((await foreign.goto(origin + receipt))?.status(), 404);
  assert.equal(await foreign.getByText(returned.referenceNumber, { exact: false }).count(), 0);
  assert.equal(await foreign.getByText(complaint.referenceNumber, { exact: false }).count(), 0);

  const foreignReader={...caseReader,page:foreign,id:accounts.foreignBuyer.id};
  caseNotices.push(await readCustomerCaseNotice({epoch,reader:caseReader,type:'complaint',sourceId:complaint.id,
    sourceRequest:complaintRow.operation_request_id,foreign:foreignReader,recordSelector:'#aftercare-title'}));

  await staff.goto(origin + '/admin/cases/returns/' + returned.id);
  await staff.getByRole('heading', { name: 'Owned next action', exact: true }).waitFor();
  const followup = staff.getByRole('form', { name: 'Owned case follow-up' });
  await followup.getByRole('checkbox', { name: /I own this next action/ }).check();
  await followup.locator('[name="waitingFor"]').selectOption('platform');
  const promised = new Date(Date.now() + (345 + 60) * 60_000).toISOString().slice(0, 16);
  await followup.locator('[name="nextUpdateAt"]').fill(promised);
  const publicMessage = 'We recorded the delivery evidence and will update this case within one hour.';
  await followup.locator('[name="nextAction"]').fill('Inspect the documented fictional defect and hand off entitlement review.');
  await followup.locator('[name="publicMessage"]').fill(publicMessage);
  const privateNote = 'Compare the exact fictional item and courier handoff reference.';
  await followup.locator('[name="privateNote"]').fill(privateNote);
  const followupResponse = await post(staff, '/api/admin/cases/followup?sourceType=return_request&sourceId=' + encodeURIComponent(returned.id),
    () => followup.getByRole('button', { name: 'Save owned follow-up' }).click());
  const followupRequest = followupResponse.request().postDataJSON() as { requestId: string };
  const followupRow = await one('SELECT id,actor_id,owner_id,waiting_for,next_update_at,public_message FROM aftercare_followup_events WHERE source_type=? AND source_id=? AND request_id=?',
    'return_request', returned.id, followupRequest.requestId);
  assert.deepEqual([followupRow.actor_id, followupRow.owner_id, followupRow.waiting_for, followupRow.public_message],
    [staffId, staffId, 'platform', publicMessage]);
  assert.equal(Number(followupRow.next_update_at), Date.parse(promised + '+05:45'));
  await buyer.reload();
  await buyer.getByText(publicMessage, { exact: false }).first().waitFor();
  assert.equal(await buyer.getByText(privateNote, { exact: false }).count(), 0);

  caseNotices.push(await readCustomerCaseNotice({epoch,reader:caseReader,type:'return_request',sourceId:returned.id,
    sourceRequest:followupRequest.requestId,previousId:caseNotices[0].id,foreign:foreignReader,recordSelector:'#aftercare-title'}));
  const refundsBefore = await rows('SELECT id,status FROM refunds WHERE return_request_id=? ORDER BY id', returned.id);
  const denied: { action: string; status: number }[] = [];
  for (const [action, payload] of [['review', { action: 'approve' }], ['operations', { action: 'complete_refund' }],
    ['high-value', { decision: 'approve' }]] as const) {
    const attempt = await staff.evaluate(async ({ path, payload }) => {
      const response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      return { status: response.status, error: (await response.json() as { error?: string }).error };
    }, { path: '/api/admin/returns/' + returned.id + '/' + action, payload });
    assert.deepEqual(attempt, { status: 403, error: 'Staff access is not permitted.' });
    denied.push({ action, status: attempt.status });
  }
  assert.deepEqual(await rows('SELECT id,status FROM refunds WHERE return_request_id=? ORDER BY id', returned.id), refundsBefore);
  assert.deepEqual(await cashRead(), reconciledCash);
  const after = await inventory(db);
  assert.deepEqual(after.offers.filter(row => items.some(item => item.id === row.order_item_id)), offers);
  for (const item of items) {
    const actual = after.items.find(row => row.id === item.id);
    assert.ok(actual);
    assert.deepEqual([actual.order_id, actual.seller_id, actual.product_id, actual.quantity, actual.unit_price_paisa, actual.line_total_paisa],
      [item.order_id, item.seller_id, item.product_id, item.quantity, item.unit_price_paisa, item.line_total_paisa]);
    assert.equal(actual.fulfillment_status, 'delivered');
  }
  const afterOrder = after.orders.find(row => row.id === orderId);
  assert.equal(afterOrder?.policy_version, order.policy_version);
  assert.equal(afterOrder?.return_policy_snapshot_json, order.return_policy_snapshot_json);
  // The cancellation branch starts from a distinct genuine checkout before any physical work.
  await buyer.goto(origin + '/products/' + accounts.slug);
  await buyer.getByLabel('Size', { exact: true }).selectOption(accounts.variants[0].value);
  await post(buyer, '/api/cart', () => buyer.getByRole('button', { name: 'Add to cart', exact: true }).click());
  await buyer.goto(origin + '/checkout');
  await buyer.getByLabel(/^Recipient name/).fill('Fictional Cancellation Recipient');
  await buyer.getByLabel(/^Recipient phone/).fill('9811111111');
  await buyer.locator('#province').click();
  await buyer.getByRole('option', { name: 'Bagmati', exact: true }).click();
  await buyer.getByLabel(/^District/).fill('Kathmandu');
  await buyer.getByLabel(/^Municipality/).fill('Kathmandu');
  await buyer.getByLabel(/^Street, tole or locality/).fill('Fictional Cancellation Ward');
  await buyer.getByRole('radio', { name: /Cash on delivery/ }).check();
  await buyer.locator('#checkout-terms').check();
  await buyer.getByText('Total on delivery', { exact: true }).waitFor();
  const second = await (await post(buyer, '/api/checkout', () =>
    buyer.getByRole('button', { name: 'Place COD order', exact: true }).click(), 201)).json() as { orderNumber: string };
  assert.notEqual(second.orderNumber, orderNumber);
  const cancellationReceipt = '/orders/' + second.orderNumber;
  await buyer.waitForURL(origin + cancellationReceipt);
  await buyer.context().clearCookies({ name: 'hastabazaar_receipt' });
  const cancellationOrder = await one('SELECT id,customer_id,policy_version,return_policy_snapshot_json FROM orders WHERE order_number=?', second.orderNumber);
  assert.equal(cancellationOrder.customer_id, accounts.buyer.id);
  assert.ok(typeof cancellationOrder.id === 'string' && cancellationOrder.id !== orderId);
  const cancellationOrderId = cancellationOrder.id;
  const cancellationReview = await rows('SELECT status FROM first_cod_reviews WHERE order_id=?', cancellationOrderId);
  if (cancellationReview[0]?.status === 'pending') {
    const path = '/admin/orders/' + cancellationOrderId;
    await staff.goto(origin + path);
    const confirmation = staff.locator('form[data-form-id="staff.first-cod-confirmation"]');
    await confirmation.getByLabel('Confirmation reason').fill('Confirmed this distinct fictional checkout before cancellation review.');
    await post(staff, '/api' + path + '/first-cod-confirmation', () =>
      confirmation.getByRole('button', { name: 'Confirm COD order', exact: true }).click());
  }
  const secondItem = await one('SELECT id,seller_id,quantity FROM order_items WHERE order_id=?', cancellationOrderId);
  assert.deepEqual([secondItem.seller_id, Number(secondItem.quantity)], [accounts.seller.sellerId, 1]);
  assert.ok(typeof secondItem.id === 'string');
  const secondOffer = await one('SELECT offer_id,snapshot_json FROM order_item_offer_snapshots WHERE order_item_id=?', secondItem.id);
  assert.equal(secondOffer.offer_id, accounts.variants[0].id);
  await buyer.goto(origin + cancellationReceipt);
  await buyer.getByRole('button', { name: 'Cancel order or seller parcels', exact: true }).click();
  const cancellation = buyer.locator('form[data-form-id="commerce.order-cancellation"]');
  await cancellation.getByRole('checkbox').check();
  await cancellation.getByLabel('Reason').fill('Fictional buyer requested cancellation before the parcel was prepared.');
  const preview = await (await post(buyer, cancellationReceipt + '/cancel', () =>
    cancellation.getByRole('button', { name: 'Review cancellation amounts', exact: true }).click())).json() as {
    fingerprint: string; reviewRequired: boolean; total: number; collected: number;
  };
  assert.ok(preview.fingerprint);
  assert.deepEqual([preview.reviewRequired, preview.total, preview.collected], [false, 0, 0]);
  const cancellationResponse = await post(buyer, cancellationReceipt + '/cancel', () =>
    cancellation.getByRole('button', { name: 'Confirm cancellation and revised amount', exact: true }).click());
  const cancellationRequest = cancellationResponse.request().postDataJSON() as { requestId: string; fingerprint: string };
  assert.equal(cancellationRequest.fingerprint, preview.fingerprint);
  await buyer.reload();
  await buyer.getByText('This order was cancelled and no payment is due.', { exact: false }).waitFor();
  const cancelled = await one('SELECT status,payment_status,policy_version,return_policy_snapshot_json FROM orders WHERE id=?', cancellationOrderId);
  assert.deepEqual([cancelled.status, cancelled.payment_status, cancelled.policy_version, cancelled.return_policy_snapshot_json],
    ['cancelled', 'cancelled', cancellationOrder.policy_version, cancellationOrder.return_policy_snapshot_json]);
  const cancellationEvent = await one('SELECT id,actor_id,seller_ids_json FROM order_cancellation_events WHERE order_id=?', cancellationOrderId);
  assert.equal(cancellationEvent.actor_id, accounts.buyer.id);
  assert.equal(cancellationEvent.id, cancellationRequest.requestId);
  assert.deepEqual(JSON.parse(String(cancellationEvent.seller_ids_json)), [accounts.seller.sellerId]);
  assert.deepEqual(await one('SELECT offer_id,snapshot_json FROM order_item_offer_snapshots WHERE order_item_id=?', secondItem.id), secondOffer);
  assert.deepEqual(await cashRead(), reconciledCash);
  // Use a separate, support-only operator and the separate cancellation checkout for assisted intake.
  await support.goto(origin + '/admin/cases/intake');
  await support.locator('form[data-form-id="staff.case-intake-order"] [name="order"]').fill(second.orderNumber);
  await support.getByRole('button', { name: 'Find order', exact: true }).click();
  const intake = support.getByRole('form', { name: 'Supported request intake' });
  const received = new Date(Date.now() + (345 - 5) * 60_000).toISOString().slice(0, 16);
  const sourceReference = 'FIXTURE-SUPPORT-' + second.orderNumber;
  await intake.locator('[name="channel"]').selectOption('support');
  await intake.locator('[name="receivedAt"]').fill(received);
  await intake.locator('[name="sourceReference"]').fill(sourceReference);
  await intake.locator('[name="orderItemId"]').selectOption(secondItem.id);
  await intake.locator('[name="category"]').selectOption('service');
  await intake.locator('[name="subject"]').fill('Fictional supported cancellation query');
  await intake.locator('[name="detail"]').fill('The original support contact asked for an explanation of this fictional cancellation.');
  const assisted = await (await post(support, '/api/admin/cases/intake?sourceType=complaint&order=' + encodeURIComponent(second.orderNumber),
    () => intake.getByRole('button', { name: 'Retain the original request' }).click())).json() as { id: string };
  await support.waitForURL(origin + '/admin/cases/complaints/' + encodeURIComponent(assisted.id));
  const assistedRow = await one('SELECT order_id,order_item_id,intake_recorded_by,intake_channel,received_evidence_reference,created_at,recorded_at FROM complaints WHERE id=?', assisted.id);
  assert.deepEqual([assistedRow.order_id, assistedRow.order_item_id, assistedRow.intake_recorded_by, assistedRow.intake_channel, assistedRow.received_evidence_reference],
    [cancellationOrderId, secondItem.id, supportId, 'support', sourceReference]);
  assert.equal(Number(assistedRow.created_at), Date.parse(received + '+05:45'));
  assert.ok(Number(assistedRow.recorded_at) > Number(assistedRow.created_at));
  return { orderId, orderNumber, parcelId, steps, staffId, buyerId: accounts.buyer.id, supportId, assistedComplaintId: assisted.id,
    sellerId: accounts.seller.sellerId, returnedItemId: originalItemId, complaintItemId: complaintItem,
    followupEventId: followupRow.id, followupRequestId: followupRequest.requestId, cancellationOrderId, cancellationOrderNumber: second.orderNumber,
    cancellationEventId: cancellationEvent.id, cancellationRequestId: cancellationRequest.requestId, duePaisa: due, collectionId: cash[0].id,
    remittanceClaimId: cash[1].id, remittanceStatus: 'reconciled', returnId: returned.id, caseNotices, complaintId: complaint.id, denied };
}
export type FinanceSessions = {preparer:Page;approver:Page;preparerId:string;approverId:string;accountVersionId:string};
export async function prepareFinancePrerequisites(epoch:OwnedCommerceEpoch,accounts:Awaited<ReturnType<typeof prepareCommerceBrowser>>,approverId:string) {
  await epoch.assertOwned();assertCommerceRuntime(epoch.runtime);
  const db=epoch.db;
  // This is prospective setup for new fictional orders, never a repair of held earnings.
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id=?').bind(accounts.buyer.id).first<{n:number}>())!.n),0);
  const company=await import('../../lib/payments/company-accounts');
  const {companyDetails}=await import('../../lib/content/company-details');
  const context=(expectedRevision:string|null)=>({actorId:approverId,requestId:randomUUID(),expectedRevision,now:Date.now()});
  const bank=await company.saveCompanyAccountDraft(db,context(null),{accountId:null,basedOnVersionId:null,
    details:{holder:companyDetails.legalName,bank:'Fictional Integration Bank',branch:'Fictional Branch',accountNumber:'FIXTURE '+randomUUID().slice(0,20),currency:'NPR',purpose:'both'},
    evidenceReference:'FICTIONAL-INDEPENDENT-COMPANY-OWNERSHIP',conflictUserIds:[],reason:financeReason});
  await company.submitCompanyAccountForReview(db,context('0'),{versionId:bank.versionId,reason:financeReason});
  await company.verifyCompanyAccount(db,context('1'),{versionId:bank.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-VERIFICATION',reason:financeReason});
  const selection=await db.prepare("SELECT revision FROM company_payment_account_current WHERE currency='NPR'").first<{revision:number}>();assert.ok(selection);
  await company.publishCompanyReceivingAccount(db,context('2'),{versionId:bank.versionId,expectedReceivingRevision:Number(selection.revision),reason:financeReason});
  const sellerBank=await import('../../lib/sellers/bank-details');
  const legal=await db.prepare('SELECT legal_name,applicant_type FROM seller_profiles WHERE id=?').bind(accounts.seller.sellerId).first<{legal_name:string;applicant_type:string}>();assert.ok(legal);
  const initial=await sellerBank.sellerBankState(db,accounts.seller.sellerId);
  const documentId=randomUUID();
  await sellerBank.submitSellerBankDetails(db,{sellerId:accounts.seller.sellerId,actorId:accounts.seller.id,revision:initial.revision,commandId:randomUUID(),now:Date.now(),
    details:{payoutBeneficiary:legal.legal_name,bankName:'Fictional Seller Bank',bankBranch:'Fictional Branch',bankAccountNumber:'FIXTURE '+randomUUID().slice(0,20)},
    document:{id:documentId,kind:'bank_verification',objectKey:'private/seller-documents/'+accounts.seller.sellerId+'/'+documentId,originalName:'fictional-bank.png',mimeType:'image/png',sizeBytes:100}});
  const pending=await sellerBank.sellerBankState(db,accounts.seller.sellerId);
  await sellerBank.reviewSellerBankDetails(db,{sellerId:accounts.seller.sellerId,actorId:approverId,revision:pending.revision,reference:'FICTIONAL-INDEPENDENT-SELLER-OWNERSHIP',reason:financeReason,ownershipBasis:legal.applicant_type==='company'?'same_legal_entity':'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:randomUUID(),now:Date.now()});
  const settings=await import('../../lib/db/repositories/business-settings');
  const latest=await db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM business_setting_versions WHERE setting_key='seller_delivery_hold_days'").first<{version:number}>();
  const hold=await settings.saveBusinessSettingChange(db,{key:'seller_delivery_hold_days',value:0,actorId:approverId,reason:'Prospective zero-day settlement for new fictional integration orders only.',requestId:randomUUID(),now:Date.now(),effectiveFrom:null,expectedVersion:Number(latest!.version)});
  const terms=await (await import('../../lib/settlements/registered-terms')).getRegisteredSettlementTerms(db,Date.now());
  assert.equal(terms.deliveryHoldDays,0);assert.equal(terms.holdSettingVersionId,hold.id);assert.equal(terms.reserveBps,0);
  const verified=await db.prepare('SELECT status,verified_by FROM company_payment_account_versions WHERE id=?').bind(bank.versionId).first<{status:string;verified_by:string}>();
  assert.equal(verified?.status,'verified');assert.equal(verified?.verified_by,approverId);
  await epoch.assertOwned();return {accountVersionId:bank.versionId,terms,bankDocumentId:documentId};
}
export async function runFinanceBeforeReturn(options:{epoch:OwnedCommerceEpoch;seller:Page;source:FinanceOriginalSource;collectorId:string;foreignSeller:{page:Page;id:string}}&FinanceSessions){
  const {epoch,source}=options;
  await epoch.assertOwned();assertFinanceSourceIdentity(source);
  assert.equal(Number((await epoch.db.prepare('SELECT COUNT(*) n FROM return_requests r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=?').bind(source.orderId).first<{n:number}>())!.n),0);
  const remittance=await runFinanceCodRemittance(options);
  const funding=await runFinanceFundingVerification({...options,cashPaisa:source.duePaisa*4,restrictedPaisa:source.duePaisa});
  const requested=await runFinanceOriginalPayoutRequest(options);
  const payout=await runFinancePayoutPacket({...options,payoutId:requested.payoutId});
  return {source,remittance,funding,requested,payout};
}
export async function approveOriginalReturnEntitlement(options:{epoch:OwnedCommerceEpoch;approver:Page;returnId:string;orderId:string}){
  const {epoch,approver,returnId,orderId}=options;await epoch.assertOwned();
  const item=await epoch.db.prepare('SELECT i.line_total_paisa FROM return_requests r JOIN order_items i ON i.id=r.order_item_id WHERE r.id=? AND i.order_id=?').bind(returnId,orderId).first<{line_total_paisa:number}>();assert.ok(item);
  await approver.goto(epoch.runtime.APP_ORIGIN+'/admin/cases/returns/'+returnId);
  const form=approver.locator('form[data-form-id="staff.return-case-action"]');
  await form.getByLabel('Decision',{exact:true}).selectOption('approve');
  await form.getByLabel('Outcome',{exact:true}).selectOption('refund');
  await form.getByLabel('Responsible party',{exact:true}).selectOption('seller');
  await form.getByLabel('Item refund (NPR)',{exact:true}).fill((Number(item.line_total_paisa)/100).toFixed(2));
  await form.getByLabel('Internal investigation note',{exact:true}).fill(financeReason);
  await form.getByLabel('Customer message',{exact:true}).fill('Your original defective item refund is approved; actual transfer is reviewed separately.');
  await financeClick(approver,'/api/admin/returns/'+returnId+'/review',()=>form.getByRole('button',{name:'Save decision',exact:true}).click());
  const refund=await epoch.db.prepare('SELECT id FROM refunds WHERE return_request_id=?').bind(returnId).first<{id:string}>();assert.ok(refund);return refund.id;
}
export async function runFinanceManualCheckout(options:{epoch:OwnedCommerceEpoch;buyer:Page;seller:Page;verifier:Page;accounts:Awaited<ReturnType<typeof prepareCommerceBrowser>>;originalOrderId:string;accountVersionId:string}){
  const {epoch,buyer,seller,verifier,accounts,originalOrderId,accountVersionId}=options,origin=epoch.runtime.APP_ORIGIN!;await epoch.assertOwned();
  await buyer.goto(origin+'/products/'+accounts.slug);await buyer.getByLabel('Size',{exact:true}).selectOption(accounts.variants[0].value);
  await financeClick(buyer,'/api/cart',()=>buyer.getByRole('button',{name:'Add to cart',exact:true}).click());
  await buyer.goto(origin+'/checkout');
  await buyer.getByLabel(/^Recipient name/).fill('Fictional Manual Recipient');await buyer.getByLabel(/^Recipient phone/).fill('9811111111');
  await buyer.locator('#province').click();await buyer.getByRole('option',{name:'Bagmati',exact:true}).click();
  await buyer.getByLabel(/^District/).fill('Kathmandu');await buyer.getByLabel(/^Municipality/).fill('Kathmandu');await buyer.getByLabel(/^Street, tole or locality/).fill('Fictional Manual Ward');
  await buyer.getByRole('radio',{name:/bank transfer/i}).check();await buyer.locator('#checkout-terms').check();
  const placed=await financeClick(buyer,'/api/checkout',()=>buyer.getByRole('button',{name:'Place bank-transfer order',exact:true}).click()) as {orderNumber:string};
  await buyer.waitForURL(origin+'/orders/'+placed.orderNumber);
  const order=await epoch.db.prepare('SELECT id,customer_id,payment_mode,grand_total_paisa FROM orders WHERE order_number=?').bind(placed.orderNumber).first<{id:string;customer_id:string;payment_mode:string;grand_total_paisa:number}>();assert.ok(order);assert.notEqual(order.id,originalOrderId);assert.equal(order.customer_id,accounts.buyer.id);assert.equal(order.payment_mode,'prepaid');
  const windowBefore=await epoch.db.prepare('SELECT issued_at,deadline_at FROM manual_payment_cutoffs WHERE order_id=?').bind(order.id).first();assert.ok(windowBefore);
  await buyer.goto(origin+'/account/payments/'+order.id);
  await buyer.getByLabel('Amount paid (NPR)',{exact:true}).fill((Number(order.grand_total_paisa)/100).toFixed(2));await buyer.getByLabel('Payment date',{exact:true}).fill(financeNepalTime().slice(0,10));
  await buyer.getByLabel('Bank reference (optional)',{exact:true}).fill('FICTIONAL-MANUAL-'+order.id);
  await financeClick(buyer,'/api/account/payments/'+order.id+'/claim',()=>buyer.getByRole('button',{name:'Submit payment claim',exact:true}).click());
  await verifier.goto(origin+'/admin/payments?order='+placed.orderNumber);
  const claim=verifier.locator('article').filter({has:verifier.getByRole('button',{name:'Request information',exact:true})});assert.equal(await claim.count(),1);
  await claim.getByLabel('Review reason or specific information needed',{exact:true}).fill('Please clarify the original fictional payer reference.');
  await financeClick(verifier,'/api/admin/payments',()=>claim.getByRole('button',{name:'Request information',exact:true}).click());
  await buyer.reload();await buyer.getByLabel('Note (optional)',{exact:true}).fill('This original fictional credit was sent by the authenticated original buyer.');
  await financeClick(buyer,'/api/account/payments/'+order.id+'/claim',()=>buyer.getByRole('button',{name:'Save claim clarification',exact:true}).click());
  assert.deepEqual(await epoch.db.prepare('SELECT issued_at,deadline_at FROM manual_payment_cutoffs WHERE order_id=?').bind(order.id).first(),windowBefore);
  const allocation=await runFinanceManualAllocation({epoch,verifier,orderId:order.id,orderNumber:placed.orderNumber,accountVersionId,buyerId:accounts.buyer.id,duePaisa:Number(order.grand_total_paisa)});
  const released=await epoch.db.prepare('SELECT paid_at,released_at FROM manual_payment_cutoffs WHERE order_id=?').bind(order.id).first<{paid_at:number|null;released_at:number|null}>();assert.ok(released?.paid_at&&released.released_at,'Verified payment must actually release the original manual order');
  await buyer.reload();await buyer.getByText('Payment verified',{exact:true}).waitFor();
  await seller.goto(origin+'/seller/orders/'+order.id);await seller.getByRole('button',{name:'Start selected preparation',exact:true}).waitFor();
  return {orderId:order.id,orderNumber:placed.orderNumber,allocation,windowBefore,released};
}

const sharedTeamReviewerGrants = ['audit_log.view', 'seller.application.review'] as const;

export async function prepareSharedTeamReviewer(epoch: OwnedCommerceEpoch, store: SecurityStore, grantorId: string) {
  await epoch.assertOwned();
  const { db } = epoch;
  const id = randomUUID(), email = id + '@local.hastabazaar.test', displayName = 'Fictional Shared Team Reviewer';
  const password = Buffer.from(randomBytes(32)).toString('base64url'), now = Date.now();
  const credential = await passwordRecord(password);
  await store.registerStaff(id, now, [
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)")
      .bind(id, id, email, displayName, now, now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,'admin',?,?)").bind(id, grantorId, now),
    db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(id, credential.hash, credential.salt, now, now),
    db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)')
      .bind(id, JSON.stringify(sharedTeamReviewerGrants), grantorId, now),
  ]);
  return { id, email, password, displayName };
}

type SharedTeamPanelItem = { id: string; relatedId: string; relatedType: string; channel: string; readAt: number | null };

export function assertSharedTeamPanel(items: SharedTeamPanelItem[], eventId: string, staleEventId?: string) {
  const own = items.filter(item => item.relatedId === eventId);
  assert.equal(own.length, 1);
  assert.equal(own[0].relatedType, 'team_governance_event');
  assert.equal(own[0].channel, 'in_app');
  assert.ok(staleEventId === undefined || items.every(item => item.relatedId !== staleEventId));
  return own[0];
}

async function readSharedTeamPanel(page: Page, origin: string, actorId: string, eventId: string, staleEventId?: string) {
  assert.equal(new URL(page.url()).origin, origin);
  const items = await page.evaluate(async (actorId) => {
    const response = await fetch('/api/notifications?audience=staff', { headers: { 'X-Hastabazaar-Actor': actorId } });
    if (!response.ok) throw new Error('Shared staff panel receiver rejected the signed-in actor.');
    return (await response.json() as { items: SharedTeamPanelItem[] }).items;
  }, actorId);
  return assertSharedTeamPanel(items, eventId, staleEventId);
}

export async function runFailedParcelIncident(options:{
  epoch:OwnedCommerceEpoch; page:Page; actorId:string; signal:AbortSignal; exception:{caseId:string;orderId:string;jobId:string};
}) {
  const {epoch,page,actorId,signal,exception}=options;
  await epoch.assertOwned();
  const {db,runtime}=epoch,origin=runtime.APP_ORIGIN!,path='/admin/system-health/incidents';
  const parcel=()=>db.prepare("SELECT j.id,j.order_id,j.status,w.id AS case_id FROM shipping_jobs j JOIN exception_work_items w ON w.id=? AND w.source_key=? WHERE j.id=? AND j.order_id=?")
    .bind(exception.caseId,'failed_delivery:'+exception.jobId+':',exception.jobId,exception.orderId).first<Record<string,unknown>>();
  const failed=await parcel();
  assert.deepEqual(failed,{id:exception.jobId,order_id:exception.orderId,status:'delivery_failed',case_id:exception.caseId});
  const serviceKey='fixture.failed-parcel.'+exception.jobId.toLowerCase();
  const read=(id:string)=>db.prepare(`SELECT h.state,h.environment,h.service_key,g.failure_signature,g.owner_id,g.acknowledged_by,g.acknowledged_at
    FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.id=?`).bind(id).first<Record<string,unknown>>();
  await page.goto(origin+path);
  await page.getByText('Record a new failure or map a retained legacy incident',{exact:true}).click();
  const forms=page.locator('form[data-form-id="staff.incident-review"]');
  const create=forms.filter({has:page.getByRole('button',{name:'Record incident',exact:true})});
  for(const [key,value] of Object.entries({title:'Fictional failed parcel workflow review',serviceKey,failureSignature:'parcel-'+exception.jobId,
    impactSummary:'The owned fictional parcel recorded a failed delivery. Review its original workflow separately from cash custody.'})){
    await create.locator('[name="'+key+'"]').fill(value);
  }
  await create.locator('[name="severity"]').selectOption('routine');
  signal.throwIfAborted();
  const first=await financeClick(page,'/api'+path,()=>create.getByRole('button',{name:'Record incident',exact:true}).click());
  assert.deepEqual([first.recorded,first.historical,first.actorId,first.action,first.sourceId],[true,true,actorId,'create','new']);
  const incidentId=String(first.incidentId);
  const detected=await read(incidentId);
  assert.ok(detected && detected.environment==='local_staging' && detected.service_key===serviceKey && detected.acknowledged_at===null);
  await page.goto(origin+path+'?incident='+incidentId);
  const action=forms.filter({has:page.getByRole('button',{name:'Save incident action',exact:true})});
  await action.getByLabel('Action',{exact:true}).selectOption('acknowledge');
  await action.locator('[name="reason"]').fill('Claim the retained fictional failed parcel workflow incident and acknowledge responsibility.');
  signal.throwIfAborted();
  const ack=await financeClick(page,'/api'+path,()=>action.getByRole('button',{name:'Save incident action',exact:true}).click());
  assert.deepEqual([ack.recorded,ack.historical,ack.actorId,ack.action,ack.sourceId,ack.incidentId],[true,true,actorId,'acknowledge',incidentId,incidentId]);
  const working=await read(incidentId);
  assert.ok(working && working.state==='working' && Number(working.acknowledged_at)>0);
  assert.deepEqual([working.owner_id,working.acknowledged_by,working.service_key,working.failure_signature],
    [actorId,actorId,serviceKey,detected.failure_signature]);
  const plan = 'Preserve original parcel evidence and pause further workflow review pending reconciliation.';
  const nextAction = 'Compare original parcel event and authorized exception evidence.';
  await page.goto(origin+path+'?incident='+incidentId);
  await action.getByLabel('Action',{exact:true}).selectOption('plan');
  await action.locator('[name="plan"]').fill(plan);
  await action.locator('[name="nextAction"]').fill(nextAction);
  await action.locator('[name="nextUpdateAt"]').fill('5');
  await action.locator('[name="reason"]').fill('Record the fictional containment plan and promised next update.');
  signal.throwIfAborted();
  const planned=await financeClick(page,'/api'+path,()=>action.getByRole('button',{name:'Save incident action',exact:true}).click());
  assert.deepEqual([planned.recorded,planned.historical,planned.actorId,planned.action,planned.sourceId,planned.incidentId],
    [true,true,actorId,'plan',incidentId,incidentId]);
  const containment=await db.prepare('SELECT plan_text,next_action,plan_at,next_update_at FROM service_incident_governance WHERE incident_id=?')
    .bind(incidentId).first<{plan_text:string;next_action:string;plan_at:number;next_update_at:number}>();
  assert.ok(containment);
  assert.deepEqual([containment.plan_text,containment.next_action],[plan,nextAction]);
  assert.ok(Number(containment.plan_at)>0);
  const promisedMinutes=(Number(containment.next_update_at)-Number(containment.plan_at))/60_000;
  assert.ok(promisedMinutes>4&&promisedMinutes<=5,'Persist the five-minute elapsed promise from the mounted form');
  assert.deepEqual(await read(incidentId),working);
  await page.goto(origin+path+'?incident='+incidentId);
  await page.getByText(plan,{exact:true}).waitFor();
  const incidentAction=action.getByLabel('Action',{exact:true});
  const saveIncidentAction=action.getByRole('button',{name:'Save incident action',exact:true});
  await incidentAction.selectOption('plan');
  await saveIncidentAction.click({trial:true});
  await page.getByText('Current recovery evidence is incomplete or stale.').waitFor();
  await incidentAction.selectOption('resolve');
  assert.ok(await saveIncidentAction.isDisabled(),
    'Closure requires current functional recovery evidence');

  const events=(await db.prepare('SELECT id,action,actor_id,request_id FROM service_incident_events WHERE incident_id=?')
    .bind(incidentId).all<{id:string;action:string;actor_id:string;request_id:string}>()).results;
  assert.equal(events.length,3);
  for(const receipt of [first,ack,planned]){
    assert.equal(events.filter(event=>event.request_id===receipt.requestId&&event.actor_id===actorId&&event.action===receipt.action).length,1);
  }
  assert.deepEqual(await parcel(),failed);
  return {incidentId,parcel:failed,detected,working,containment,events};
}

export async function runIncidentRecoveryDrill(options:{
  epoch:OwnedCommerceEpoch; page:Page; actorId:string; signal:AbortSignal;
}) {
  const {epoch,page,actorId,signal}=options;
  await epoch.assertOwned();
  const {db,runtime}=epoch,origin=runtime.APP_ORIGIN!,path='/admin/system-health/incidents';
  const formId='staff.incident-review',serviceKey='form.'+formId;
  const releaseId=runtime.HASTABAZAAR_RELEASE_ID;
  assert.ok(releaseId);
  const forms=page.locator('form[data-form-id="'+formId+'"]');
  const create=forms.filter({has:page.getByRole('button',{name:'Record incident',exact:true})});
  const action=forms.filter({has:page.getByRole('button',{name:'Save incident action',exact:true})});
  const save=action.getByRole('button',{name:'Save incident action',exact:true});
  await page.goto(origin+path);
  await page.getByText('Record a new failure or map a retained legacy incident',{exact:true}).click();
  for(const [field,value] of Object.entries({title:'Fictional incident-form recovery drill',serviceKey,
    failureSignature:'incident-form-recovery-drill',impactSummary:'Isolated drill for a reported intermittent incident review submission failure.'})){
    await create.locator('[name="'+field+'"]').fill(value);
  }
  await create.locator('[name="severity"]').selectOption('routine');
  const created=await financeClick(page,'/api'+path,()=>create.getByRole('button',{name:'Record incident',exact:true}).click());
  assert.deepEqual([created.recorded,created.actorId,created.action],[true,actorId,'create']);
  assert.equal(typeof created.incidentId,'string');
  const incidentId=String(created.incidentId),detailUrl=origin+path+'?incident='+encodeURIComponent(incidentId);
  await page.goto(detailUrl);
  await page.getByText('Current recovery evidence is incomplete or stale.').waitFor();
  // Let the incident creation clock precede the first qualifying command.
  await delay(10,undefined,{signal});
  await action.getByLabel('Action',{exact:true}).selectOption('acknowledge');
  await action.locator('[name="reason"]').fill('Acknowledge the fictional reported incident review submission failure.');
  const ack=await financeClick(page,'/api'+path,()=>save.click());
  assert.deepEqual([ack.recorded,ack.actorId,ack.action,ack.incidentId],[true,actorId,'acknowledge',incidentId]);

  // Use elapsed time and the original clocks written by the packaged form route.
  await delay(60_100,undefined,{signal});
  await epoch.assertOwned();
  await page.goto(detailUrl);
  await action.getByLabel('Action',{exact:true}).selectOption('plan');
  await action.locator('[name="plan"]').fill('Verify two retained incident form submissions in the current release.');
  await action.locator('[name="nextAction"]').fill('Review persisted functional evidence and document the closure decision.');
  await action.locator('[name="nextUpdateAt"]').fill('5');
  await action.locator('[name="reason"]').fill('Save a durable containment plan for the isolated recovery drill.');
  const plan=await financeClick(page,'/api'+path,()=>save.click());
  assert.deepEqual([plan.recorded,plan.actorId,plan.action,plan.incidentId],[true,actorId,'plan',incidentId]);
  assert.ok(ack.requestId&&plan.requestId&&ack.requestId!==plan.requestId);
  const ackCoreId=coreFormReceiptId(formId,ack.requestId),planCoreId=coreFormReceiptId(formId,plan.requestId);

  const readEvidence=async()=>(await db.prepare(`SELECT h.id,h.observed_at,h.evidence_scope,a.request_id,a.kind
    FROM service_health_observations h
    JOIN form_health_observations f ON f.id=h.run_key AND f.environment=h.environment
    JOIN (
      SELECT id,request_id,actor_id,subject_type,subject_id,created_at,'form_answer_set' AS kind
      FROM form_answer_sets WHERE form_id=? AND request_id IN (?,?)
      UNION ALL
      SELECT id,CASE WHEN id=? THEN ? ELSE ? END,actor_id,subject_type,subject_id,created_at,'core_receipt'
      FROM audit_logs WHERE action='form.core_answers' AND id IN (?,?)
    ) a ON a.id=f.evidence_id AND a.kind=f.evidence_kind AND a.created_at=h.observed_at
    WHERE h.environment='local_staging' AND h.service_key=? AND h.source_kind='evaluator'
      AND h.successful=1 AND h.functional_success=1 AND h.eligible_backlog=0
      AND f.release_id=? AND f.form_id=? AND f.outcome='saved'
      AND a.actor_id=? AND a.subject_type='system_incident' AND a.subject_id=?
    ORDER BY h.observed_at,h.id`).bind(formId,ack.requestId,plan.requestId,ackCoreId,ack.requestId,plan.requestId,
      ackCoreId,planCoreId,serviceKey,releaseId,formId,actorId,incidentId)
    .all<{id:string;observed_at:number;evidence_scope:string;request_id:string;kind:string}>()).results;
  let evidence=await readEvidence();
  for(let attempt=0;evidence.length<2&&attempt<10;attempt++){
    signal.throwIfAborted();
    await evaluateFormHealth(db,{environment:'local_staging',releaseId,formId,now:Date.now()},incidentHealthTransitionStatements);
    evidence=await readEvidence();
  }
  assert.deepEqual(evidence.map(row=>row.request_id),[ack.requestId,plan.requestId]);
  const [first,last]=evidence;
  assert.ok(Number(last.observed_at)-Number(first.observed_at)>=60_000);
  assert.ok(first.evidence_scope&&last.evidence_scope===first.evidence_scope);
  const readIncident=()=>db.prepare(`SELECT h.state,h.first_seen_at,h.resolved_at,g.closed_by,
    g.resolution_cause,g.recovery_first_observation_id,g.recovery_last_observation_id
    FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id
    WHERE h.id=? AND h.environment='local_staging' AND h.service_key=?`)
    .bind(incidentId,serviceKey).first<Record<string,unknown>>();
  const before=await readIncident();
  assert.ok(before&&Number(first.observed_at)>Number(before.first_seen_at)&&before.resolved_at===null);
  await page.goto(detailUrl);
  await page.getByText('Two matching current functional observations support recovery review.').waitFor();
  await action.getByLabel('Action',{exact:true}).selectOption('resolve');
  const cause='Cause unknown in this fictional report. Two current durable submissions verified.';
  await action.locator('[name="resolutionCause"]').fill(cause);
  await action.locator('[name="reason"]').fill('Authorize closure after reviewing the current scoped form recovery evidence.');
  signal.throwIfAborted();
  const resolved=await financeClick(page,'/api'+path,()=>save.click());
  assert.deepEqual([resolved.recorded,resolved.actorId,resolved.action,resolved.incidentId],[true,actorId,'resolve',incidentId]);
  const after=await readIncident();
  assert.ok(after&&Number(after.resolved_at)>=Number(last.observed_at));
  assert.deepEqual([after.state,after.closed_by,after.resolution_cause,after.recovery_first_observation_id,after.recovery_last_observation_id],
    ['resolved',actorId,cause,first.id,last.id]);
  const event=await db.prepare("SELECT id,actor_id,request_id FROM service_incident_events WHERE incident_id=? AND action='resolve'")
    .bind(incidentId).first<{id:string;actor_id:string;request_id:string}>();
  assert.ok(event);
  assert.deepEqual([event.actor_id,event.request_id],[actorId,resolved.requestId]);
  await page.goto(detailUrl);
  const row=page.getByRole('row').filter({has:page.getByRole('link',{name:'Fictional incident-form recovery drill',exact:true})});
  await row.getByText('resolved · routine',{exact:true}).waitFor();
  assert.equal(await action.count(),0);
  return {incidentId,serviceKey,evidence,closure:after,event};
}

type OrderWalletEntry = {id:string;user_id:string;kind:string;amount_paisa:number;platform_amount_paisa:number};

async function readWalletBalance(epoch:OwnedCommerceEpoch, buyerId:string) {
  return Number((await epoch.db.prepare('SELECT balance_paisa FROM wallet_accounts WHERE user_id=?')
    .bind(buyerId).first<{balance_paisa:number}>())?.balance_paisa ?? 0);
}

async function readOrderWalletEntries(epoch:OwnedCommerceEpoch, orderId:string) {
  return (await epoch.db.prepare(
    'SELECT id,user_id,kind,amount_paisa,platform_amount_paisa FROM wallet_entries WHERE order_id=? ORDER BY id',
  ).bind(orderId).all<OrderWalletEntry>()).results;
}

async function requireWalletActivity(page:Page, orderNumber:string, label:string, amountPaisa:number) {
  const row = page.getByRole('listitem').filter({hasText:orderNumber})
    .filter({has:page.getByText(label, {exact:true})});
  const displayAmount = (amountPaisa > 0 ? '+' : '') + formatPaisaExact(amountPaisa);
  await row.getByText(displayAmount, {exact:true}).waitFor();
}

export async function runGiftWalletJourney(options:{
  epoch:OwnedCommerceEpoch; issuer:Page; issuerId:string; buyer:Page; buyerId:string; foreignBuyer:Page; foreignBuyerId:string; signal:AbortSignal;
}) {
  const {epoch,issuer,issuerId,buyer,buyerId,foreignBuyer,signal}=options;
  await epoch.assertOwned();
  const origin=epoch.runtime.APP_ORIGIN!;
  const amountPaisa=12_345;
  const balance=()=>readWalletBalance(epoch,buyerId);
  const before=await balance();
  const submit=async(page:Page,path:string,label:string,status:number)=>{
    signal.throwIfAborted();
    const pending=page.waitForResponse(response=>new URL(response.url()).origin===origin&&
      new URL(response.url()).pathname===path&&response.request().method()==='POST');
    await page.getByRole('button',{name:label,exact:true}).click();
    const response=await pending;
    // A successful issuance response contains a one-time secret. Keep it out of assertion messages and evidence.
    assert.equal(response.status(),status);
    assert.equal(response.headers()['cache-control'],'no-store');
    return response;
  };
  await issuer.goto(origin+'/admin/gift-cards');
  await issuer.getByLabel('Amount in NPR',{exact:false}).fill('123.45');
  const issue=await submit(issuer,'/api/admin/gift-cards','Issue gift card',201);
  const issued=await issue.json() as {id:string;code:string;amountPaisa:number;duplicate:boolean};
  assert.ok(typeof issued.code==='string'&&/^HG-[A-F0-9]{48}$/.test(issued.code),'Expected a one-time gift code');
  assert.deepEqual([issued.amountPaisa,issued.duplicate],[amountPaisa,false]);
  const giftId=issued.id;
  const card=()=>epoch.db.prepare('SELECT issued_by,redeemed_by,amount_paisa FROM gift_cards WHERE id=?')
    .bind(giftId).first<{issued_by:string;redeemed_by:string|null;amount_paisa:number}>();
  assert.deepEqual(await card(),{issued_by:issuerId,redeemed_by:null,amount_paisa:amountPaisa});
  assert.equal(await balance(),before);

  const wallet='/account/wallet';
  await buyer.goto(origin+wallet);
  await buyer.getByLabel('Gift card code',{exact:false}).fill(issued.code);
  const redemption=await submit(buyer,'/api/account/gift-cards','Redeem into wallet',200);
  const redeemed=await redemption.json();
  assert.deepEqual([redeemed.id,redeemed.amountPaisa,redeemed.duplicate],[giftId,amountPaisa,false]);
  const record=buyer.getByRole('link',{name:'Open original gift record',exact:true});
  await record.click();
  await buyer.locator('#gift-record-'+giftId).waitFor();
  const source=wallet+'?giftId='+encodeURIComponent(giftId);
  assert.equal(new URL(buyer.url()).searchParams.get('giftId'),giftId);
  await buyer.getByText('Gift card credit',{exact:false}).first().waitFor();
  await foreignBuyer.goto(origin+source);
  await foreignBuyer.getByText('The requested original gift redemption is unavailable for this account.',{exact:true}).waitFor();
  assert.equal(await foreignBuyer.locator('#gift-record-'+giftId).count(),0);
  assert.deepEqual(await card(),{issued_by:issuerId,redeemed_by:buyerId,amount_paisa:amountPaisa});
  const credits=(await epoch.db.prepare('SELECT user_id,kind,amount_paisa FROM wallet_entries WHERE gift_card_id=?')
    .bind(giftId).all<{user_id:string;kind:string;amount_paisa:number}>()).results;
  assert.deepEqual(credits,[{user_id:buyerId,kind:'gift_card',amount_paisa:amountPaisa}]);
  assert.equal(await balance(),before+amountPaisa);
  const recordSelector='#gift-record-'+giftId;
  const anchor='#gift-record-'+encodeURIComponent(giftId);
  const buyerReader={page:buyer,id:buyerId,audience:'customer' as const,href:source+anchor};
  const redeemedNotice=await acknowledgeJourneyNotice({epoch,reader:buyerReader,sourceId:giftId,
    type:'gift_card',template:'business.gift.redeemed',eventKey:'gift:'+giftId+':redeemed',recordSelector,
    foreign:{...buyerReader,page:foreignBuyer,id:options.foreignBuyerId}});
  const issuedNotice=await acknowledgeJourneyNotice({epoch,
    reader:{page:issuer,id:issuerId,audience:'staff',href:'/admin/gift-cards?giftId='+encodeURIComponent(giftId)+anchor},
    sourceId:giftId,type:'gift_card_issued',template:'business.gift.issued',eventKey:'gift:'+giftId+':issued',recordSelector});
  return {giftId,issuerId,buyerId,amountPaisa,credits,redeemedNotice,issuedNotice};
}

export async function runTeamDutyHandoff(options:{
  epoch:OwnedCommerceEpoch; ownerPage:Page; ownerId:string; reviewerPage:Page; reviewerId:string; signal:AbortSignal;
}) {
  const {epoch,ownerPage,ownerId,reviewerPage,reviewerId,signal}=options;
  await epoch.assertOwned();
  const origin=epoch.runtime.APP_ORIGIN!, dutyId='seller_operations', coverage='/admin/team?tab=coverage';
  const profile=()=>epoch.db.prepare('SELECT version,permissions_json FROM staff_permission_profiles WHERE user_id=?').bind(reviewerId)
    .first<{version:number;permissions_json:string}>();
  const initialProfile=await profile();
  assert.ok(initialProfile && JSON.parse(initialProfile.permissions_json).includes('seller.application.review'));
  const active=()=>epoch.db.prepare("SELECT id FROM team_handoffs WHERE duty_id=? AND state IN ('pending','accepted') AND ends_at>?")
    .bind(dutyId,Date.now()).first();
  assert.equal(await active(),null,'Fixture requires a clear original handoff lane');
  const duty=ownerPage.locator('#duty-'+dutyId);
  const invoke=async (page:Page, container:import('playwright-core').Locator, label:string, action:string, sourceId:string) => {
    signal.throwIfAborted();
    const form=container.locator('form[data-form-id="staff.team-governance"]').filter({has:page.getByRole('button',{name:label,exact:true})});
    await form.getByLabel(/^Reason/).fill('Record the exact fictional application review duty handoff in the isolated epoch.');
    const saved=await financeClick(page,'/api/admin/team/governance',()=>form.getByRole('button',{name:label,exact:true}).click());
    assert.equal(saved.saved,true);
    assert.deepEqual([saved.reference.actorId,saved.reference.action,saved.reference.sourceId],[page===ownerPage?ownerId:reviewerId,action,sourceId]);
    assert.ok(saved.reference.requestId && saved.result.id);
    return saved as {result:{id:string;revision:number};reference:{requestId:string}};
  };
  const roster=()=>epoch.db.prepare('SELECT primary_user_id FROM team_duties WHERE id=?').bind(dutyId).first<{primary_user_id:string|null}>();
  const original=await roster();
  assert.ok(!original?.primary_user_id||original.primary_user_id===ownerId,'Existing named roster belongs to another actor');
  await ownerPage.goto(origin+coverage);
  if(original?.primary_user_id!==ownerId) {
    await duty.getByText('Edit primary and ordered cover',{exact:true}).click();
    await duty.getByLabel('Accountable primary',{exact:true}).selectOption(ownerId);
    await invoke(ownerPage,duty,'Save this exact roster','save_duty',dutyId);
    assert.equal((await roster())?.primary_user_id,ownerId);
    await ownerPage.reload();
  }
  await duty.getByText('Propose a planned handoff',{exact:true}).click();
  await duty.getByLabel(/^Eligible substitute/).selectOption(reviewerId);
  await duty.getByLabel(/^Starts/).fill(financeNepalTime());
  const endsAt=new Date(Date.now()+405*60_000).toISOString().slice(0,16);
  await duty.getByLabel(/^Ends/).fill(endsAt);
  const proposed=await invoke(ownerPage,duty,'Propose handoff for receipt','propose_handoff',dutyId);
  const handoffId=proposed.result.id;
  const read=()=>epoch.db.prepare('SELECT duty_id,from_user_id,to_user_id,state,revision,starts_at,ends_at,accepted_at FROM team_handoffs WHERE id=?')
    .bind(handoffId).first<Record<string,unknown>>();
  const pending=await read();
  assert.ok(pending);
  assert.deepEqual([pending.duty_id,pending.from_user_id,pending.to_user_id,pending.state,Number(pending.revision),pending.accepted_at],
    [dutyId,ownerId,reviewerId,'pending',proposed.result.revision,null]);
  await ownerPage.reload();
  const ownerCard=ownerPage.locator('#handoff-'+handoffId);
  await ownerCard.waitFor();
  assert.equal(await ownerCard.getByRole('button',{name:'Confirm receipt of this duty',exact:true}).count(),0);
  await reviewerPage.goto(origin+coverage);
  const accepted=await invoke(reviewerPage,reviewerPage.locator('#handoff-'+handoffId),'Confirm receipt of this duty','accept_handoff',handoffId);
  assert.equal(accepted.result.id,handoffId);
  const current=await read();
  assert.ok(current && current.state==='accepted' && Number(current.accepted_at)>0);
  assert.deepEqual([current.duty_id,current.from_user_id,current.to_user_id,current.starts_at,current.ends_at,Number(current.revision)],
    [dutyId,ownerId,reviewerId,pending.starts_at,pending.ends_at,Number(pending.revision)+1]);
  await ownerPage.reload();
  const closed=await invoke(ownerPage,ownerCard,'Cancel this recorded handoff','cancel_handoff',handoffId);
  assert.equal(closed.result.id,handoffId);
  const cancelled=await read();
  assert.deepEqual(cancelled,{...current,state:'cancelled',revision:closed.result.revision});
  assert.equal(await active(),null);
  assert.deepEqual(await profile(),initialProfile);
  const events=(await epoch.db.prepare("SELECT id,action,actor_id,request_id FROM team_governance_events WHERE source_type='handoff' AND source_id=?")
    .bind(handoffId).all<{id:string;action:string;actor_id:string;request_id:string}>()).results;
  assert.equal(events.length,3);
  for(const [action,actor,request] of [['propose_handoff',ownerId,proposed],['accept_handoff',reviewerId,accepted],['cancel_handoff',ownerId,closed]] as const){
    assert.equal(events.filter(event=>event.action===action&&event.actor_id===actor&&event.request_id===request.reference.requestId).length,1);
  }
  return {handoffId,dutyId,pending,current,cancelled,events};
}

export async function runSharedTeamCurrentSession(options: {
  epoch: OwnedCommerceEpoch;
  db: Connection;
  selectedViews: Awaited<ReturnType<typeof bindSelectedBrowserViews>>;
  origin: string;
  reviewerPage: Page;
  ownerPage: Page;
  reviewer: Awaited<ReturnType<typeof prepareSharedTeamReviewer>>;
  owner: Actor;
  admittedSuperAdminIds: readonly string[];
  formHealthScope: { environment: string; releaseId: string };
  signal: AbortSignal;
}) {
  const { epoch, db, origin, reviewerPage, ownerPage, reviewer, owner, admittedSuperAdminIds, formHealthScope, signal, selectedViews } = options;
  await epoch.assertOwned();
  const catalog = '/admin/catalog';
  const team = '/admin/team?tab=people';
  const formId = 'staff.staff-permission-1';
  const original = ['audit_log.view', 'seller.application.review'];
  const cursorFamily = 'team.access-reconciliation';
  const normalized = (permissions: string[]) => [...permissions].sort();
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
    url.port && url.port !== '3018', 'Requires an admitted isolated loopback runtime');
  assert.ok(reviewerPage.context() !== ownerPage.context());
  for (const account of [reviewer, owner]) {
    assert.ok(/^[a-f0-9-]{36}$/.test(account.id) && account.email === account.id + '@local.hastabazaar.test',
      'Requires admitted fictional staff');
  }
  const query = async (sql: string, args: unknown[] = []) => (await db.query<RowDataPacket[]>(sql, args))[0];
  const profile = async () => {
    const [row, extra] = await query('SELECT * FROM staff_permission_profiles WHERE user_id=?', [reviewer.id]);
    assert.ok(row && !extra);
    return row;
  };
  const baselineProfile = await profile();
  assert.equal(Number(baselineProfile.version), 1);
  assert.deepEqual(normalized(JSON.parse(baselineProfile.permissions_json)), original);
  const blocked = await query(`SELECT 1 FROM review_tasks WHERE owner_id=?
    UNION ALL SELECT 1 FROM team_duties WHERE primary_user_id=?
    UNION ALL SELECT 1 FROM team_duty_backups WHERE user_id=?
    UNION ALL SELECT 1 FROM team_handoffs WHERE to_user_id=? AND state='accepted'
    UNION ALL SELECT 1 FROM team_governance_tasks WHERE kind IN ('access_change','access_reconciliation') AND state='open'
    UNION ALL SELECT 1 FROM operational_notice_states WHERE family='team.staff' AND source_id=?`,
    Array(5).fill(reviewer.id));
  assert.equal(blocked.length, 0, 'Use a fresh Reviewer and an isolated reconciliation queue');
  const recipients = await query(`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.status='active' AND r.role='super_admin' ORDER BY u.id`);
  assert.ok(recipients.some(row => row.id === owner.id));
  assert.ok(digest(recipients.map(row => String(row.id)).sort()) === digest([...admittedSuperAdminIds].sort()),
    'Every potential Super Admin notice recipient must be explicitly admitted as fictional');

  signal.throwIfAborted();
  const session = async () => {
    const cookies = (await reviewerPage.context().cookies()).filter(cookie => cookie.name === 'hastabazaar_session');
    const [cookie] = cookies;
    assert.ok(cookies.length === 1 && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.domain === url.hostname && cookie.path === '/' && cookie.value,
      'Reviewer must retain one protected session');
    return cookie.value;
  };
  const initialSession = await session();
  async function observeCatalog(allowed: boolean) {
    await reviewerPage.goto(origin + catalog);
    await reviewerPage.waitForURL(origin + (allowed ? catalog : '/staff-access-denied'));
    await reviewerPage.getByRole('heading', {
      name: allowed ? 'Categories and occasions' : 'Staff access restricted', exact: true,
    }).waitFor();
    if (!allowed) {
      await reviewerPage.getByText(reviewer.email + ' is signed in, but does not have permission to access this page.', { exact: true }).waitFor();
    }
    assert.ok(await session() === initialSession, 'Reviewer session identity must stay constant');
  }

  await reviewerPage.goto(origin + '/admin/team');
  await reviewerPage.getByRole('heading', { name: 'My responsibilities', exact: true }).waitFor();
  await reviewerPage.getByRole('heading', { name: 'My work access', exact: true }).waitFor();
  await ownerPage.goto(origin + '/admin/team?tab=policies');
  await ownerPage.getByRole('heading', { name: 'Canonical policy register', exact: true }).waitFor();
  await ownerPage.getByRole('article').filter({ has: ownerPage.getByRole('heading', { name: 'Company operating procedure', exact: true }) })
    .getByRole('link', { name: 'Open authorized original workflow and history', exact: true }).click();
  await ownerPage.waitForURL(url => url.pathname === '/admin/legal-policies');
  await ownerPage.getByRole('heading', { name: 'Legal compliance & incident procedure', exact: true }).waitFor();
  await observeCatalog(false);
  await Promise.all([ownerPage.waitForLoadState('networkidle'), reviewerPage.waitForLoadState('networkidle')]);
  const baselineHealthIds = new Set((await query('SELECT id FROM form_health_observations')).map(row => row.id));
  const healthLoads = new Map<string, string>();
  const posts: string[] = [];
  const events: string[] = [];
  const taskIds: string[] = [];
  const auditIds: string[] = [];
  // Each listed predicate excludes only fixture-owned row keys from exact
  // byte-image preservation. Whole-table inventories protect all other tables.
  const owned = () => [
    ['staff_permission_profiles', 'user_id', [reviewer.id]],
    ['staff_permission_requests', 'id', posts],
    ['audit_logs', 'id', auditIds],
    ['form_answer_sets', 'request_id', posts],
    ['form_health_observations', 'id', [...healthLoads.keys()]],
    ['team_governance_tasks', 'id', taskIds],
    ['team_governance_events', 'id', events],
    ['notification_messages', 'related_id', events],
    ['operational_reminder_cursors', 'family', [cursorFamily]],
    ['operational_notice_states', 'source_id', [reviewer.id]],
  ] as const;
  async function inventory() {
    const { schemaSha256, tables } = await captureNativeInventory(db, selectedViews);
    const stateTables = new Set(['user_sessions', 'marketplace_settings', 'traffic_sessions', 'traffic_events']);
    const ownedTables = new Set<string>(owned().map(([table]) => table));
    const settings = await query("SELECT * FROM marketplace_settings WHERE `key` NOT LIKE 'auth-private:%' ORDER BY BINARY `key`");
    const originalRows = [];
    for (const [table, column, values] of owned()) {
      const columns = await query(`SELECT COLUMN_NAME name FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [table]);
      assert.ok(columns.length > 0 && columns.length <= 512);
      const exact = columns.map(({ name }, index) => {
        assert.ok(typeof name === 'string' && /^[a-z_][a-z0-9_]*$/.test(name));
        return 'HEX(CAST(`' + name + '` AS BINARY)) AS c' + index;
      }).join(',');
      const scope = values.length ? `WHERE ${column} IS NULL OR ${column} NOT IN (${values.map(() => '?').join(',')})` : '';
      const rows = await query(`SELECT ${exact} FROM ${table} ${scope}`, [...values]);
      originalRows.push([table, rows.map(digest).sort()]);
    }
    return {
      schemaSha256, settings: digest(settings), originalRows,
      tables: tables.filter((table: { name: string }) => !stateTables.has(table.name) && !ownedTables.has(table.name)),
    };
  }
  const baseline = await inventory();
  let grantNoticeId: string | undefined;
  let firstWriteImage: string | undefined;
  const [originalCursor] = await query('SELECT * FROM operational_reminder_cursors WHERE family=?', [cursorFamily]);
  assert.ok(!originalCursor || (originalCursor.lease_token === null && originalCursor.lease_until === null));
  const formReads: string[] = [];
  const observeFormRead = (response: Response) => {
    const address = new URL(response.url());
    if (address.origin === origin && response.request().method() === 'GET' &&
      response.status() === 200 && address.pathname.startsWith('/api/forms/')) {
      formReads.push(decodeURIComponent(address.pathname.slice('/api/forms/'.length)));
    }
  };
  ownerPage.on('response', observeFormRead);
  reviewerPage.on('response', observeFormRead);
  try {
    for (const allowed of [true, false]) await changeAccess(allowed);
  } finally {
    ownerPage.off('response', observeFormRead);
    reviewerPage.off('response', observeFormRead);
  }
  const permissionLoads = await query(
    "SELECT id,support_reference FROM form_health_observations WHERE form_id=? AND environment=? AND release_id=? ORDER BY observed_at,id",
    [formId, formHealthScope.environment, formHealthScope.releaseId],
  );
  const retainedLoad = permissionLoads.find(row => healthLoads.has(row.id));
  assert.ok(retainedLoad);
  await ownerPage.goto(origin + '/admin/system-health');
  await ownerPage.getByRole('heading', { name: 'System health & records', exact: true }).waitFor();
  await ownerPage.getByText(/Unknown — no matching functional observation/).first().waitFor();
  await ownerPage.getByRole('navigation', { name: 'System health areas' }).getByRole('link', { name: 'Records & audit' }).click();
  const records = ownerPage.locator('form[data-form-id="staff.system-records-filter"]');
  await records.locator('[name="reference"]').fill(retainedLoad.support_reference);
  await records.locator('[name="type"]').fill('form');
  await records.getByRole('button', { name: 'Find scoped records', exact: true }).click();
  const retained = ownerPage.locator('main ol > li').filter({ hasText: retainedLoad.support_reference });
  await retained.waitFor();
  await retained.getByText(formId, { exact: false }).waitFor();
  assert.equal(await retained.getByRole('button').count(), 0);
  await ownerPage.goto(origin + '/admin/team?tab=policies');
  await ownerPage.getByText('Governance action history', { exact: true }).click();
  for (const id of events) await ownerPage.locator('#event-' + id).waitFor();
  await reviewerPage.goto(origin + '/admin/system-health/records');
  await reviewerPage.waitForURL(origin + '/staff-access-denied');
  assert.ok(await session() === initialSession);
  assert.deepEqual(await inventory(), baseline, 'Health and history navigation preserved original rows');
  return { tests: 1, reviewerAccess: ['denied', 'allowed', 'denied'], versions: [1, 2, 3], recordedPosts: posts.length, retainedGrantEvent: events[0], currentEvent: events[1], grantNoticeId };

  async function changeAccess(allowed: boolean) {
    signal.throwIfAborted();
    await epoch.assertOwned();
    const expectedVersion = allowed ? 1 : 2;
    const permissions = allowed ? [...original, 'catalog.manage'] : original;
    const reason = allowed ? 'Fictional V17 catalogue access grant.' : 'Fictional V17 catalogue access revocation.';
    await ownerPage.goto(origin + team);
    await ownerPage.getByRole('heading', { name: 'Staff access', exact: true }).waitFor();
    await ownerPage.locator('#permission-admin').selectOption(reviewer.id);
    const form = ownerPage.locator(`form[data-form-id="${formId}"]`);
    await form.getByRole('region', { name: 'Staff summary' }).getByText(`Version ${expectedVersion}.`, { exact: false }).waitFor();
    const checkbox = form.getByRole('checkbox', { name: 'Manage the catalog', exact: true });
    assert.equal(await checkbox.isChecked(), !allowed);
    await checkbox.setChecked(allowed);
    await form.locator('[name="reason"]').fill(reason);
    await form.getByRole('button', { name: 'Save permissions', exact: true }).click();
    const dialog = ownerPage.getByRole('alertdialog');
    await dialog.getByText('Review permissions for ' + reviewer.displayName, { exact: true }).waitFor();
    const [response] = await Promise.all([
      ownerPage.waitForResponse(value => value.url() === origin + '/api/admin/staff-permissions' &&
        value.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Confirm permission changes', exact: true }).click(),
    ]);
    assert.equal(response.status(), 201, 'The real staff permission receiver accepted the confirmed edit');
    const body = response.request().postDataJSON();
    const requestId = body.requestId as string;
    assert.ok(/^[a-f0-9-]{36}$/.test(requestId) && !posts.includes(requestId));
    assert.equal(body.action, 'propose');
    assert.equal(body.userId, reviewer.id);
    assert.equal(body.version, expectedVersion);
    assert.equal(body.reason, reason);
    assert.equal(body.presetName, '');
    assert.deepEqual(normalized(body.permissions), normalized(permissions));
    const outcome = await response.json();
    assert.ok(outcome.recorded === true && outcome.phase === 'recorded' && outcome.status === 'approved' &&
      outcome.action === 'propose' && outcome.actorId === owner.id && outcome.sourceId === reviewer.id &&
      outcome.requestId === requestId && outcome.id === requestId, 'Receiver returned a bound approved outcome');
    posts.push(requestId);

    const current = await profile();
    assert.equal(Number(current.version), expectedVersion + 1);
    assert.equal(current.last_request_id, requestId);
    assert.equal(current.updated_by, owner.id);
    assert.deepEqual(normalized(JSON.parse(current.permissions_json)), normalized(permissions));
    const requests = await query('SELECT * FROM staff_permission_requests WHERE user_id=? ORDER BY expected_version', [reviewer.id]);
    assert.deepEqual(requests.map(row => row.id), posts);
    const request = requests.at(-1)!;
    assert.equal(Number(request.expected_version), expectedVersion);
    assert.deepEqual(normalized(JSON.parse(request.permissions_json)), normalized(permissions));
    assert.ok(request.status === 'approved' && request.proposed_by === owner.id && request.decided_by === owner.id &&
      request.reason === reason && request.decision_note === reason && request.preset_name === null);

    const audits = await query("SELECT * FROM audit_logs WHERE subject_type='staff_permissions' AND subject_id=? AND action='staff.permissions.applied'", [reviewer.id]);
    assert.equal(audits.length, posts.length);
    const audit = audits.find(row => row.request_id === requestId);
    assert.ok(audit && audit.actor_id === owner.id && audit.reason === reason);
    auditIds.push(audit.id);
    const before = JSON.parse(audit.previous_json);
    const after = JSON.parse(audit.next_json);
    assert.equal(Number(before.version), expectedVersion);
    assert.equal(Number(after.version), expectedVersion + 1);
    assert.deepEqual(normalized(before.permissions), normalized(allowed ? original : [...original, 'catalog.manage']));
    assert.deepEqual(normalized(after.permissions), normalized(permissions));
    assert.ok(after.approvalMode === 'direct' && after.status === 'approved' && after.id === requestId);
    assert.ok(after.commandProof?.requestId === requestId && after.commandProof?.sourceId === reviewer.id);
    const answers = await query('SELECT * FROM form_answer_sets WHERE request_id=?', [requestId]);
    const core = await query("SELECT * FROM audit_logs WHERE action='form.core_answers' AND subject_type='staff_permission_request' AND subject_id=?", [requestId]);
    assert.equal(answers.length + core.length, 1);
    const receipt = answers[0] ?? core[0];
    assert.equal(receipt.actor_id, owner.id);
    assert.ok(Number.isSafeInteger(body.formVersion) && body.formVersion >= 1);
    const receiptVersionId = after.commandProof.formVersionId;
    if (answers.length) {
      assert.ok(receipt.form_id === formId && receipt.config_version_id === receiptVersionId &&
        receipt.subject_type === 'staff_permission_request' && receipt.subject_id === requestId);
      const [version] = await query('SELECT version FROM form_config_versions WHERE id=? AND form_id=?', [receiptVersionId, formId]);
      assert.equal(Number(version?.version), body.formVersion);
    } else {
      const proof = JSON.parse(receipt.next_json);
      assert.ok(proof.requestId === requestId && proof.versionId === `core:${formId}:1` && body.formVersion === 1 &&
        proof.versionId === after.commandProof.formVersionId);
      auditIds.push(receipt.id);
    }

    const history = await query("SELECT * FROM team_governance_events WHERE source_type='staff' AND source_id=?", [reviewer.id]);
    assert.equal(history.length, posts.length);
    const event = history.find(row => row.request_id === requestId);
    assert.ok(event && event.action === 'access_changed' && event.actor_id === owner.id);
    events.push(event.id);
    const detail = JSON.parse(event.details_json);
    assert.ok(detail.recipientId === reviewer.id && detail.grantRequestId === requestId &&
      detail.grantVersion === expectedVersion + 1 && detail.decisionAction === 'staff.permissions.applied');
    const tasks = await query('SELECT * FROM team_governance_tasks WHERE subject_user_id=?', [reviewer.id]);
    assert.equal(tasks.length, posts.length);
    const task = tasks.find(row => JSON.parse(row.source_reference_json).requestId === requestId);
    assert.ok(task && task.kind === 'access_change' && task.state === 'completed' && Number(task.revision) === 1);
    const taskReference = JSON.parse(task.source_reference_json);
    assert.ok(taskReference.actorId === owner.id && taskReference.userId === reviewer.id &&
      taskReference.grantVersion === expectedVersion + 1 && taskReference.snapshotKind === 'root');
    taskIds.push(task.id);
    const [cursor] = await query('SELECT * FROM operational_reminder_cursors WHERE family=?', [cursorFamily]);
    assert.ok(cursor && cursor.cursor === task.id && cursor.lease_token === null && cursor.lease_until === null);
    assert.equal(Number(cursor.revision), Number(originalCursor?.revision ?? 0) + 2 * posts.length);
    const [head] = await query("SELECT * FROM operational_notice_states WHERE family='team.staff' AND source_id=?", [reviewer.id]);
    assert.ok(head && head.current_event_id === event.id && head.current_status === 'access_changed:team_governance');
    assert.equal(Number(head.revision), posts.length - 1);
    const notices = await query('SELECT * FROM notification_messages WHERE related_id=?', [event.id]);
    const expectedRecipients = [...recipients.map(row => [row.id, 'admin.invite']), [reviewer.id, 'account.self.manage']];
    assert.deepEqual(notices.map(row => JSON.stringify([row.recipient_user_id, row.required_permission, row.channel])).sort(),
      expectedRecipients.flatMap(([id, permission]) => ['in_app', 'email'].map(channel => JSON.stringify([id, permission, channel]))).sort());
    assert.ok(notices.every(row => row.related_type === 'team_governance_event' &&
      row.template_key === 'business.team.governance' && row.status === 'queued' && row.audience_role === 'staff'));

    const noticePath = '/admin/operational-notices/team_governance_event/' + event.id;
    for (const [page, actorId] of [[ownerPage, owner.id], [reviewerPage, reviewer.id]] as const) {
      const item = await readSharedTeamPanel(page, origin, actorId, event.id, allowed ? undefined : events[0]);
      const expected = notices.find(row => row.recipient_user_id === actorId && row.channel === 'in_app');
      assert.ok(expected && item.id === expected.id && item.readAt === null);
      await page.goto(origin + '/admin/notifications');
      const link = page.locator('a[href="' + noticePath + '"]');
      await link.waitFor();
      assert.equal(await link.count(), 1);
      if (!allowed) assert.equal(await page.locator('a[href="/admin/operational-notices/team_governance_event/' + events[0] + '"]').count(), 0);
      if (page === reviewerPage && allowed) {
        grantNoticeId = item.id;
        const [read] = await Promise.all([
          page.waitForResponse(response => response.url() === origin + '/api/admin/notifications/' + item.id + '/read' &&
            response.request().method() === 'POST'),
          page.getByRole('article').filter({ has: link }).getByRole('button', { name: 'Mark as read', exact: true }).click(),
        ]);
        assert.equal(read.status(), 200);
        const acknowledged = await readSharedTeamPanel(page, origin, actorId, event.id);
        assert.ok(acknowledged.readAt !== null);
        assert.equal((await query('SELECT read_at FROM notification_messages WHERE id=?', [item.id]))[0].read_at.toString(),
          String(acknowledged.readAt));
        expected.read_at = acknowledged.readAt;
      }
    }
    const destination = await ownerPage.goto(origin + noticePath);
    assert.ok(destination?.ok());
    await ownerPage.waitForURL(origin + team + '#person-' + reviewer.id);
    await ownerPage.locator('#person-' + reviewer.id).waitFor();
    if (!allowed) {
      const stale = await ownerPage.goto(origin + '/admin/operational-notices/team_governance_event/' + events[0]);
      assert.equal(stale?.status(), 404);
      assert.ok(grantNoticeId);
    }

    // The second write cannot edit any of the first write's immutable rows.
    const firstWriteRows = [
      requests[0],
      audits.find(row => row.request_id === posts[0]),
      history.find(row => row.request_id === posts[0]),
      tasks.find(row => row.id === taskIds[0]),
      ...await query('SELECT * FROM form_answer_sets WHERE request_id=?', [posts[0]]),
      ...await query("SELECT * FROM audit_logs WHERE action='form.core_answers' AND subject_id=?", [posts[0]]),
      ...await query('SELECT * FROM notification_messages WHERE related_id=? ORDER BY BINARY id', [events[0]]),
    ];
    const firstWriteDigest = digest(firstWriteRows);
    if (allowed) firstWriteImage = firstWriteDigest;
    else assert.ok(firstWriteDigest === firstWriteImage, 'The grant rows retain their original values');
    await observeCatalog(allowed);
    await Promise.all([ownerPage.waitForLoadState('networkidle'), reviewerPage.waitForLoadState('networkidle')]);
    const freshLoads = [];
    for (const row of await query('SELECT * FROM form_health_observations')) {
      if (baselineHealthIds.has(row.id)) continue;
      const previous = healthLoads.get(row.id);
      if (previous) {
        assert.ok(previous === digest(row), 'Earlier fixture form observations must be retained');
        continue;
      }
      assert.ok(row.environment === formHealthScope.environment && row.release_id === formHealthScope.releaseId &&
        row.phase === 'load' && row.outcome === 'compatible' && row.category === null &&
        row.evidence_kind === 'runtime' && row.evidence_id === null, 'Only compatible runtime form loads belong to this journey');
      freshLoads.push(row.form_id);
      healthLoads.set(row.id, digest(row));
    }
    // Each successful definition GET and the validating permission POST load one
    // definition. UI remounts can legitimately change the number of GETs.
    const compareFormIds = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
    assert.deepEqual(freshLoads.sort(compareFormIds), [...formReads.splice(0), formId].sort(compareFormIds));
    assert.deepEqual(await inventory(), baseline, 'Preserve schema and every original row outside the exact fixture write keys');
  }
}






const path = '/admin/exceptions';
const receiver = '/api/admin/exception-work';

async function exceptionRows(db: Connection, sql: string, args: unknown[]) {
  return (await db.query<RowDataPacket[]>(sql, args))[0].map(row => ({ ...row }));
}

async function exceptionSubmit(form: Locator, name: string, page: Page, origin: string) {
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url() === origin + receiver),
    form.getByRole('button', { name, exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, 'Packaged exception receiver status');
  const payload = response.request().postDataJSON();
  const { requestId, formVersion } = payload;
  assert.ok(typeof requestId === 'string' && requestId);
  return { requestId, formVersion, payload, body: await response.json() };
}

// Import and invoke inside the owned isolated fixture. No setup runs on import.
export async function runExceptionBrowser({
  db, origin, signal, ownerPage, adminPage, owner, admin, orderId, jobId,
}: {db: Connection; origin: string; signal: AbortSignal; ownerPage: Page; adminPage: Page; owner: Actor; admin: Actor & {displayName: string}; orderId: string; jobId: string}) {
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.hostname === '127.0.0.1' && url.protocol === 'http:' && url.port && url.port !== '3018');
  signal.throwIfAborted();
  assert.notEqual(ownerPage.context(), adminPage.context());
  assert.notEqual(owner.id, admin.id);
  for (const page of [ownerPage, adminPage]) {
    const session = (await page.context().cookies(origin)).find(cookie => cookie.name === 'hastabazaar_session');
    assert.ok(session?.httpOnly && session.sameSite === 'Lax', 'Expected a protected signed-in session');
  }
  const authority = await exceptionRows(db, "SELECT u.id,r.role,p.permissions_json FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND u.id IN (?,?)", [owner.id, admin.id]);
  assert.ok(authority.some(row => row.id === owner.id && row.role === 'super_admin'));
  const assignedAdmin = authority.find(row => row.id === admin.id && row.role === 'admin');
  assert.ok(assignedAdmin?.permissions_json, 'Expected an explicit Admin permission profile');
  assert.deepEqual(JSON.parse(assignedAdmin.permissions_json), ['order.manage']);

  const parcel = () => exceptionRows(db, 'SELECT * FROM shipping_jobs WHERE order_id=? ORDER BY id', [orderId]);
  const cash = () => exceptionRows(db, 'SELECT c.* FROM parcel_cash_records c JOIN shipping_jobs j ON j.id=c.shipping_job_id WHERE j.order_id=? ORDER BY c.id', [orderId]);
  const payments = () => exceptionRows(db, 'SELECT * FROM payments WHERE order_id=? ORDER BY id', [orderId]);
  const order = () => exceptionRows(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
  const [beforeParcel, beforeCash, beforePayments, beforeOrder] = await Promise.all([parcel(), cash(), payments(), order()]);
  assert.equal(beforeOrder.length, 1);
  assert.equal(beforeParcel.find(row => row.id === jobId)?.status, 'delivery_failed');
  assert.ok(beforeCash.some(row => row.shipping_job_id === jobId && row.status === 'posted'), 'A posted source-parcel row makes cash conservation observable');
  assert.ok(beforePayments.length, 'A real payment row makes payment conservation observable');
  const sourceKey = 'failed_delivery:' + jobId + ':';
  const readCase = () => exceptionRows(db, 'SELECT * FROM exception_work_items WHERE source_key=?', [sourceKey]);
  assert.deepEqual(await readCase(), []);

  const marker = randomUUID();
  const next = 'Review fictional delivery evidence ' + marker;
  const revised = 'Check the authorized next attempt ' + marker;
  const report = 'Fictional failed delivery report ' + marker;
  const reason = 'Assign fictional operations review ' + marker;
  const orderPath = '/admin/orders/' + encodeURIComponent(orderId) + '#exceptions';
  await ownerPage.goto(origin + path);
  const source = ownerPage.getByRole('link').filter({ hasText: String(beforeOrder[0].order_number) })
    .filter({ hasText: 'Review source and record next action' });
  assert.equal(await source.getAttribute('href'), orderPath);
  await source.click();
  await ownerPage.waitForURL(origin + orderPath);
  const section = ownerPage.locator('#exceptions');
  const reportPanel = section.locator('details').filter({ hasText: 'Report a parcel or posted-cash exception' });
  await reportPanel.locator('summary').click();
  const reportForm = reportPanel.locator('form[data-form-id="staff.exception-work"]');
  await reportForm.locator('[name=job]').selectOption(jobId);
  await reportForm.locator('select:not([name])').selectOption('failed_delivery');
  await reportForm.locator('[name=owner]').selectOption('');
  await reportForm.locator('[name=next]').fill(next);
  await reportForm.locator('[name=note]').fill(report);
  const created = await exceptionSubmit(reportForm, 'Report exception follow-up', ownerPage, origin);
  assert.ok(typeof created.body.id === 'string' && created.body.id);
  assert.deepEqual([created.payload.action, created.payload.jobId, created.payload.kind, created.payload.ownerId], ['create', jobId, 'failed_delivery', null]);
  const caseId = created.body.id;
  const [initial] = await readCase();
  assert.deepEqual(
    [initial.id, initial.order_id, initial.shipping_job_id, initial.kind, initial.cash_record_id, initial.status, initial.owner_id, initial.next_action, Number(initial.version), initial.created_by],
    [caseId, orderId, jobId, 'failed_delivery', null, 'open', null, next, 0, owner.id],
  );

  signal.throwIfAborted();
  const article = section.locator('article').filter({ hasText: next });
  await article.getByText('Responsible: Unassigned operations queue', { exact: true }).waitFor();
  const updateForm = article.locator('form[data-form-id="staff.exception-work"]');
  await updateForm.locator('[name=owner]').selectOption(admin.id);
  await updateForm.locator('[name=next]').fill(revised);
  await updateForm.locator('[name=note]').fill(reason);
  const assigned = await exceptionSubmit(updateForm, 'Save follow-up', ownerPage, origin);
  assert.equal(assigned.body.ok, true);
  assert.deepEqual([assigned.payload.action, assigned.payload.id, assigned.payload.version, assigned.payload.ownerId], ['update', caseId, 0, admin.id]);
  assert.notEqual(created.requestId, assigned.requestId);
  const [current] = await readCase();
  assert.deepEqual(
    [current.id, current.order_id, current.shipping_job_id, current.kind, current.cash_record_id, current.status, current.owner_id, current.next_action, Number(current.version), current.created_by],
    [caseId, orderId, jobId, 'failed_delivery', null, 'open', admin.id, revised, 1, owner.id],
  );

  await adminPage.goto(origin + path);
  const assignedLink = adminPage.getByRole('link').filter({ hasText: revised });
  assert.equal(await assignedLink.getAttribute('href'), orderPath);
  await assignedLink.click();
  await adminPage.waitForURL(origin + orderPath);
  const assignedArticle = adminPage.locator('#exceptions article').filter({ hasText: revised });
  await assignedArticle.getByText('Responsible: ' + admin.displayName, { exact: true }).waitFor();
  await assignedArticle.getByText('Recorded history', { exact: true }).click();
  await assignedArticle.getByText(report, { exact: true }).waitFor();
  await assignedArticle.getByText(reason, { exact: true }).waitFor();

  const events = await exceptionRows(db, 'SELECT id,actor_id,action,owner_id,next_action,note,evidence FROM exception_work_events WHERE work_id=? ORDER BY action DESC', [caseId]);
  assert.deepEqual(events, [
    { id: created.requestId, actor_id: owner.id, action: 'created', owner_id: null, next_action: next, note: report, evidence: null },
    { id: assigned.requestId, actor_id: owner.id, action: 'assigned', owner_id: admin.id, next_action: revised, note: reason, evidence: null },
  ]);
  for (const post of [created, assigned]) {
    const answers=await exceptionRows(db,"SELECT a.actor_id,a.subject_id,v.version FROM form_answer_sets a JOIN form_config_versions v ON v.id=a.config_version_id WHERE a.form_id='staff.exception-work' AND a.request_id=?",[post.requestId]);
    const core=await exceptionRows(db,"SELECT actor_id,subject_id,next_json FROM audit_logs WHERE action='form.core_answers' AND subject_type='exception_work' AND subject_id=? AND JSON_VALUE(next_json,'$.requestId')=?",[caseId,post.requestId]);
    assert.equal(answers.length+core.length,1);
    const receipt=answers[0]??core[0];assert.equal(receipt.actor_id,owner.id);assert.equal(receipt.subject_id,caseId);
    if(answers.length)assert.equal(Number(receipt.version),post.formVersion);
    else {const proof=JSON.parse(receipt.next_json);assert.equal(proof.versionId,'core:staff.exception-work:1');assert.equal(post.formVersion,1);}
  }
  const audits = await exceptionRows(db, 'SELECT request_id,actor_id,action,subject_type,subject_id FROM audit_logs WHERE request_id IN (?,?) ORDER BY action DESC', [created.requestId + ':audit', assigned.requestId + ':audit']);
  assert.deepEqual(audits, events.map(event => ({
    request_id: event.id + ':audit', actor_id: owner.id, action: 'exception.' + event.action, subject_type: 'order', subject_id: orderId,
  })));
  const superAdmins = await exceptionRows(db, "SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role='super_admin' ORDER BY u.id", []);
  assert.ok(superAdmins.some(row => row.id === owner.id));
  const notices = await exceptionRows(db, 'SELECT channel,recipient_user_id,audience_role,required_permission FROM notification_messages WHERE related_type=? AND related_id=? AND template_key=? ORDER BY recipient_user_id,channel', ['exception_work', caseId, 'business.exception.assigned']);
  const recipients = [
    { id: admin.id, permission: 'order.manage' },
    ...superAdmins.map(row => ({ id: row.id, permission: 'admin.invite' })),
  ];
  const expectedNotices = recipients.flatMap(({ id, permission }) => ['email', 'in_app'].map(channel => ({
    channel, recipient_user_id: id, audience_role: 'staff', required_permission: permission,
  })));
  const key = (row: Record<string,unknown>) => row.recipient_user_id + ':' + row.channel;
  assert.deepEqual(notices.sort((a, b) => key(a).localeCompare(key(b))), expectedNotices.sort((a, b) => key(a).localeCompare(key(b))));
  for (const [page, actor] of [[adminPage,admin],[ownerPage,owner]] as const) {
    await page.goto(origin + '/admin/notifications');
    const items = await page.evaluate(async actorId => {
      const response=await fetch('/api/notifications?audience=staff',{headers:{'X-Hastabazaar-Actor':actorId}});
      if(!response.ok)throw Error('Exception panel failed');
      return (await response.json() as {items: SharedTeamPanelItem[]}).items;
    },actor.id);
    const currentNotices=items.filter(item=>item.relatedType==='exception_work'&&item.relatedId===caseId);
    assert.equal(currentNotices.length,1,'Current assignee and current Super Admin must each see exactly one case notice');
    const notice=currentNotices[0];assert.equal(notice.readAt,null);
    const link=page.locator('a[href="/admin/exceptions"]');
    const article=page.getByRole('article').filter({has:link}).filter({hasText:'Exception follow-up assigned to you'});
    assert.equal(await article.count(),1);
    const [response]=await Promise.all([page.waitForResponse(response=>response.url()===origin+'/api/admin/notifications/'+notice.id+'/read'&&response.request().method()==='POST'),article.getByRole('button',{name:'Mark as read',exact:true}).click()]);
    assert.equal(response.status(),200);
    const [ack]=await exceptionRows(db,'SELECT read_at,status FROM notification_messages WHERE id=? AND recipient_user_id=?',[notice.id,actor.id]);
    assert.equal(ack.status,'read');assert.ok(Number(ack.read_at)>0);
    await article.locator('a[href="/admin/exceptions"]').click();await page.waitForURL(origin+path);
    await page.getByRole('link').filter({hasText:revised}).click();await page.waitForURL(origin+orderPath);
  }
  assert.deepEqual(await parcel(), beforeParcel);
  assert.deepEqual(await cash(), beforeCash);
  assert.deepEqual(await payments(), beforePayments);
  assert.deepEqual(await order(), beforeOrder);
  return {caseId,orderId,jobId,createdRequestId:created.requestId,assignedRequestId:assigned.requestId};
}

async function runSeparateExceptionJourney(input: {
  epoch: OwnedCommerceEpoch; db: Connection; origin: string; signal: AbortSignal;
  accounts: Awaited<ReturnType<typeof prepareCommerceBrowser>>; buyer: Page; seller: Page; staff: Page;
  admin: Actor; ownerPage: Page; owner: Actor; originalOrderId: string;
}) {
  const {epoch,db,origin,signal,accounts,buyer,seller,staff,admin,ownerPage,owner,originalOrderId}=input;
  await epoch.assertOwned(); signal.throwIfAborted();
  const read=(sql:string,args:unknown[]=[])=>exceptionRows(db,sql,args);
  const original=async()=>({
    order:await read('SELECT * FROM orders WHERE id=?',[originalOrderId]),
    items:await read('SELECT * FROM order_items WHERE order_id=? ORDER BY id',[originalOrderId]),
    jobs:await read('SELECT * FROM shipping_jobs WHERE order_id=? ORDER BY id',[originalOrderId]),
    cash:await read('SELECT c.* FROM parcel_cash_records c JOIN shipping_jobs j ON j.id=c.shipping_job_id WHERE j.order_id=? ORDER BY c.id',[originalOrderId]),
    payments:await read('SELECT * FROM payments WHERE order_id=? ORDER BY id',[originalOrderId]),
    refunds:await read('SELECT * FROM refunds WHERE order_id=? ORDER BY id',[originalOrderId]),
    ledger:await read('SELECT e.* FROM seller_ledger_entries e JOIN order_items i ON i.id=e.order_item_id WHERE i.order_id=? ORDER BY e.id',[originalOrderId]),
    payoutPackets:await read('SELECT * FROM payout_transfer_packets WHERE seller_id=? ORDER BY id',[accounts.seller.sellerId]),
  });
  const retained=await original();assert.ok(retained.jobs.length&&retained.jobs.every(job=>job.status==='delivered'));
  const post=async(page:Page,path:string,click:()=>Promise<void>,status=200)=>{
    signal.throwIfAborted(); const [response]=await Promise.all([page.waitForResponse(r=>r.url()===origin+path&&r.request().method()==='POST'),click()]);
    assert.equal(response.status(),status);return response;
  };
  await buyer.goto(origin+'/products/'+accounts.slug);
  await buyer.getByLabel('Size',{exact:true}).selectOption(accounts.variants[0].value);
  await post(buyer,'/api/cart',()=>buyer.getByRole('button',{name:'Add to cart',exact:true}).click());
  await buyer.goto(origin+'/checkout');
  await buyer.getByLabel(/^Recipient name/).fill('Fictional Exception Recipient');
  await buyer.getByLabel(/^Recipient phone/).fill('9811111111');
  await buyer.locator('#province').click();await buyer.getByRole('option',{name:'Bagmati',exact:true}).click();
  await buyer.getByLabel(/^District/).fill('Kathmandu');await buyer.getByLabel(/^Municipality/).fill('Kathmandu');
  await buyer.getByLabel(/^Street, tole or locality/).fill('Fictional Exception Ward');
  await buyer.getByRole('radio',{name:/Cash on delivery/}).check();await buyer.locator('#checkout-terms').check();
  const placed=await(await post(buyer,'/api/checkout',()=>buyer.getByRole('button',{name:'Place COD order',exact:true}).click(),201)).json() as {orderNumber:string};
  await buyer.waitForURL(origin+'/orders/'+placed.orderNumber);await buyer.context().clearCookies({name:'hastabazaar_receipt'});
  const orders=await read('SELECT * FROM orders WHERE order_number=?',[placed.orderNumber]);assert.equal(orders.length,1);
  const orderId=String(orders[0].id);assert.notEqual(orderId,originalOrderId);assert.equal(orders[0].customer_id,accounts.buyer.id);
  const staffPath='/admin/orders/'+orderId,sellerPath='/seller/orders/'+orderId;
  await staff.goto(origin+staffPath);
  if((await read("SELECT status FROM first_cod_reviews WHERE order_id=?",[orderId]))[0]?.status==='pending'){
    const form=staff.locator('form[data-form-id="staff.first-cod-confirmation"]');await form.getByLabel('Confirmation reason').fill('Confirm the separate fictional exception parcel checkout.');
    await post(staff,'/api'+staffPath+'/first-cod-confirmation',()=>form.getByRole('button',{name:'Confirm COD order',exact:true}).click());
  }
  await seller.goto(origin+sellerPath);
  for(const label of ['Start selected preparation','Selected items ready for pickup']){
    const boxes=seller.locator('fieldset input[type="checkbox"]');assert.equal(await boxes.count(),1);await boxes.check();
    await post(seller,'/api'+sellerPath+'/fulfillment',()=>seller.getByRole('button',{name:label,exact:true}).click());
  }
  await staff.goto(origin+staffPath);const parcelPath='/api'+staffPath+'/parcels';
  await post(staff,parcelPath,()=>staff.getByRole('button',{name:'Prepare seller parcels',exact:true}).click());
  const parcels=await read("SELECT j.id,p.cod_due_paisa FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=? AND j.direction='outbound'",[orderId]);assert.equal(parcels.length,1);
  const jobId=String(parcels[0].id),due=Number(parcels[0].cod_due_paisa);assert.ok(due>0);
  for(const [action,state] of [['assign','pickup_requested'],['dispatch','dispatched'],['collect','dispatched'],['fail','delivery_failed']]){
    await staff.reload();const form=staff.locator('form[data-form-id="staff.parcel-control"]');await form.getByLabel('Action',{exact:true}).selectOption(action);
    if(action==='assign'){await form.getByLabel('Delivery method').selectOption('courier');await form.getByLabel('Courier company').fill('Fictional exception courier');await form.getByLabel('Tracking / handover reference').fill('EXCEPTION-'+placed.orderNumber);}
    if(action==='collect'){await form.getByLabel('Amount in NPR').fill((due/100).toFixed(2));await form.getByLabel('Supporting document or reference').fill('EXCEPTION-CASH-'+placed.orderNumber);}
    await form.getByLabel('Operational note').fill('Fictional paid parcel could not be delivered; retain its cash pending authorized aftercare.');
    const response=await post(staff,parcelPath,()=>form.getByRole('button',{name:'Save parcel action'}).click());
    const payload=response.request().postDataJSON() as {requestId:string;jobId:string;version:number};assert.equal(payload.jobId,jobId);
    const [job]=await read('SELECT j.status,p.version FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.id=?',[jobId]);assert.equal(job.status,state);assert.equal(Number(job.version),payload.version+1);
    const events=await read('SELECT actor_id FROM parcel_operation_events WHERE shipping_job_id=? AND id=? AND action=?',[jobId,payload.requestId,action]);assert.equal(events.length,1);assert.equal(events[0].actor_id,admin.id);
  }
  const [actor]=await read('SELECT display_name FROM users WHERE id=?',[admin.id]);
  const result=await runExceptionBrowser({db,origin,signal,ownerPage,adminPage:staff,owner,admin:{...admin,displayName:String(actor.display_name)},orderId,jobId});
  assert.deepEqual(await original(),retained,'Exception lane must preserve delivered original finance order and its retained liabilities');
  await epoch.assertOwned();return result;
}
