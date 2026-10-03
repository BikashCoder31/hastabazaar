import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('mounted hero keeps manual pause across browsing and respects each temporary pause', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The optional external browser runtime supplies its own types.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const compiled = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'hero-autoplay-fixture.tsx', loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {HomepageHeroCarousel} from './components/homepage/homepage-hero-carousel';
      import {INITIAL_HOMEPAGE_HERO_SLIDES,SELLER_REGISTRATION_HERO_SLIDE} from './lib/homepage/hero-slides';
      const video=new URL(location.href).searchParams.has('video');
      const slides=[{...SELLER_REGISTRATION_HERO_SLIDE,mediaType:video?'video':'image'},
        ...INITIAL_HOMEPAGE_HERO_SLIDES.map(slide=>({...slide,position:slide.position+1}))];
      createRoot(document.getElementById('root')).render(<HomepageHeroCarousel slides={slides}/>);
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'hero-fixture-link', setup(bundler) {
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'hero-fixture' }));
      bundler.onLoad({ filter: /.*/, namespace: 'hero-fixture' }, () => ({
        contents: 'import React from "react";export default function Link(props){return React.createElement("a",props)}', loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- The optional external browser runtime supplies its own types.
    await page.route('https://hero-autoplay.test/**', (route: any) => route.fulfill({
      status: 200, contentType: 'text/html', body: `<style>
        body{margin:0;padding-top:60px}#outside{position:fixed;top:0;height:40px}
        [data-slot=carousel-content]{overflow:hidden}
        [data-slot=carousel-content]>div{display:flex}
        [data-slot=carousel-item]{flex:0 0 100%;min-width:0}
        .homepage-hero-layout{height:300px;overflow:hidden}
        [data-slider-dots]{display:flex}
      </style><button id="outside">Outside the slideshow</button><div id="root"></div>`,
    }));
    await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'));
    const mount = async (suffix = '') => {
      await page.goto('https://hero-autoplay.test/' + suffix);
      await page.addScriptTag({ content: compiled.outputFiles[0].text });
      await page.getByRole('button', { name: 'Pause automatic slide changes' }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('[data-slider-dots] button').length === 4);
    };
    const selected = () => page.locator('[data-slider-dots] [aria-current="true"]').getAttribute('aria-label');
    const leave = async () => {
      await page.locator('#outside').focus();
      await page.mouse.move(10, 10);
    };
    const advance = async () => {
      const before = await selected();
      await page.clock.runFor(5999);
      assert.equal(await selected(), before, 'resuming waits a complete interval');
      await page.clock.runFor(1);
      assert.notEqual(await selected(), before, 'automatic browsing resumes after six seconds');
    };
    await mount();
    const first = await selected();
    await page.clock.runFor(5999);
    assert.equal(await selected(), first);
    await page.clock.runFor(1);
    assert.notEqual(await selected(), first);

    await page.getByRole('button', { name: 'Pause automatic slide changes' }).click();
    await page.getByRole('button', { name: 'Resume automatic slide changes' }).waitFor();
    await leave();
    const manuallyPaused = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), manuallyPaused, 'manual pause survives leaving the carousel');

    await page.locator('[data-slider-dots] button').nth(3).click();
    await leave();
    const chosen = await selected();
    assert.match(String(chosen), /^Show slide 4:/);
    await page.clock.runFor(12000);
    assert.equal(await selected(), chosen, 'choosing another slide does not clear manual pause');
    await page.getByRole('button', { name: 'Resume automatic slide changes' }).click();
    await page.clock.runFor(12000);
    assert.equal(await selected(), chosen, 'resume still respects focus and hover');
    await leave();
    await advance();

    await page.mouse.move(150, 150);
    const hovered = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), hovered, 'hover pauses rotation');
    await leave();
    await advance();

    await page.locator('[data-slider-dots] button').nth(0).focus();
    const focused = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), focused, 'keyboard focus pauses rotation');
    await leave();
    await advance();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), hidden, 'hidden document pauses rotation');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), reduced, 'reduced-motion preference pauses rotation');
    await page.getByRole('button', { name: 'Pause automatic slide changes' }).click();
    await page.getByRole('button', { name: 'Resume automatic slide changes' }).click();
    await leave();
    await page.clock.runFor(12000);
    assert.equal(await selected(), reduced, 'resume cannot override reduced-motion preference');
    await page.locator('[data-slider-dots] button').nth(0).focus();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.runFor(50);
    await leave();
    await advance();

    await mount('?video');
    await page.locator('video').evaluate((video: HTMLVideoElement) =>
      video.dispatchEvent(new Event('play', { bubbles: true })));
    const playing = await selected();
    await page.clock.runFor(18000);
    assert.equal(await selected(), playing, 'playing video pauses rotation');
    await page.locator('video').evaluate((video: HTMLVideoElement) =>
      video.dispatchEvent(new Event('pause', { bubbles: true })));
    await advance();
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await browser.close();
  }
});
