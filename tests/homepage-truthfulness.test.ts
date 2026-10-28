import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FeaturedProduct } from '../lib/catalog/featured-products';

const fixture = globalThis as typeof globalThis & {
  truthfulnessElement: typeof createElement;
  truthfulnessTop: FeaturedProduct[];
  truthfulnessPromoted: FeaturedProduct[];
};
fixture.truthfulnessElement = createElement;
fixture.truthfulnessTop = [];
fixture.truthfulnessPromoted = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'export const env={DB:{prepare(){}}}',
      'next/link':
        'export default function Link(props){return globalThis.truthfulnessElement("a",props)}',
      'next/image':
        'export default function Image({fill,priority,loading,fetchPriority,unoptimized,...props}){return globalThis.truthfulnessElement("img",props)}',
      '@/lib/db/repositories/business-settings':
        'export async function getEffectiveBusinessSetting(){throw Error("Use recovery slides")}',
      '@/lib/db/repositories/products':
        'export async function listHomepagePromotedProducts(){return globalThis.truthfulnessPromoted};export async function listHomepageLatestProducts(){return []};export async function listHomepageTopProducts(){return globalThis.truthfulnessTop};export async function listActiveHomepagePromotions(){return []};export async function listPublicDiscoveryCategories(){return []};export async function listActiveOccasions(){return []}',
      '@/components/layout/site-header':
        'export function SiteHeader(){return null}',
      '@/components/layout/site-footer':
        'export function SiteFooter(){return null}',
    };
    if (specifier.endsWith('.module.css'))
      return {
        url: 'data:text/javascript,export default new Proxy({},{get:(_,key)=>String(key)})',
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

const product = (slug: string): FeaturedProduct => ({
  slug,
  name: `Fixture ${slug}`,
  price: '1,200',
  pricePaisa: 120000,
  compareAtPricePaisa: null,
  category: 'Home',
  categorySlug: 'home',
  image: '/fixture.webp',
  imageAlt: 'Fixture product',
  tradingName: 'Fixture seller',
});
async function homepage(top: FeaturedProduct[], promoted: FeaturedProduct[]) {
  fixture.truthfulnessTop = top;
  fixture.truthfulnessPromoted = promoted;
  const { default: Home } = await import('../app/page');
  return renderToStaticMarkup(await Home());
}
function topSection(html: string) {
  return (
    html.match(
      /<section\b[^>]*id="top-products"[\s\S]*?<\/section>\s*<\/div>\s*<\/section>/,
    )?.[0] ??
    html.match(/<section\b[^>]*id="top-products"[\s\S]*?<\/section>/)?.[0]
  );
}

void test('homepage omits the featured section when no eligible top or promoted products exist', async () => {
  const html = await homepage([], []);
  assert.doesNotMatch(html, /id="top-products"/);
  assert.match(html, /id="latest-products"/);
  assert.match(html, /id="customer-care"/);
});

void test('homepage top products take priority over the approved promotion fallback', async () => {
  const section = topSection(
    await homepage([product('top-only')], [product('promotion-only')]),
  );
  assert.ok(section);
  assert.match(section, /href="\/products\/top-only"/);
  assert.doesNotMatch(section, /href="\/products\/promotion-only"/);
  assert.match(section, /Top products right now/);
  assert.doesNotMatch(
    section,
    /non-cancelled|last 90 days|active approved homepage promotion/,
  );
});

void test('homepage shows eligible promotion products as featured when top products are empty', async () => {
  const section = topSection(await homepage([], [product('promotion-only')]));
  assert.ok(section);
  assert.match(section, /Featured by Hastabazaar/);
  assert.match(section, /href="\/products\/promotion-only"/);
  assert.doesNotMatch(
    section,
    /ranked here|successfully delivered|active approved homepage promotion/,
  );
});

void test('hero guide actions are labelled for the craft guide while actual seller profile links retain their identity', async () => {
  const { HomepageHeroCopy } =
    await import('../components/homepage/homepage-hero-copy');
  const { INITIAL_HOMEPAGE_HERO_SLIDES } =
    await import('../lib/homepage/hero-slides');
  const html = renderToStaticMarkup(
    createElement(HomepageHeroCopy, {
      slide: {
        ...INITIAL_HOMEPAGE_HERO_SLIDES[0]!,
        primaryActionLabel: 'Meet our makers',
        primaryActionHref: '/#makers',
        secondaryActionLabel: 'View Fixture seller',
        secondaryActionHref: '/makers/fixture-seller',
      },
    }),
  );
  assert.match(html, /href="\/#craft-guide"[^>]*>Craft guide/);
  assert.doesNotMatch(html, /Meet our makers/);
  assert.match(
    html,
    /href="\/makers\/fixture-seller"[^>]*>View Fixture seller/,
  );
});

void test('published occasion guide cards identify their destination and preserve actual seller profile cards', async () => {
  const { HomepageOccasionCarousel } =
    await import('../components/homepage/homepage-occasion-carousel');
  const { INITIAL_HOMEPAGE_OCCASION_SLIDES } =
    await import('../lib/homepage/occasion-slides');
  const html = renderToStaticMarkup(
    createElement(HomepageOccasionCarousel, {
      slides: [
        {
          ...INITIAL_HOMEPAGE_OCCASION_SLIDES[0]!,
          cards: [
            {
              kicker: 'THE PEOPLE BEHIND THE CRAFT',
              title: 'Meet our makers',
              destination: '/#makers',
              icon: 'hand-heart',
              theme: 'navy',
            },
            {
              kicker: 'SELLER',
              title: 'Fixture seller',
              destination: '/makers/fixture-seller',
              icon: 'home',
              theme: 'warm',
            },
          ],
        },
      ],
    }),
  );
  assert.match(html, /href="\/#craft-guide"/);
  assert.match(html, /<strong>Craft guide<\/strong>/);
  assert.doesNotMatch(html, /Meet our makers|THE PEOPLE BEHIND THE CRAFT/);
  assert.match(html, /href="\/makers\/fixture-seller"/);
  assert.match(html, /<strong>Fixture seller<\/strong>/);
});

void test('known legacy hero copy is presented without assigning every product a Nepali handmade origin', async () => {
  const { HomepageHeroCopy } =
    await import('../components/homepage/homepage-hero-copy');
  const { INITIAL_HOMEPAGE_HERO_SLIDES } =
    await import('../lib/homepage/hero-slides');
  const html = renderToStaticMarkup(
    createElement(HomepageHeroCopy, {
      slide: {
        ...INITIAL_HOMEPAGE_HERO_SLIDES[0]!,
        eyebrow: 'Nepal’s handicraft marketplace',
        headingLead: 'Handmade today',
        highlightedPhrase: 'brighter',
        headingTail: 'Nepal.',
        body: 'Discover authentic handmade products, support independent Nepali artisans, and bring home craft with a human story.',
      },
    }),
  );
  assert.equal(html.includes('Discover authentic handmade products'), false);
  assert.equal(html.includes('Handmade today'), false);
  const custom = renderToStaticMarkup(
    createElement(HomepageHeroCopy, {
      slide: {
        ...INITIAL_HOMEPAGE_HERO_SLIDES[0]!,
        eyebrow: 'constructor',
        headingLead: 'Custom approved collection',
        body: 'Seller-provided detail for this specific collection.',
      },
    }),
  );
  assert.ok(custom.includes('constructor'));
  assert.ok(custom.includes('Custom approved collection'));
  assert.ok(
    custom.includes('Seller-provided detail for this specific collection.'),
  );
});

void test('known legacy occasion copy is normalized while custom collection copy is retained', async () => {
  const { HomepageOccasionCarousel } =
    await import('../components/homepage/homepage-occasion-carousel');
  const { INITIAL_HOMEPAGE_OCCASION_SLIDES } =
    await import('../lib/homepage/occasion-slides');
  const html = renderToStaticMarkup(
    createElement(HomepageOccasionCarousel, {
      slides: [
        {
          ...INITIAL_HOMEPAGE_OCCASION_SLIDES[1]!,
          headingLead: 'Made by hand.',
          body: 'Discover thoughtful pieces from Nepali makers for the people and moments that matter.',
          supportingNote: 'Thoughtful gifts, delivered across Nepal.',
        },
      ],
    }),
  );
  assert.equal(html.includes('Made by hand.'), false);
  assert.equal(html.includes('pieces from Nepali makers'), false);
  const custom = renderToStaticMarkup(
    createElement(HomepageOccasionCarousel, {
      slides: [
        {
          ...INITIAL_HOMEPAGE_OCCASION_SLIDES[0]!,
          body: 'Custom collection details.',
          supportingNote: 'Delivery details for this collection.',
        },
      ],
    }),
  );
  assert.ok(custom.includes('Custom collection details.'));
  assert.ok(custom.includes('Delivery details for this collection.'));
});
