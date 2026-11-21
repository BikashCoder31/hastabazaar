import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

let fixtureBundle: Promise<string> | undefined;
async function mounted(kind:'hero'|'occasion'='hero') {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The optional external browser runtime supplies its own types.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  fixtureBundle ??= build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'hero-autoplay-fixture.tsx', loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {HomepageHeroCarousel} from './components/homepage/homepage-hero-carousel';
      import {HomepageOccasionCarousel} from './components/homepage/homepage-occasion-carousel';
      import {INITIAL_HOMEPAGE_OCCASION_SLIDES} from './lib/homepage/occasion-slides';
      import {INITIAL_HOMEPAGE_HERO_SLIDES,SELLER_REGISTRATION_HERO_SLIDE} from './lib/homepage/hero-slides';
      const video=new URL(location.href).searchParams.has('video');
      const slides=[{...SELLER_REGISTRATION_HERO_SLIDE,mediaType:video?'video':'image'},
        ...INITIAL_HOMEPAGE_HERO_SLIDES.map(slide=>({...slide,position:slide.position+1}))];
      const occasionSlides=Array.from({length:4},(_,index)=>({...INITIAL_HOMEPAGE_OCCASION_SLIDES[0],id:'fixture-occasion-'+index,position:index+1,headingLead:'Gifting story '+(index+1)}));
      createRoot(document.getElementById('root')).render(new URL(location.href).searchParams.has('occasion')?<HomepageOccasionCarousel slides={occasionSlides}/>:<HomepageHeroCarousel slides={slides}/>);
    ` },
    bundle: true, write: false, loader: { '.module.css': 'empty' }, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'hero-fixture-link', setup(bundler) {
      bundler.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: 'hero-fixture' }));
      bundler.onLoad({ filter: /.*/, namespace: 'hero-fixture' }, args => ({
        contents: args.path==='next/image'?'import React from "react";export default function Image({fill,...props}){return React.createElement("img",props)}':'import React from "react";export default function Link(props){return React.createElement("a",props)}', loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  }).then(result=>result.outputFiles[0].text);
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch:true });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  // oxlint-disable-next-line typescript/no-explicit-any -- The optional external browser runtime supplies its own types.
  await page.route('https://hero-autoplay.test/**', (route: any) => route.fulfill({
    status: 200, contentType: 'text/html', body: `<style>
      body{margin:0;padding-top:60px}#outside{position:fixed;top:0;height:40px}
      [data-slot=carousel-content]{overflow:hidden}
      [data-slot=carousel-content]>div{display:flex;touch-action:pan-y pinch-zoom}
      [data-slot=carousel-item]{flex:0 0 100%;min-width:0}
      [data-slot=carousel-item]{height:300px;overflow:hidden}
      [data-slider-dots]{display:flex}
    </style><button id="outside">Outside the slideshow</button><div id="root"></div>`,
  }));
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  const mount = async (suffix = '') => {
    const query=new URLSearchParams(suffix.replace(/^\?/,''));
    if(kind==='occasion')query.set('occasion','1');
    await page.goto('https://hero-autoplay.test/?'+query);
    // Observe delivered media changes and real six-second timers without advancing the frozen clock.
    await page.addScriptTag({content:`(() => {
      const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
      const timing={motion:preference.matches,timers:new Map()};
      window.__storyAutoplayTiming=timing;
      preference.addEventListener('change',()=>{timing.motion=preference.matches;});
      const schedule=window.setTimeout.bind(window);
      const cancel=window.clearTimeout.bind(window);
      window.setTimeout=(handler,delay,...args)=>{
        if(delay!==${kind === 'hero' ? 6_500 : 6_000}||typeof handler!=='function')return schedule(handler,delay,...args);
        const id=schedule(()=>{timing.timers.delete(id);handler.apply(window,args);},delay);
        timing.timers.set(id,Date.now());return id;
      };
      window.clearTimeout=id=>{timing.timers.delete(id);cancel(id);};
    })()`});

    await page.addScriptTag({ content: await fixtureBundle! });
    await page.waitForFunction(() => document.querySelectorAll('[data-slider-dots] button').length === 4);
  };
  const selected = () => page.locator('[data-slider-dots] [aria-current="true"]').getAttribute('aria-label');
  const waitForMotion = async (reducedMotion:boolean,rotating:boolean) => {
    const frozenAt=await page.evaluate(()=>Date.now());
    const deadline=Date.now()+5_000;
    while(Date.now()<deadline){
      const ready=await page.evaluate(({reducedMotion,rotating,frozenAt}:{reducedMotion:boolean;rotating:boolean;frozenAt:number})=>{
        const timing=(window as unknown as {__storyAutoplayTiming:{motion:boolean;timers:Map<number,number>}}).__storyAutoplayTiming;
        return timing.motion===reducedMotion&&(rotating
          ? Array.from(timing.timers.values()).includes(frozenAt)
          : timing.timers.size===0);
      },{reducedMotion,rotating,frozenAt});
      assert.equal(await page.evaluate(()=>Date.now()),frozenAt,'motion synchronization must not advance the fake clock');
      if(ready)return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.fail('motion preference must be delivered and autoplay must '+(rotating?'re-arm':'pause')+' at the frozen clock timestamp');
  };

  const boundary = async (milliseconds:number) => {
    const before = await selected();
    await page.clock.runFor(milliseconds-1);
    assert.equal(await selected(),before,'the selected story must remain until the full delay');
    await page.clock.runFor(1);
    assert.notEqual(await selected(),before,'automatic browsing resumes at the exact boundary');
  };
  await mount();
  return {page,mount,selected,boundary,waitForMotion,close:async()=>{
    await page.close();await browser.close();assert.deepEqual(errors,[]);
  }};
}

for(const kind of ['hero','occasion'] as const){
const interval = kind === 'hero' ? 6_500 : 6_000;
void test(`${kind} renders its story controls and rotates at each configured boundary`, async () => {
  const h=await mounted(kind);
  try {
    assert.equal(await h.page.getByRole('button',{name:'Pause featured stories'}).count(),kind==='hero'?1:0);
    assert.equal(await h.page.locator('[data-slider-dots] button').count(),4);
    await h.boundary(interval);
    await h.boundary(interval);
    assert.equal(await h.page.locator('[aria-live="polite"]').textContent(),'','automatic rotation stays silent');
  } finally {await h.close();}
});

void test(`a manual ${kind} story selection grants twelve seconds before automatic browsing resumes`, async () => {
  const h=await mounted(kind);
  try {
    await h.page.clock.runFor(5_000);
    await h.page.locator('[data-slider-dots] button').nth(3).click();
    assert.match(String(await h.selected()),/^Show slide 4:/);
    await h.page.locator('#outside').focus();
    await h.page.mouse.move(10,10);
    await h.boundary(12_000);
    await h.boundary(interval);
  } finally {await h.close();}
});

void test(`mouse and touch focus cannot permanently freeze ${kind} rotation after the manual hold`, async () => {
  const h=await mounted(kind);
  try {
    await h.page.locator('[data-slider-dots] button').nth(3).click();
    await h.page.mouse.move(10,10);
    assert.equal(await h.page.locator('[data-slider-dots] button').nth(3).evaluate((button:HTMLElement)=>button===document.activeElement),true);
    await h.boundary(12_000);
    await h.boundary(interval);
    const box=await h.page.locator('[data-slider-dots] button').nth(2).boundingBox();
    assert.ok(box);
    await h.page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    assert.match(String(await h.selected()),/^Show slide 3:/);
    await h.boundary(12_000);
    await h.boundary(interval);
  } finally {await h.close();}
});

void test(`${kind} keeps hover, keyboard focus, hidden-page and motion safeguards`, async () => {
  const h=await mounted(kind);
  try {
    await h.page.mouse.move(150,150);
    const hovered=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),hovered,'hover pauses rotation');
    await h.page.mouse.move(10,10);
    await h.boundary(interval);

    await h.page.clock.runFor(1_000);
    await h.page.locator('[data-slot=carousel-item]:not([inert])').click({position:{x:5,y:5}});
    await h.page.mouse.move(10,10);
    await h.page.locator('#outside').focus();
    await h.page.keyboard.press('Tab');
    assert.equal(await h.page.locator('section').evaluate((section:HTMLElement)=>section.contains(document.activeElement)),true);
    const tabbed=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),tabbed,'Tab entry after a non-focusable pointer click must pause');
    await h.page.locator('#outside').focus();
    await h.boundary(interval);

    await h.page.locator('[data-slider-dots] button').nth(0).focus();
    const focused=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),focused,'keyboard focus pauses until blur');
    await h.page.locator('[data-slider-dots] button').nth(0).press('ArrowRight');
    const keyboardSelection=await h.selected();
    assert.match(String(keyboardSelection),/^Show slide 2:/);
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),keyboardSelection,'keyboard navigation keeps the focus safeguard');
    await h.page.locator('[data-slider-dots] button').nth(1).press('Enter');
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),keyboardSelection,'keyboard-created clicks must keep the focus safeguard');
    await h.page.locator('#outside').focus();
    await h.boundary(interval);

    await h.page.evaluate(()=>{
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),hidden,'hidden pages do not rotate');
    await h.page.evaluate(()=>{
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await h.boundary(interval);

    await h.page.emulateMedia({reducedMotion:'reduce'});
    await h.waitForMotion(true,false);
    const reduced=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),reduced,'reduced motion pauses rotation');
    await h.page.locator('[data-slider-dots] button').nth(0).focus();
    await h.page.emulateMedia({reducedMotion:'no-preference'});
    await h.page.locator('#outside').focus();
    await h.waitForMotion(false,true);
    await h.boundary(interval);

    if(kind==='hero'){
    await h.mount('?video');
    await h.page.locator('video').evaluate((video:HTMLVideoElement)=>video.dispatchEvent(new Event('play',{bubbles:true})));
    const playing=await h.selected();
    await h.page.clock.runFor(18_000);
    assert.equal(await h.selected(),playing,'playing video pauses rotation');
    await h.page.locator('video').evaluate((video:HTMLVideoElement)=>video.dispatchEvent(new Event('pause',{bubbles:true})));
    await h.boundary(interval);
    }
  } finally {await h.close();}
});

void test(`a long ${kind} drag grants twelve seconds from release before automatic browsing resumes`, async () => {
  const h=await mounted(kind);
  try {
    const before=await h.selected();
    const touch=await h.page.context().newCDPSession(h.page);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:200}]});
    await h.page.clock.runFor(7_000);
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:70,y:200}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
    assert.notEqual(await h.selected(),before,'a real drag must choose another story');
    await h.boundary(12_000);
    await h.boundary(interval);
    await h.page.clock.runFor(1_000);
    const beforeMouse=await h.selected();
    await h.page.mouse.move(300,200);
    await h.page.mouse.down();
    await h.page.clock.runFor(7_000);
    await h.page.mouse.move(70,200,{steps:4});
    await h.page.clock.runFor(100);
    await h.page.mouse.move(70,10);
    await h.page.clock.runFor(16);
    await h.page.mouse.up();
    assert.notEqual(await h.selected(),beforeMouse,'a mouse release outside the section must finish its drag');
    await h.boundary(12_000);
    await h.boundary(interval);
  } finally {await h.close();}
});

}
