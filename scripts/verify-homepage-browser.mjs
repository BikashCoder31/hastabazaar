import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import mysql from 'mysql2/promise';
import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const workspace = process.cwd();
const build =
  process.env.HOMEPAGE_BUILD ??
  'C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-build-20260914/dist/standalone';
const evidenceRoot =
  process.env.HOMEPAGE_EVIDENCE ??
  'C:/Users/abinash/.codex/visualizations/2026/09/13/01a09bc4-23b3-72a3-9df3-e7022a24133a/homepage-controls-browser-evidence-accepted-v2';
const mediaRoot = path.join(evidenceRoot, 'private-media');
const origin = 'http://127.0.0.1:43876';
const databaseName = `homepage_visual_${Date.now()}`;
if (!/^homepage_visual_\d+$/.test(databaseName))
  throw new Error('Unsafe synthetic database name.');

await mkdir(evidenceRoot, { recursive: true });
const root = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  user: 'root',
  multipleStatements: true,
});
const databasePassword = crypto.randomUUID();
const superSessionToken = randomBytes(32).toString('base64url');
let browser;
let server;

async function migrate(file) {
  let delimiter = ';';
  let buffer = '';
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    if (line.startsWith('DELIMITER ')) {
      delimiter = line.slice(10).trim();
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) await root.query(statement);
    }
  }
  if (buffer.trim()) await root.query(buffer);
}

async function seed() {
  const now = Date.now();
  const users = [
    ['fixture-seller-a', 'seller-a@example.test', 'Asha Fixture'],
    ['fixture-seller-b', 'seller-b@example.test', 'Bikash Fixture'],
    ['fixture-admin', 'admin@example.test', 'Admin Fixture'],
    ['fixture-super', 'super@example.test', 'Super Fixture'],
  ];
  for (const [id, email, displayName] of users)
    await root.execute(
      `INSERT INTO users
       (id,auth_subject,email,display_name,locale,status,created_at,updated_at)
       VALUES (?,?,?,?,'en-NP','active',?,?)`,
      [id, id, email, displayName, now, now],
    );
  for (const [userId, role] of [
    ['fixture-seller-a', 'seller'],
    ['fixture-seller-b', 'seller'],
    ['fixture-admin', 'admin'],
    ['fixture-super', 'super_admin'],
  ])
    await root.execute(
      'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)',
      [userId, role, now],
    );
  await root.execute(
    `INSERT INTO user_sessions
     (token_hash,user_id,expires_at,created_at,last_seen_at)
     VALUES (?,'fixture-super',?,?,?)`,
    [
      createHash('sha256').update(superSessionToken).digest('hex'),
      now + 3_600_000,
      now,
      now,
    ],
  );

  for (const [id, userId, tradingName, suffix] of [
    ['fixture-shop-a', 'fixture-seller-a', 'Patan Clay Studio', 'A'],
    ['fixture-shop-b', 'fixture-seller-b', 'Janakpur Loom House', 'B'],
  ])
    await root.execute(
      `INSERT INTO seller_profiles
       (id,user_id,legal_name,trading_name,registration_authority,
        registration_number,tax_mode,tax_registration_number,representative_name,
        support_phone,support_email,province,district,municipality,locality,
        status,approved_at,created_at,updated_at)
       VALUES (?,?,?,?,'Synthetic fixture',?,'PAN',?,'Fixture owner',
        '9800000000',?,'Bagmati','Kathmandu','Kathmandu','Local-only fixture',
        'approved',?,?,?)`,
      [
        id,
        userId,
        `Synthetic Seller ${suffix}`,
        tradingName,
        `FIXTURE-REG-${suffix}`,
        `FIXTURE-PAN-${suffix}`,
        `seller-${suffix.toLowerCase()}@example.test`,
        now,
        now,
        now,
      ],
    );

  const categories = [
    ['fixture-pottery', 'pottery', 'Pottery'],
    ['fixture-home', 'home-decor', 'Home decor'],
    ['fixture-jewellery', 'jewelry-accessories', 'Jewellery & accessories'],
    ['fixture-textile', 'traditional-textiles', 'Traditional textiles'],
  ];
  const categoryIds = new Map();
  for (const [id, slug, name] of categories) {
    await root.execute(
      `INSERT IGNORE INTO categories
       (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
       VALUES (?,?,?,NULL,1,10,?,?)`,
      [id, slug, name, now, now],
    );
    const [[category]] = await root.execute(
      'SELECT id FROM categories WHERE slug=? LIMIT 1',
      [slug],
    );
    assert.ok(category?.id);
    categoryIds.set(slug, category.id);
  }
  const occasions = [
    ['birthday-gifts', 'Birthday gifts'],
    ['wedding-gifts', 'Wedding gifts'],
    ['dashain-gifts', 'Dashain gifts'],
    ['tihar-gifts', 'Tihar gifts'],
    ['anniversary', 'Anniversary'],
    ['housewarming', 'Housewarming'],
  ];
  for (const [index, [slug, name]] of occasions.entries())
    await root.execute(
      `INSERT IGNORE INTO occasions
       (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
       VALUES (?,?,?,NULL,1,?,?,?)`,
      [`fixture-occasion-${index}`, slug, name, index, now, now],
    );

  const products = [
    [
      'terracotta-cup',
      'Hand-thrown Terracotta Tea Cup',
      'fixture-shop-a',
      'pottery',
      85000,
      100000,
    ],
    [
      'bamboo-basket',
      'Handwoven Bamboo Storage Basket',
      'fixture-shop-a',
      'home-decor',
      145000,
      null,
    ],
    [
      'brass-earrings',
      'Brass and Red Bead Earrings',
      'fixture-shop-b',
      'jewelry-accessories',
      125000,
      150000,
    ],
    [
      'indigo-cushion',
      'Indigo Embroidered Cushion Cover',
      'fixture-shop-b',
      'traditional-textiles',
      175000,
      null,
    ],
    [
      'macrame-crossbody',
      'Natural Macrame Crossbody Bag',
      'fixture-shop-a',
      'home-decor',
      99900,
      120000,
    ],
    [
      'embroidered-clutch',
      'Mirror-work Embroidered Clutch',
      'fixture-shop-b',
      'traditional-textiles',
      79900,
      null,
    ],
    [
      'macrame-shelf',
      'Macrame Hanging Display Shelf',
      'fixture-shop-a',
      'home-decor',
      129900,
      null,
    ],
    [
      'straw-tote',
      'Handwoven Natural Straw Tote',
      'fixture-shop-b',
      'home-decor',
      249900,
      279900,
    ],
  ];
  for (const [index, product] of products.entries()) {
    const [
      slug,
      name,
      sellerId,
      categorySlug,
      pricePaisa,
      compareAtPricePaisa,
    ] = product;
    const categoryId = categoryIds.get(categorySlug);
    assert.ok(categoryId);
    const productId = `fixture-product-${index}`;
    const objectKey = `homepage/${slug}.jpg`;
    const imagePath = path.join(mediaRoot, objectKey);
    const image = await stat(imagePath);
    await writeFile(
      imagePath + '.metadata.json',
      JSON.stringify({
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { fixture: 'homepage-visual-only' },
        size: image.size,
        uploaded: new Date(now).toISOString(),
      }),
      'utf8',
    );
    await root.execute(
      `INSERT INTO products
       (id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,
        compare_at_price_paisa,inventory_quantity,producer,country_of_origin,
        materials,return_eligible,status,published_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'Synthetic product used only for local homepage visual testing.',
        ?,?,20,?,'NP','Local craft materials',1,'published',?,?,?)`,
      [
        productId,
        sellerId,
        categoryId,
        `fixture-${slug}`,
        `FIXTURE-${String(index + 1).padStart(3, '0')}`,
        name,
        pricePaisa,
        compareAtPricePaisa,
        sellerId === 'fixture-shop-a'
          ? 'Patan Clay Studio'
          : 'Janakpur Loom House',
        now - index * 60_000,
        now,
        now,
      ],
    );
    await root.execute(
      `INSERT INTO product_media
       (id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,
        sort_order,width,height,created_at)
       VALUES (?,?,?,?,?,?,?,?,720,900,?)`,
      [
        `fixture-media-${index}`,
        productId,
        objectKey,
        `${slug}.jpg`,
        'image/jpeg',
        image.size,
        name,
        0,
        now,
      ],
    );
  }

  for (const [id, name, offset] of [
    ['fixture-offer-one', 'Crafted home favourites', 0],
    ['fixture-offer-two', 'Gifts under NPR 1,500', 1],
  ])
    await root.execute(
      `INSERT INTO promotions
       (id,name_en,name_ne,status,placement,starts_at,ends_at,created_by,
        approved_by,note,created_request_id,operation_request_id,created_at,updated_at)
       VALUES (?,?,?,'active','homepage',?,?,?,?,
        'Synthetic browser fixture only.',?,?,?,?)`,
      [
        id,
        name,
        name,
        now - 86_400_000,
        now + (7 + offset) * 86_400_000,
        'fixture-admin',
        'fixture-super',
        `${id}-create`,
        `${id}-approve`,
        now - offset * 1000,
        now,
      ],
    );
  for (const [promotionId, productIndex, sortOrder] of [
    ['fixture-offer-one', 0, 0],
    ['fixture-offer-one', 2, 1],
    ['fixture-offer-one', 3, 2],
    ['fixture-offer-two', 0, 0],
    ['fixture-offer-two', 4, 1],
    ['fixture-offer-two', 5, 2],
  ])
    await root.execute(
      'INSERT INTO promotion_products(promotion_id,product_id,sort_order) VALUES (?,?,?)',
      [promotionId, `fixture-product-${productIndex}`, sortOrder],
    );

  for (const [rank, productIndex, quantity] of [
    [1, 4, 6],
    [2, 0, 5],
    [3, 2, 4],
    [4, 3, 3],
    [5, 1, 2],
  ]) {
    const orderId = `fixture-order-${rank}`;
    const sellerId =
      productIndex % 2 === 0 ? 'fixture-shop-a' : 'fixture-shop-b';
    await root.execute(
      `INSERT INTO orders
       (id,order_number,customer_email,customer_phone,status,locale,currency,
        policy_version,shipping_address_json,item_subtotal_paisa,
        seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,
        tax_total_paisa,grand_total_paisa,wallet_credit_paisa,
        referral_discount_paisa,payment_mode,payment_status,placed_at,
        delivered_at,created_at,updated_at)
       VALUES (?,?,?,'9800000000','delivered','en-NP','NPR','fixture-v1',
        '{"province":"Bagmati","district":"Kathmandu"}',100000,0,15000,0,0,
        115000,0,0,'cod','paid',?,?,?,?)`,
      [
        orderId,
        `FIXTURE-${rank}`,
        `buyer-${rank}@example.test`,
        now - 3_600_000,
        now - 1_800_000,
        now - 3_600_000,
        now - 1_800_000,
      ],
    );
    const productId = `fixture-product-${productIndex}`;
    const [[productSnapshot]] = await root.execute(
      `SELECT products.name_en AS name,products.sku,products.price_paisa AS pricePaisa,
        seller_profiles.trading_name AS sellerName
       FROM products
       INNER JOIN seller_profiles ON seller_profiles.id=products.seller_id
       WHERE products.id=?`,
      [productId],
    );
    assert.ok(productSnapshot);
    const lineTotal = Number(productSnapshot.pricePaisa) * quantity;
    await root.execute(
      `INSERT INTO order_items
       (id,order_id,product_id,seller_id,seller_name_snapshot,
        product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,
        seller_discount_paisa,commission_bps,commission_paisa,tax_paisa,
        line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,1000,?,0,?,1,'delivered',?)`,
      [
        `fixture-order-item-${rank}`,
        orderId,
        productId,
        sellerId,
        productSnapshot.sellerName,
        productSnapshot.name,
        productSnapshot.sku,
        productSnapshot.pricePaisa,
        quantity,
        Math.floor(lineTotal / 10),
        lineTotal,
        now - 3_600_000,
      ],
    );
  }
}

const evidence = {
  localOnly: true,
  syntheticDatabase: true,
  providerNetworkBlocked: true,
  checks: [],
  screenshots: [],
};

try {
  await root.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
    databaseName,
    '127.0.0.1',
    databasePassword,
  ]);
  await root.query(`GRANT ALL ON \`${databaseName}\`.* TO ?@?`, [
    databaseName,
    '127.0.0.1',
  ]);
  await root.query(`USE \`${databaseName}\``);

  const manifest = JSON.parse(
    await readFile(
      path.join(workspace, 'deployment/babal/release-manifest.json'),
      'utf8',
    ),
  );
  for (const migration of manifest.migrations)
    await migrate(path.join(workspace, migration.path));
  await seed();

  const networkGuard = path.join(evidenceRoot, 'block-provider-network.cjs');
  await writeFile(
    networkGuard,
    "const net=require('node:net'),tls=require('node:tls');const original=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const values=Array.isArray(args[0])?args[0]:args;const first=values[0];const options=typeof first==='object'?first:{port:first,host:typeof values[1]==='string'?values[1]:'localhost'};if(!['127.0.0.1','localhost','::1'].includes(options.host??'localhost')||Number(options.port)!==13316)throw new Error('Outbound network blocked by synthetic homepage verification');return original.apply(this,args);};tls.connect=()=>{throw new Error('Provider TLS blocked by synthetic homepage verification');};",
    'utf8',
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /SMTP|EMAIL|GOOGLE|SUPER_ADMIN|STAGING|DB_|ORDER_EMAIL|APP_ORIGIN|TRUSTED_CLIENT|TOKEN|SECRET|API_KEY|PROVIDER|NODE_OPTIONS/i.test(
        key,
      )
    )
      delete env[key];
  Object.assign(env, {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '43876',
    APP_ORIGIN: origin,
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: databaseName,
    DB_USER: databaseName,
    DB_PASSWORD: databasePassword,
    MEDIA_ROOT: mediaRoot,
    EMAIL_DELIVERY_CONFIGURED: 'false',
  });
  server = spawn(process.execPath, ['--require', networkGuard, 'app.cjs'], {
    cwd: build,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  let serverErrors = '';
  server.stdout.on('data', (value) => {
    serverOutput += String(value);
  });
  server.stderr.on('data', (value) => {
    serverErrors += String(value);
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(origin + '/health')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal((await fetch(origin + '/health')).status, 200);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const pageErrors = [];
    const failedResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400)
        failedResponses.push({
          status: response.status(),
          path: new URL(response.url()).pathname,
        });
    });
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    await page
      .getByRole('heading', { name: 'Just added by our sellers.' })
      .waitFor();
    await page
      .getByRole('heading', { name: 'Top products right now.' })
      .waitFor();
    await page.getByText('Crafted home favourites', { exact: true }).waitFor();
    await page.evaluate(async () => {
      const delay = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds));
      for (
        let offset = 0;
        offset < document.documentElement.scrollHeight;
        offset += Math.max(320, window.innerHeight * 0.7)
      ) {
        window.scrollTo(0, offset);
        await delay(120);
      }
      window.scrollTo(0, 0);
      await delay(200);
    });
    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {}
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `${viewport.name} homepage must not overflow horizontally`,
    );
    const productImageState = await page
      .locator('img[src*="/api/product-media/"]')
      .evaluateAll((images) =>
        images.map((image) => ({
          src: image.getAttribute('src'),
          currentSrc: image.currentSrc,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          horizontallyVisible:
            image.getBoundingClientRect().right > 0 &&
            image.getBoundingClientRect().left < window.innerWidth,
        })),
      );
    if (
      productImageState.length === 0 ||
      productImageState
        .filter((image) => image.horizontallyVisible)
        .some((image) => !image.complete || image.naturalWidth < 1)
    )
      throw new Error(
        `${viewport.name} product images did not load: ${JSON.stringify({
          productImageState,
          failedResponses,
          pageErrors,
        })}`,
      );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedResponses, []);

    const slider = page.getByLabel('Top products', { exact: true });
    const next = page.getByRole('button', {
      name: 'Show next Top products',
      exact: true,
    });
    const before = await slider.evaluate((element) => element.scrollLeft);
    await next.click();
    await page.waitForTimeout(450);
    const after = await slider.evaluate((element) => element.scrollLeft);
    assert.ok(after > before, 'Top products control must advance the slider');
    await slider.evaluate((element) =>
      element.scrollTo({ left: 0, behavior: 'instant' }),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);

    const full = path.join(evidenceRoot, `homepage-${viewport.name}-full.png`);
    const visible = path.join(
      evidenceRoot,
      `homepage-${viewport.name}-viewport.png`,
    );
    await page.screenshot({ path: full, fullPage: true });
    await page.screenshot({ path: visible });
    evidence.screenshots.push(full, visible);
    evidence.checks.push({
      viewport,
      noHorizontalOverflow: true,
      imagesLoaded: true,
      sliderAdvanced: true,
      productLinks: await page.locator('a[href^="/products/"]').count(),
    });
    await context.close();
  }

  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await adminContext.addCookies([
    {
      name: 'hastabazaar_session',
      value: superSessionToken,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await adminContext.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const adminPage = await adminContext.newPage();
  const adminPageErrors = [];
  const adminConsoleErrors = [];
  const adminFailedResponses = [];
  adminPage.on('pageerror', (error) => adminPageErrors.push(error.message));
  adminPage.on('console', (message) => {
    if (message.type() === 'error') adminConsoleErrors.push(message.text());
  });
  adminPage.on('response', (response) => {
    if (response.status() >= 400)
      adminFailedResponses.push({
        status: response.status(),
        path: new URL(response.url()).pathname,
      });
  });
  await adminPage.goto(origin + '/admin/homepage', {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(adminPage.url()).pathname, '/admin/homepage');
  await adminPage.getByRole('heading', { name: 'Homepage products' }).waitFor();
  await adminPage.getByText('8 published products found').waitFor();
  await adminPage.evaluate(async () => {
    const delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));
    for (
      let offset = 0;
      offset < document.documentElement.scrollHeight;
      offset += Math.max(320, window.innerHeight * 0.7)
    ) {
      window.scrollTo(0, offset);
      await delay(100);
    }
    window.scrollTo(0, 0);
    await delay(200);
  });
  assert.equal(
    await adminPage
      .locator('img[src*="/api/product-media/"]')
      .evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
    true,
    'desktop homepage-control product images must load',
  );
  assert.equal(
    await adminPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    'desktop homepage controls must not overflow horizontally',
  );
  const adminInitial = path.join(
    evidenceRoot,
    'homepage-controls-desktop-initial.png',
  );
  await adminPage.screenshot({ path: adminInitial, fullPage: true });

  await adminPage
    .getByRole('button', { name: 'Hide from homepage', exact: true })
    .first()
    .click();
  const dialog = adminPage.getByRole('alertdialog');
  await dialog
    .getByRole('heading', { name: /Hide Hand-thrown Terracotta Tea Cup/ })
    .waitFor();
  await dialog
    .getByLabel('Decision reason')
    .fill('Local browser test of Super Admin homepage control.');
  const adminDialog = path.join(
    evidenceRoot,
    'homepage-controls-desktop-confirmation.png',
  );
  await adminPage.screenshot({ path: adminDialog });
  await dialog
    .getByRole('button', { name: 'Hide from homepage', exact: true })
    .click();
  await adminPage
    .getByRole('button', { name: 'Show on homepage', exact: true })
    .first()
    .waitFor();
  const [[hiddenState]] = await root.execute(
    `SELECT products.status, homepage_product_controls.is_hidden AS hidden,
      homepage_product_controls.version
     FROM products
     INNER JOIN homepage_product_controls
       ON homepage_product_controls.product_id = products.id
     WHERE products.id='fixture-product-0'`,
  );
  assert.deepEqual(
    {
      status: hiddenState.status,
      hidden: Number(hiddenState.hidden),
      version: Number(hiddenState.version),
    },
    { status: 'published', hidden: 1, version: 1 },
  );
  const adminHidden = path.join(
    evidenceRoot,
    'homepage-controls-desktop-hidden.png',
  );
  await adminPage.screenshot({ path: adminHidden, fullPage: true });

  await adminPage.goto(origin + '/', { waitUntil: 'networkidle' });
  assert.equal(
    await adminPage
      .locator('a[href="/products/fixture-terracotta-cup"]')
      .count(),
    0,
    'hidden product must leave every homepage collection',
  );
  await adminPage.goto(origin + '/shop', { waitUntil: 'networkidle' });
  const shopState = {
    url: adminPage.url(),
    title: await adminPage.title(),
    headings: await adminPage.getByRole('heading').allTextContents(),
    productHrefs: await adminPage
      .locator('a[href^="/products/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    failedResponses: [...adminFailedResponses],
    pageErrors: [...adminPageErrors],
    consoleErrors: [...adminConsoleErrors],
    serverErrors,
    serverOutput,
  };
  assert.ok(
    (await adminPage
      .locator('a[href="/products/fixture-terracotta-cup"]')
      .count()) > 0,
    `homepage-hidden product must remain available in the public shop: ${JSON.stringify(shopState)}`,
  );
  await adminPage.goto(origin + '/admin/homepage?visibility=hidden', {
    waitUntil: 'networkidle',
  });
  await adminPage.getByText('1 published product found').waitFor();
  await adminPage
    .getByRole('button', { name: 'Show on homepage', exact: true })
    .click();
  const restoreDialog = adminPage.getByRole('alertdialog');
  await restoreDialog
    .getByLabel('Decision reason')
    .fill('Restore after local Super Admin browser verification.');
  await restoreDialog
    .getByRole('button', { name: 'Show on homepage', exact: true })
    .click();
  await adminPage.getByText('No matching published products').waitFor();
  const [[restoredState]] = await root.execute(
    `SELECT products.status, homepage_product_controls.is_hidden AS hidden,
      homepage_product_controls.version
     FROM products
     INNER JOIN homepage_product_controls
       ON homepage_product_controls.product_id = products.id
     WHERE products.id='fixture-product-0'`,
  );
  assert.deepEqual(
    {
      status: restoredState.status,
      hidden: Number(restoredState.hidden),
      version: Number(restoredState.version),
    },
    { status: 'published', hidden: 0, version: 2 },
  );
  await adminPage.goto(origin + '/', { waitUntil: 'networkidle' });
  assert.ok(
    (await adminPage
      .locator('a[href="/products/fixture-terracotta-cup"]')
      .count()) > 0,
    'restored product must become homepage-eligible again',
  );
  assert.deepEqual(adminPageErrors, []);
  assert.deepEqual(adminConsoleErrors, []);
  assert.deepEqual(adminFailedResponses, []);
  evidence.screenshots.push(adminInitial, adminDialog, adminHidden);
  evidence.checks.push({
    viewport: { name: 'admin-desktop', width: 1440, height: 1000 },
    pageIdentity: true,
    noHorizontalOverflow: true,
    noFrameworkOverlay: true,
    consoleErrors: 0,
    interaction:
      'hide, verify published, remove from homepage, keep in shop, restore',
  });
  await adminContext.close();

  const mobileAdminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await mobileAdminContext.addCookies([
    {
      name: 'hastabazaar_session',
      value: superSessionToken,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await mobileAdminContext.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const mobileAdminPage = await mobileAdminContext.newPage();
  const mobileErrors = [];
  const mobileConsoleErrors = [];
  const mobileFailedResponses = [];
  mobileAdminPage.on('pageerror', (error) => mobileErrors.push(error.message));
  mobileAdminPage.on('console', (message) => {
    if (message.type() === 'error') mobileConsoleErrors.push(message.text());
  });
  mobileAdminPage.on('response', (response) => {
    if (response.status() >= 400)
      mobileFailedResponses.push({
        status: response.status(),
        path: new URL(response.url()).pathname,
      });
  });
  await mobileAdminPage.goto(origin + '/admin/homepage', {
    waitUntil: 'networkidle',
  });
  await mobileAdminPage
    .getByRole('heading', { name: 'Homepage products' })
    .waitFor();
  await mobileAdminPage.evaluate(async () => {
    const delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));
    for (
      let offset = 0;
      offset < document.documentElement.scrollHeight;
      offset += Math.max(320, window.innerHeight * 0.7)
    ) {
      window.scrollTo(0, offset);
      await delay(100);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await delay(400);
    window.scrollTo(0, 0);
    await delay(200);
  });
  const mobileAdminImages = await mobileAdminPage
    .locator('img[src*="/api/product-media/"]')
    .evaluateAll((images) =>
      images.map((image) => ({
        src: image.getAttribute('src'),
        loading: image.getAttribute('loading'),
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        top: Math.round(image.getBoundingClientRect().top),
        bottom: Math.round(image.getBoundingClientRect().bottom),
      })),
    );
  assert.ok(
    mobileAdminImages.length > 0 &&
      mobileAdminImages.every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    `mobile homepage-control product images must load: ${JSON.stringify({ mobileAdminImages, mobileFailedResponses, mobileErrors, mobileConsoleErrors })}`,
  );
  assert.equal(
    await mobileAdminPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    'mobile homepage controls must not overflow horizontally',
  );
  assert.deepEqual(mobileErrors, []);
  assert.deepEqual(mobileConsoleErrors, []);
  assert.deepEqual(mobileFailedResponses, []);
  const adminMobile = path.join(evidenceRoot, 'homepage-controls-mobile.png');
  await mobileAdminPage.screenshot({ path: adminMobile, fullPage: true });
  evidence.screenshots.push(adminMobile);
  evidence.checks.push({
    viewport: { name: 'admin-mobile', width: 390, height: 844 },
    pageIdentity: true,
    noHorizontalOverflow: true,
    noFrameworkOverlay: true,
    consoleErrors: 0,
  });
  await mobileAdminContext.close();
  await writeFile(
    path.join(evidenceRoot, 'homepage-browser.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );
  await rm(path.join(evidenceRoot, 'homepage-browser-failure.txt'), {
    force: true,
  });
  console.log('PASS isolated homepage browser visuals');
} catch (error) {
  await writeFile(
    path.join(evidenceRoot, 'homepage-browser-failure.txt'),
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    'utf8',
  );
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  await root.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  await root.query('DROP USER IF EXISTS ?@?', [databaseName, '127.0.0.1']);
  await root.end();
}
