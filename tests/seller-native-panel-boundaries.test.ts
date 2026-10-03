import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHomepageHeroMediaReady } from '../lib/db/repositories/homepage-hero';
import { CURRENT_HERO_RECOVERY_SLIDES, type HomepageHeroSlide } from '../lib/homepage/hero-slides';

const panel: HomepageHeroSlide = {
  ...CURRENT_HERO_RECOVERY_SLIDES[0],
  id: 'hero-seller-registration',
  mediaId: 'system-seller-registration-panel',
  mediaType: 'image',
  posterMediaId: null,
  imageAlt: 'Seller application steps',
};

function missingMedia() {
  const lookups: unknown[] = [];
  const database = {
    prepare() {
      return { bind(id: unknown) { lookups.push(id); return { async first() { return null; } }; } };
    },
  } as unknown as D1Database;
  return { database, lookups };
}

void test('native seller panel needs no uploaded media or media lookup to publish', async () => {
  const { database, lookups } = missingMedia();
  await assertHomepageHeroMediaReady(database, [panel]);
  assert.deepEqual(lookups, []);
});

void test('reserved native panel exemption does not permit arbitrary missing images or videos', async () => {
  for (const altered of [
    { ...panel, id: 'another-slide' },
    { ...panel, mediaId: 'missing-upload' },
    { ...panel, mediaType: 'video' as const },
  ]) {
    const { database, lookups } = missingMedia();
    await assert.rejects(assertHomepageHeroMediaReady(database, [altered]), /missing, archived, or has the wrong type/);
    assert.equal(lookups.length, 1);
  }
});
