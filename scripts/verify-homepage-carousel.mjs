import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const origin = new URL(
  process.env.HOMEPAGE_QA_ORIGIN ?? 'http://localhost:3000',
);
const arguments_ = process.argv.slice(2);
const saveAdminDraft = arguments_.includes('--save-admin-draft');
const outputArgument = arguments_.find(
  (argument) => !argument.startsWith('--'),
);
const outputDirectory = path.resolve(
  outputArgument ??
    process.env.HOMEPAGE_QA_OUTPUT ??
    '.staging/artifacts/homepage-hero-carousel',
);

assert.ok(
  ['localhost', '127.0.0.1'].includes(origin.hostname),
  'Homepage carousel QA is restricted to a local server.',
);

const stagingMarker = JSON.parse(
  await readFile('.staging/staging-environment.json', 'utf8'),
);
assert.equal(stagingMarker.scopeId, 'hastabazaar-v1.2.1-local-staging');
assert.equal(stagingMarker.recordLabel, 'SIMULATED — NOT VALID FOR PRODUCTION');
await mkdir(outputDirectory, { recursive: true });

for (const id of [
  'system-nepal-craft-hero',
  'system-maker-hands-hero',
  'system-meaningful-gifts-hero',
]) {
  const response = await fetch(
    new URL(`/api/homepage/hero-media/${id}`, origin),
    {
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
    },
  );
  assert.equal(
    response.status,
    200,
    `${id} is unavailable. Run the guarded local staging seed before browser QA.`,
  );
  assert.equal(response.headers.get('content-type'), 'image/webp');
}

const results = {
  checkedAt: new Date().toISOString(),
  environment: 'disposable local staging',
  origin: origin.origin,
  screenshots: [],
  checks: [],
  limitations: [
    'No video is published in the three-slide initial fixture; video upload/container checks remain automated and the browser video scenario is documented for Super Admin self-test.',
    'A headless browser cannot prove production storage, scheduler, or delivery-provider behavior.',
  ],
};

function currentSlide(page) {
  return page
    .locator('[aria-label="Choose featured story"] [aria-current="true"]')
    .getAttribute('aria-label');
}

function currentOccasionSlide(page) {
  return page
    .locator('[aria-label="Choose gifting story"] [aria-current="true"]')
    .getAttribute('aria-label');
}

async function expectSlide(page, number) {
  await page
    .locator(`[aria-label="Choose featured story"] button:nth-child(${number})`)
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector(
          '[aria-label="Choose featured story"] [aria-current="true"]',
        )
        ?.getAttribute('aria-label')
        ?.startsWith(`Show slide ${expected}:`) ?? false,
    number,
  );
}

async function expectOccasionSlide(page, number) {
  await page
    .locator(`[aria-label="Choose gifting story"] button:nth-child(${number})`)
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector(
          '[aria-label="Choose gifting story"] [aria-current="true"]',
        )
        ?.getAttribute('aria-label')
        ?.startsWith(`Show slide ${expected}:`) ?? false,
    number,
  );
}

async function leaveCarouselFocus(page) {
  await page.locator('header a').first().focus();
  await page.mouse.move(2, 2);
}

function observe(page) {
  const consoleErrors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
    }
  });
  return { consoleErrors, failedResponses };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [
    { name: 'desktop', width: 1536, height: 960 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin.origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const observed = observe(page);
    await page.goto(origin.origin, { waitUntil: 'networkidle' });
    const carousel = page.locator('.homepage-hero-carousel');
    await carousel.waitFor({ state: 'visible' });
    assert.equal(
      await carousel.locator('[aria-label^="Slide "]').count(),
      3,
      `${viewport.name} must start with exactly three slides`,
    );

    const categoryTop = await page
      .locator('#categories')
      .evaluate((element) => element.getBoundingClientRect().top + scrollY);
    for (let slide = 1; slide <= 3; slide += 1) {
      await page
        .locator(
          `[aria-label="Choose featured story"] button:nth-child(${slide})`,
        )
        .click();
      await expectSlide(page, slide);
      const image = carousel
        .locator(`[aria-label="Slide ${slide} of 3"] img`)
        .first();
      await image.waitFor({ state: 'visible' });
      await page.waitForFunction((selector) => {
        const candidate = document.querySelector(selector);
        return (
          candidate instanceof HTMLImageElement &&
          candidate.complete &&
          candidate.naturalWidth > 0
        );
      }, `[aria-label="Slide ${slide} of 3"] img`);
      await page.waitForTimeout(500);
      const slideScreenshot = path.join(
        outputDirectory,
        `homepage-carousel-${viewport.name}-slide-${slide}.png`,
      );
      await carousel.screenshot({ path: slideScreenshot });
      results.screenshots.push(slideScreenshot);
    }
    assert.equal(
      Math.round(
        await page
          .locator('#categories')
          .evaluate((element) => element.getBoundingClientRect().top + scrollY),
      ),
      Math.round(categoryTop),
      'Changing slides must not shift the category panel',
    );

    await page.getByRole('button', { name: 'Previous featured story' }).click();
    await expectSlide(page, 2);
    await page.getByRole('button', { name: 'Next featured story' }).click();
    await expectSlide(page, 3);
    await page
      .getByRole('button', { name: 'Next featured story' })
      .press('ArrowRight');
    await expectSlide(page, 1);

    const occasion = page.locator('#occasions');
    await occasion.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const section = document.querySelector('#occasions');
      const header = document.querySelector('header');
      if (!section) return;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      window.scrollTo({
        top:
          window.scrollY +
          section.getBoundingClientRect().top -
          headerHeight -
          16,
      });
    });
    await occasion.waitFor({ state: 'visible' });
    assert.equal(
      await occasion.locator('[aria-label^="Slide "]').count(),
      2,
      `${viewport.name} must show exactly two initial occasion slides`,
    );
    assert.equal(
      await occasion.locator('[aria-hidden="true"][inert]').count(),
      1,
      'Exactly one inactive occasion slide must be hidden and inert',
    );
    const occasionHeight = await occasion.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    for (let slide = 1; slide <= 2; slide += 1) {
      await page
        .locator(
          `[aria-label="Choose gifting story"] button:nth-child(${slide})`,
        )
        .click();
      await expectOccasionSlide(page, slide);
      await page.waitForTimeout(600);
      const occasionScreenshot = path.join(
        outputDirectory,
        `homepage-occasion-${viewport.name}-slide-${slide}.png`,
      );
      if (viewport.name === 'mobile') {
        await page
          .locator('header')
          .evaluate((element) => (element.style.position = 'relative'));
      }
      await occasion.screenshot({ path: occasionScreenshot });
      if (viewport.name === 'mobile') {
        await page
          .locator('header')
          .evaluate((element) => element.style.removeProperty('position'));
      }
      results.screenshots.push(occasionScreenshot);
    }
    assert.equal(
      Math.round(
        await occasion.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      ),
      Math.round(occasionHeight),
      'Changing gifting slides must not change the section height',
    );
    await page.getByRole('button', { name: 'Previous gifting story' }).click();
    await expectOccasionSlide(page, 1);
    await page.waitForTimeout(600);
    await page
      .getByRole('button', { name: 'Previous gifting story' })
      .press('ArrowLeft');
    await expectOccasionSlide(page, 2);
    await page.waitForTimeout(600);
    assert.equal(
      (await occasion.getByText('Big moments.', { exact: false }).count()) > 0,
      true,
      'The current gifting section must remain slide 1',
    );
    assert.equal(
      (await occasion.getByText('Made by hand.', { exact: false }).count()) > 0,
      true,
      'The approved human-story content must be slide 2',
    );
    const cardBoxes = await occasion
      .locator('.homepage-occasion-card')
      .evaluateAll((cards) =>
        cards.slice(0, 2).map((card) => {
          const box = card.getBoundingClientRect();
          return { left: Math.round(box.left), top: Math.round(box.top) };
        }),
      );
    if (viewport.name === 'mobile') {
      assert.ok(
        cardBoxes[1].top > cardBoxes[0].top,
        'Mobile occasion cards must stack',
      );
    } else {
      assert.ok(
        Math.abs(cardBoxes[1].top - cardBoxes[0].top) <= 2 &&
          cardBoxes[1].left > cardBoxes[0].left,
        'Desktop occasion cards must remain side by side',
      );
    }

    await page
      .locator('[aria-label="Choose gifting story"] button:nth-child(1)')
      .click();
    await expectOccasionSlide(page, 1);
    const swipeBox = await occasion.boundingBox();
    assert.ok(swipeBox, 'Occasion carousel must have a swipe target');
    await page.mouse.move(
      swipeBox.x + swipeBox.width * 0.75,
      swipeBox.y + swipeBox.height * 0.45,
    );
    await page.mouse.down();
    await page.mouse.move(
      swipeBox.x + swipeBox.width * 0.2,
      swipeBox.y + swipeBox.height * 0.45,
      { steps: 12 },
    );
    await page.mouse.up();
    await expectOccasionSlide(page, 2);
    await page.waitForTimeout(600);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));

    const screenshot = path.join(
      outputDirectory,
      `homepage-carousel-${viewport.name}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: false });
    results.screenshots.push(screenshot);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `${viewport.name} must not overflow horizontally`,
    );
    assert.deepEqual(observed.consoleErrors, []);
    assert.deepEqual(observed.failedResponses, []);
    results.checks.push({
      viewport: viewport.name,
      pageIdentity: (await page.title()).includes('HastaBazaar'),
      slides: 3,
      imagesDecoded: 3,
      controls: 'previous, next, dot selection, keyboard',
      occasionSlides: 2,
      occasionControls: 'previous, next, dots, keyboard, swipe',
      stableOccasionHeight: true,
      noHorizontalOverflow: true,
      noConsoleErrors: true,
    });

    if (viewport.name === 'desktop') {
      await page
        .locator('[aria-label="Choose featured story"] button:nth-child(3)')
        .click();
      await leaveCarouselFocus(page);
      await page.waitForTimeout(6_500);
      await expectSlide(page, 1);

      await carousel.hover();
      const hoverStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(
        await currentSlide(page),
        hoverStart,
        'hover must pause rotation',
      );
      await page.mouse.move(2, 2);

      const nextButton = page.getByRole('button', {
        name: 'Next featured story',
      });
      await nextButton.focus();
      const focusStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(
        await currentSlide(page),
        focusStart,
        'focus must pause rotation',
      );

      const pause = page.getByRole('button', {
        name: 'Pause featured stories',
      });
      await pause.click();
      await leaveCarouselFocus(page);
      const pauseStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(
        await currentSlide(page),
        pauseStart,
        'manual pause must stop rotation',
      );
      await page.getByRole('button', { name: 'Play featured stories' }).click();

      await leaveCarouselFocus(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(
        await currentSlide(page),
        hiddenStart,
        'hidden document must pause rotation',
      );
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      results.checks.push({
        behavior: 'autoplay',
        wrap: 'slide 3 to slide 1',
        pausedBy: ['hover', 'focus', 'manual control', 'document hidden'],
      });

      await page
        .locator('[aria-label="Choose gifting story"] button:nth-child(2)')
        .click();
      await leaveCarouselFocus(page);
      await page.waitForTimeout(7_500);
      await expectOccasionSlide(page, 1);

      await occasion.hover();
      const occasionHoverStart = await currentOccasionSlide(page);
      await page.waitForTimeout(7_500);
      assert.equal(
        await currentOccasionSlide(page),
        occasionHoverStart,
        'occasion hover must pause rotation',
      );
      await page.mouse.move(2, 2);

      const occasionNext = page.getByRole('button', {
        name: 'Next gifting story',
      });
      await occasionNext.focus();
      const occasionFocusStart = await currentOccasionSlide(page);
      await page.waitForTimeout(7_500);
      assert.equal(
        await currentOccasionSlide(page),
        occasionFocusStart,
        'occasion focus must pause rotation',
      );

      await page.getByRole('button', { name: 'Pause gifting stories' }).click();
      await leaveCarouselFocus(page);
      const occasionPauseStart = await currentOccasionSlide(page);
      await page.waitForTimeout(7_500);
      assert.equal(
        await currentOccasionSlide(page),
        occasionPauseStart,
        'occasion manual pause must stop rotation',
      );
      await page.getByRole('button', { name: 'Play gifting stories' }).click();

      await leaveCarouselFocus(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const occasionHiddenStart = await currentOccasionSlide(page);
      await page.waitForTimeout(7_500);
      assert.equal(
        await currentOccasionSlide(page),
        occasionHiddenStart,
        'hidden document must pause occasion rotation',
      );
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      results.checks.push({
        behavior: 'occasion autoplay',
        interval: 'approximately 7 seconds',
        wrap: 'slide 2 to slide 1',
        pausedBy: ['hover', 'focus', 'manual control', 'document hidden'],
      });
    }
    await context.close();
  }

  const reducedContext = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1024, height: 768 },
  });
  await reducedContext.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin
      ? route.continue()
      : route.abort(),
  );
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(origin.origin, { waitUntil: 'networkidle' });
  await leaveCarouselFocus(reducedPage);
  const reducedStart = await currentSlide(reducedPage);
  await reducedPage.waitForTimeout(6_500);
  assert.equal(
    await currentSlide(reducedPage),
    reducedStart,
    'reduced motion must disable automatic rotation',
  );
  const reducedOccasionStart = await currentOccasionSlide(reducedPage);
  await reducedPage.waitForTimeout(7_500);
  assert.equal(
    await currentOccasionSlide(reducedPage),
    reducedOccasionStart,
    'reduced motion must disable occasion rotation',
  );
  results.checks.push({
    behavior: 'reduced motion',
    heroAutoplay: false,
    occasionAutoplay: false,
  });
  await reducedContext.close();

  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await adminContext.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin
      ? route.continue()
      : route.abort(),
  );
  const adminPage = await adminContext.newPage();
  const adminObserved = observe(adminPage);
  await adminPage.goto(new URL('/local-testing', origin).href, {
    waitUntil: 'networkidle',
  });
  await adminPage
    .getByRole('button', { name: 'Open Super Admin interface' })
    .click();
  await adminPage.waitForURL(/\/admin(?:\/)?$/);
  await adminPage.goto(
    new URL('/admin/homepage#occasion-slides', origin).href,
    {
      waitUntil: 'networkidle',
    },
  );
  const occasionEditor = adminPage.locator('#occasion-slides');
  await occasionEditor.waitFor({ state: 'visible' });
  assert.equal(
    await occasionEditor.locator('code').count(),
    2,
    'The Super Admin editor must load both initial occasion slides',
  );
  const existingQaDraft =
    (await occasionEditor.getByText(/Version \d+ · Draft/).count()) > 0;
  await occasionEditor
    .getByRole('button', { name: 'Preview', exact: true })
    .nth(1)
    .click();
  await occasionEditor
    .locator('[aria-label="Choose gifting story"]')
    .waitFor({ state: 'visible' });
  await occasionEditor.getByRole('button', { name: 'Mobile preview' }).click();
  const mobilePreview = occasionEditor.locator(
    '[data-occasion-preview="mobile"]',
  );
  const previewCardBoxes = await mobilePreview
    .locator('.homepage-occasion-card')
    .evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => {
        const box = card.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top) };
      }),
    );
  assert.ok(
    previewCardBoxes[1].top > previewCardBoxes[0].top,
    'Super Admin mobile preview cards must use the actual stacked mobile layout',
  );
  assert.equal(
    await mobilePreview.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
    false,
    'Super Admin mobile preview must not overflow horizontally',
  );
  const supportingNote = occasionEditor.locator(
    '#occasion-human-story-supportingNote',
  );
  assert.equal(
    await supportingNote.inputValue(),
    'Thoughtful gifts, delivered across Nepal.',
  );
  const qaDraftNote =
    'Thoughtful gifts, delivered across Nepal. (Local QA draft)';
  await supportingNote.fill(qaDraftNote);
  await occasionEditor
    .getByRole('button', { name: 'Preview', exact: true })
    .nth(1)
    .click();
  assert.equal(
    (await occasionEditor.getByText(qaDraftNote).count()) > 0,
    true,
    'The private editor must preview changed configuration in the real public layout',
  );
  const adminScreenshot = path.join(
    outputDirectory,
    'homepage-occasion-admin-mobile-preview.png',
  );
  await occasionEditor.screenshot({ path: adminScreenshot });
  results.screenshots.push(adminScreenshot);

  if (saveAdminDraft && !existingQaDraft) {
    await occasionEditor
      .locator('#occasion-change-reason')
      .fill('Local staging browser QA of editable gifting configuration.');
    await occasionEditor
      .getByRole('button', { name: 'Save private draft' })
      .click();
    await adminPage.waitForLoadState('networkidle');
    await adminPage
      .getByText(/Version \d+ · Draft/)
      .first()
      .waitFor();
  }
  const qaDraftRecorded = saveAdminDraft || existingQaDraft;
  if (qaDraftRecorded) {
    const publicPage = await adminContext.newPage();
    await publicPage.goto(origin.origin, { waitUntil: 'networkidle' });
    assert.equal(
      await publicPage.getByText(qaDraftNote).count(),
      0,
      'Editing a private draft must not change the current public homepage',
    );
    assert.equal(
      await publicPage
        .getByText('Thoughtful gifts, delivered across Nepal.', { exact: true })
        .count(),
      1,
      'The effective published/default configuration must remain public',
    );
    await publicPage.close();
  }
  assert.deepEqual(adminObserved.consoleErrors, []);
  assert.deepEqual(adminObserved.failedResponses, []);
  results.checks.push({
    behavior: 'Super Admin configuration',
    actualPublicLayoutPreview: true,
    desktopAndMobilePreview: true,
    privateDraftSaved: qaDraftRecorded,
    publicConfigurationUnchangedByDraft: qaDraftRecorded,
    codeEditOrRedeployRequired: false,
  });
  await adminContext.close();
} finally {
  await browser.close();
}

await writeFile(
  path.join(outputDirectory, 'homepage-carousel-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
