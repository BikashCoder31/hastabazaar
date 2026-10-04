import assert from 'node:assert/strict';
import test from 'node:test';
import * as editor from '../lib/homepage/hero-editor';
import { INITIAL_HOMEPAGE_HERO_SLIDES, assertHomepageHeroPublicationReady, validateHomepageHeroDraft, presentHomepageHeroSlide } from '../lib/homepage/hero-slides';

void test('adding the seller slide first preserves every existing card and its relative order', () => {
  assert.equal(typeof editor.addSellerRegistrationSlide, 'function', 'Seller registration template is available');
  const before = INITIAL_HOMEPAGE_HERO_SLIDES.map((slide, index) => ({
    ...slide, headingLead: `Previously approved heading ${index + 1}`, enabled: index !== 1,
  }));
  const saved = structuredClone(before);
  const next = editor.addSellerRegistrationSlide(before);
  assert.equal(next.length, 4);
  assert.equal(next[0].primaryActionHref, '/sell#seller-application');
  assert.equal(next[0].enabled, true);
  assert.equal(next[0].position, 1);
  assert.deepEqual(next.slice(1), saved.map((slide, index) => ({ ...slide, position: index + 2 })));
  assert.deepEqual(before, saved, 'The previous version remains unchanged');
  assert.doesNotThrow(() => assertHomepageHeroPublicationReady(next));
});

void test('the seller slide uses native application steps without claiming a photographed seller identity', () => {
  assert.equal(typeof editor.addSellerRegistrationSlide, 'function');
  const slide = editor.addSellerRegistrationSlide(INITIAL_HOMEPAGE_HERO_SLIDES)[0];
  assert.equal(slide.mediaId, 'system-seller-registration-panel');
  assert.ok(INITIAL_HOMEPAGE_HERO_SLIDES.every(previous => previous.mediaId !== slide.mediaId));
  assert.match(String(slide.imageAlt), /application steps.*review.*approval/i);
  assert.equal(slide.imageNote, null);
  assert.match(slide.body, /review/i);
  assert.equal(slide.secondaryActionHref, null);
});

void test('adding a seller slide to seven cards keeps all seven and fills the eighth slot', () => {
  assert.equal(typeof editor.addSellerRegistrationSlide, 'function');
  const source = Array.from({ length: 7 }, (_, index) => ({
    ...INITIAL_HOMEPAGE_HERO_SLIDES[index % 3], id: `approved-slide-${index + 1}`, position: index + 1,
  }));
  const next = editor.addSellerRegistrationSlide(source);
  assert.equal(next.length, 8);
  assert.deepEqual(next.slice(1).map(slide => slide.id), [
    'approved-slide-1', 'approved-slide-2', 'approved-slide-3', 'approved-slide-4',
    'approved-slide-5', 'approved-slide-6', 'approved-slide-7',
  ]);
  assert.doesNotThrow(() => validateHomepageHeroDraft(next));
});

void test('a full carousel is rejected without dropping an existing slide', () => {
  assert.equal(typeof editor.addSellerRegistrationSlide, 'function');
  const source = Array.from({ length: 8 }, (_, index) => ({
    ...INITIAL_HOMEPAGE_HERO_SLIDES[index % 3], id: `approved-slide-${index + 1}`, position: index + 1,
  }));
  const saved = structuredClone(source);
  assert.throws(() => editor.addSellerRegistrationSlide(source), /8|eight/i);
  assert.deepEqual(source, saved);
});

void test('repeated use cannot create duplicate seller slides or overwrite edited seller copy', () => {
  assert.equal(typeof editor.addSellerRegistrationSlide, 'function');
  const source = editor.addSellerRegistrationSlide(INITIAL_HOMEPAGE_HERO_SLIDES);
  source[0] = { ...source[0], body: 'An approved seller introduction edited by the operator.' };
  const saved = structuredClone(source);
  assert.throws(() => editor.addSellerRegistrationSlide(source), /already/i);
  assert.deepEqual(source, saved);
});

void test('native seller presentation keeps approved copy and application steps without changing stored settings', () => {
  const slide = editor.addSellerRegistrationSlide(INITIAL_HOMEPAGE_HERO_SLIDES)[0];
  const custom = { ...slide, body: 'An approved seller introduction edited by the operator.' };
  const saved = structuredClone(custom);
  assert.deepEqual(presentHomepageHeroSlide(custom), saved);
  assert.deepEqual(custom, saved);
});
