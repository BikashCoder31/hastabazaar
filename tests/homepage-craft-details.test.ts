import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const globals = globalThis as typeof globalThis & {
  craftDetailsElement: typeof createElement;
  craftDetailsFooter: ReactNode;
};
globals.craftDetailsElement = createElement;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers':
        'export const env={DB:{prepare(){return {async first(){return {now:1000}}}}}}',
      'next/link':
        'export default function Link(props){return globalThis.craftDetailsElement("a",props)}',
      'next/image':
        'export default function Image({fill,priority,loading,fetchPriority,...props}){return globalThis.craftDetailsElement("img",props)}',
      '@/lib/db/repositories/business-settings':
        'export async function getEffectiveBusinessSetting(){throw Error("Use default presentation fixture")}',
      '@/lib/db/repositories/products':
        'export async function listHomepagePromotedProducts(){return []};export async function listHomepageLatestProducts(){return []};export async function listHomepageTopProducts(){return []};export async function listActiveHomepagePromotions(){return []};export async function listPublicDiscoveryCategories(){return [{id:"food",slug:"food",nameEn:"Food",nameNe:null,imageId:null}]};export async function listActiveOccasions(){return [{id:"birthday",slug:"birthday",nameEn:"Birthday",nameNe:null}]}',
      '@/components/layout/site-header':
        'export function SiteHeader(){return null}',
      '@/components/layout/site-footer':
        'export function SiteFooter(){return globalThis.craftDetailsFooter}',
      '@/components/catalog/product-slider':
        'export function ProductSlider(){return null}',
      '@/components/homepage/homepage-hero-carousel':
        'export function HomepageHeroCarousel(){return null}',
      '@/components/homepage/homepage-occasion-carousel':
        'export function HomepageOccasionCarousel(){return null}',
    };
    if (specifier.endsWith('.module.css'))
      return {
        url: 'data:text/javascript,export default new Proxy({},{get:(_,key)=>"craft-details-"+String(key)})',
        shortCircuit: true,
      };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});

async function homepage() {
  const { SiteFooter } = await import('../components/layout/site-footer');
  globals.craftDetailsFooter = await SiteFooter();
  const { default: Home } = await import('../app/page');
  const html = renderToStaticMarkup(await Home());
  const section = html.match(
    /<section\b[^>]*id="makers"[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(
    section,
    'Keep the makers navigation anchor attached to the craft guide.',
  );
  const footer = renderToStaticMarkup(globals.craftDetailsFooter).match(
    /<footer\b[\s\S]*?<\/footer>/,
  )?.[0];
  assert.ok(footer);
  return { html, section, footer };
}

void test('homepage craft guide replaces repeated promotional actions with three useful observations', async () => {
  const { section } = await homepage();
  assert.doesNotMatch(
    section,
    /<a\b|<button\b|Every craft begins|Discover their work|Share your craft/,
  );
  assert.match(section, /<ol\b/);
  assert.equal((section.match(/<li\b/g) ?? []).length, 3);
  for (const subject of [/material/i, /finish/i, /variation/i])
    assert.match(section, subject);
  assert.doesNotMatch(
    section,
    /every (piece|product).*handmade|guaranteed|certified/i,
  );
});

void test('homepage craft guide has a named heading and a descriptive workshop image', async () => {
  const { section } = await homepage();
  const headingId = section.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(headingId, 'Name the guide region through its visible heading.');
  assert.ok(section.includes(`<h2 id="${headingId}"`));
  assert.match(section, /src="\/homepage\/nepali-maker-workshop\.webp"/);
  assert.match(
    section,
    /alt="[^"]*(hands|artisan)[^"]*(vase|terracotta)[^"]*"/i,
  );
  assert.match(section, /data-media-frame="cover"/);
  assert.match(section, /data-media-mode="cover"/);
});

void test('homepage keeps the footer CTA and surrounding customer care sections intact', async () => {
  const { html, footer } = await homepage();
  assert.equal(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0], footer);
  assert.match(footer, /Crafted in Nepal\. Connected to the world\./);
  assert.match(footer, /Shop the collection/);
  assert.match(footer, /Share your craft/);
  assert.equal(
    (html.match(/Crafted in Nepal\. Connected to the world\./g) ?? []).length,
    1,
  );
  assert.match(html, /id="our-standard"/);
  assert.match(html, /Good craft\. Thoughtful care\./);
  assert.match(html, /id="customer-care"/);
  assert.match(html, /href="\/account\/orders"/);
});

void test('homepage exposes newly configured categories and occasions without a built-in image or carousel slide', async () => {
  const { html } = await homepage();
  assert.match(html, /href="\/shop\?category=food"/);
  assert.match(html, /href="\/shop\?occasion=birthday"/);
  assert.match(html, /href="\/categories"/);
  assert.match(html, /href="\/occasions"/);
});
