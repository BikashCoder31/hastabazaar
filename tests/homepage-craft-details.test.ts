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
      '@/app/account/account-overview-data': 'export async function readAccountYourTurn(){return null}',
      '@/app/auth': 'export const signInPath=(path)=>"/login?return_to="+encodeURIComponent(path)',
      '@/lib/auth/customer': 'export async function getCustomerReadContext(){return {customer:null,authenticated:false}}',
      '@/lib/homepage/homepage-storefront-data': 'export async function listHomepageMakers(){return []}',
      '@/lib/db/repositories/loyalty': 'export async function getPublishedLoyaltyTerms(){return {status:"disabled"}}',
      'next/navigation': 'export function useRouter(){return {refresh(){}}}',
      'next/link':
        'export default function Link(props){return globalThis.craftDetailsElement("a",props)}',
      'next/image':
        'export default function Image({fill,priority,loading,fetchPriority,...props}){return globalThis.craftDetailsElement("img",props)}',
      '@/lib/db/repositories/business-settings':
        'export async function getEffectiveBusinessSetting(){throw Error("Use default presentation fixture")}',
      '@/lib/db/repositories/products':
        'export async function listHomepagePromotedProducts(){return []};export async function listHomepageLatestProducts(){return []};export async function listHomepageTopProducts(){return []};export async function listActiveHomepagePromotions(){return []};export async function listPublicDiscoveryCategories(){return [{id:"food",slug:"food",nameEn:"Food",nameNe:"खाना",imageId:null}]};export async function listActiveOccasions(){return [{id:"birthday",slug:"birthday",nameEn:"Birthday",nameNe:"जन्मदिन"}]}',
      '@/components/layout/site-header':
        'export function SiteHeader(){return null}',
      '@/components/layout/site-footer':
        'export function SiteFooter(){return globalThis.craftDetailsFooter}',
      '@/components/homepage/homepage-hero-carousel':
        'export function HomepageHeroCarousel(){return null}',
      '@/components/homepage/homepage-occasion-carousel':
        'export function HomepageOccasionCarousel({children}){return children}',
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
    /<section\b[^>]*id="craft-guide"[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(
    section,
    'Name the craft buying guide as the guide navigation destination.',
  );
  const footer = renderToStaticMarkup(globals.craftDetailsFooter).match(
    /<footer\b[\s\S]*?<\/footer>/,
  )?.[0];
  assert.ok(footer);
  return { html, section, footer };
}

void test('the homepage craft mosaic identifies and describes each pictured material', async () => {
  const { section } = await homepage();
  for (const material of ['Dhaka weave', 'Lokta paper', 'Terracotta', 'Macramé', 'Jewellery']) {
    assert.match(section, new RegExp('<h3>' + material + '</h3>'));
  }
  assert.match(section, /href="#craft-materials"/);
  assert.match(section, /Tiny shifts where the weaver changed colour/);
  assert.match(section, /Materials and care notes on each listing/);
  assert.doesNotMatch(section, /every (piece|product).*handmade|guaranteed|certified/i);
});

void test('homepage craft guide has a named heading and responsive descriptive photos', async () => {
  const { section } = await homepage();
  const headingId = section.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(headingId);
  assert.ok(section.includes(`<h2 id="${headingId}"`));
  assert.match(section, /src="\/homepage\/maker-hands-hero\.webp"/);
  assert.match(section, /alt="[^"]*Hands[^"]*terracotta[^"]*"/i);
  assert.equal((section.match(/data-media-frame="cover"/g) ?? []).length, 5);
  assert.equal((section.match(/data-media-mode="cover"/g) ?? []).length, 5);
});

void test('homepage keeps the footer CTA and surrounding customer care sections intact', async () => {
  const { html, footer } = await homepage();
  assert.equal(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0], footer);
  assert.match(footer, /Thoughtful finds\. Everyday possibilities\./);
  assert.match(footer, /Shop the collection/);
  assert.match(footer, /Share your craft/);
  assert.equal(
    (html.match(/Thoughtful finds\. Everyday possibilities\./g) ?? []).length,
    1,
  );
  assert.match(html, /id="our-standard"/);
  assert.match(html, /Good craft\. <em>Thoughtful care\./);
  assert.match(html, /id="customer-care"/);
  assert.match(html, /href="\/account\/orders"/);
});

void test('homepage exposes newly configured categories and occasions without a built-in image or carousel slide', async () => {
  const { html } = await homepage();
  assert.match(html, /href="\/shop\?category=food"/);
  assert.match(html, /href="\/occasions#occasion-birthday"/);
  assert.match(html, />Food<\/strong>/);
  assert.match(html, />Birthday<\/a>/);
  assert.doesNotMatch(html, /\p{Script=Devanagari}|lang="ne"/u);
  assert.match(html, /href="\/categories"/);
  assert.match(html, /href="\/occasions"/);
});

void test('category and occasion cards use English names when translations are saved', async () => {
  const { TaxonomyDirectory } = await import('../components/catalog/taxonomy-directory');
  const fixtures = [
    { kind: 'category', id: 'food', slug: 'food', nameEn: 'Food', nameNe: 'खाना' },
    { kind: 'occasion', id: 'birthday', slug: 'birthday', nameEn: 'Birthday', nameNe: 'जन्मदिन' },
  ] as const;
  for (const { kind, ...entry } of fixtures) {
    const html = renderToStaticMarkup(createElement(TaxonomyDirectory, { kind, entries: [entry] }));
    assert.ok(html.includes('>' + entry.nameEn + '<'));
    assert.ok(html.includes('/shop?' + kind + '=' + entry.slug));
    assert.doesNotMatch(html, /\p{Script=Devanagari}|lang="ne"/u);
  }
});
