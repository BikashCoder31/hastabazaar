import assert from 'node:assert/strict';
import test from 'node:test';

import { assertBusinessSettingPublicationReady } from '../lib/configuration/capabilities';
import {
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../lib/configuration/definitions';

type SlideOverrides = Partial<{
  id: string;
  position: number;
  enabled: boolean;
  eyebrow: string;
  headingLead: string;
  highlightedPhrase: string | null;
  headingTail: string | null;
  body: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string | null;
  secondaryActionHref: string | null;
  mediaType: 'image' | 'video';
  mediaId: string;
  imageAlt: string | null;
  posterMediaId: string | null;
  videoDescription: string | null;
  imageNote: string | null;
}>;

function imageSlide(position: number, overrides: SlideOverrides = {}) {
  return {
    id: `hero-slide-${position}`,
    position,
    enabled: true,
    eyebrow: 'Handmade in Nepal',
    headingLead: `A meaningful craft ${position}`,
    highlightedPhrase: null,
    headingTail: null,
    body: 'Discover a carefully presented handmade story from Nepal.',
    primaryActionLabel: 'Explore the collection',
    primaryActionHref: '/shop',
    secondaryActionLabel: null,
    secondaryActionHref: null,
    mediaType: 'image' as const,
    mediaId: `hero-media-${position}`,
    imageAlt: 'A warm editorial arrangement of handmade Nepali craft',
    posterMediaId: null,
    videoDescription: null,
    imageNote: null,
    ...overrides,
  };
}

function validSlides(count: number) {
  return Array.from({ length: count }, (_, index) => imageSlide(index + 1));
}

void test('homepage hero is a simple effective-dated setting seeded with three editable slides', () => {
  const definition = getBusinessSettingDefinition('homepage_hero_slides');
  assert.equal(definition.changeControl, 'simple');
  assert.equal(definition.effectiveMode, 'effective_dated');
  assert.equal(definition.defaultValue.length, 3);
  assert.equal(definition.defaultValue[0].headingLead, 'Thoughtful finds');
  assert.equal(
    definition.defaultValue[0].mediaId,
    'system-nepal-craft-hero',
  );
});

void test('draft validation keeps bounded incomplete cards saveable', () => {
  const draft = [
    imageSlide(1, {
      eyebrow: '',
      headingLead: '',
      body: '',
      primaryActionLabel: '',
      primaryActionHref: '',
      mediaId: '',
      imageAlt: null,
    }),
  ];
  assert.deepEqual(
    validateBusinessSettingValue('homepage_hero_slides', draft),
    draft,
  );
});

void test('draft validation rejects unsafe structure before publication', () => {
  assert.throws(
    () =>
      validateBusinessSettingValue('homepage_hero_slides', [
        { ...imageSlide(1), rawSql: 'SELECT * FROM users' },
      ]),
    /unknown field/i,
  );
  assert.throws(
    () => validateBusinessSettingValue('homepage_hero_slides', validSlides(9)),
    /at most 8/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(3),
      ]),
    /contiguous/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(2, { id: 'hero-slide-1' }),
      ]),
    /duplicate id/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('homepage_hero_slides', [
        imageSlide(1, { body: `Unsafe\u0000copy` }),
      ]),
    /control/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('homepage_hero_slides', [
        imageSlide(1, { body: 'x'.repeat(241) }),
      ]),
    /240/i,
  );
  for (const unsafeHref of [
    'https://example.com',
    '//example.com',
    'javascript:alert(1)',
    '/admin/users',
    '/seller/orders',
    '/rider',
    '/local-testing',
    '/shop\\checkout',
  ]) {
    assert.throws(
      () =>
        validateBusinessSettingValue('homepage_hero_slides', [
          imageSlide(1, { primaryActionHref: unsafeHref }),
        ]),
      /destination/i,
    );
  }
});

void test('publication accepts three through eight complete enabled slides', () => {
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'homepage_hero_slides',
      validSlides(3),
    ),
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'homepage_hero_slides',
      validSlides(8),
    ),
  );
});

void test('publication rejects incomplete slide collections and mismatched media fields', () => {
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'homepage_hero_slides',
        validSlides(2),
      ),
    /at least 3 enabled/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(2),
        imageSlide(3, { headingLead: '' }),
      ]),
    /heading lead/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(2),
        imageSlide(3, {
          secondaryActionLabel: 'Learn more',
          secondaryActionHref: null,
        }),
      ]),
    /secondary action/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(2),
        imageSlide(3, { mediaType: 'image', imageAlt: null }),
      ]),
    /image alternative/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady('homepage_hero_slides', [
        imageSlide(1),
        imageSlide(2),
        imageSlide(3, {
          mediaType: 'video',
          imageAlt: null,
          posterMediaId: null,
          videoDescription: null,
        }),
      ]),
    /poster/i,
  );
});
