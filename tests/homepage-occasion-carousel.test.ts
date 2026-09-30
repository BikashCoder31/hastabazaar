import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../lib/configuration/definitions';
import { assertBusinessSettingPublicationReady } from '../lib/configuration/capabilities';

const approvedSlideTwo = {
  id: 'occasion-human-story',
  position: 2,
  enabled: true,
  eyebrow: 'GIFTS WITH A HUMAN STORY',
  headingLead: 'Made by hand.',
  highlightedPhrase: 'Chosen with heart.',
  headingTail: null,
  body: 'Discover thoughtful pieces from Nepali makers for the people and moments that matter.',
  supportingNote: 'Thoughtful gifts, delivered across Nepal.',
  cards: [
    {
      kicker: 'FRESHLY ADDED',
      title: 'New arrivals',
      destination: '/shop?sort=newest',
      icon: 'sparkles',
      theme: 'warm',
    },
    {
      kicker: 'THE PEOPLE BEHIND THE CRAFT',
      title: 'Meet our makers',
      destination: '/#makers',
      icon: 'hand-heart',
      theme: 'navy',
    },
  ],
} as const;

const validSlides = () => [
  {
    id: 'occasion-current',
    position: 1,
    enabled: true,
    eyebrow: 'FOR THEIR KIND OF SPECIAL',
    headingLead: 'Big moments.',
    highlightedPhrase: 'Little surprises.',
    headingTail: null,
    body: 'Birthdays, festivals, thank-yous, or just because. Start with the occasion and find something that feels like them.',
    supportingNote: 'Delivery available across Nepal.',
    cards: [
      {
        kicker: 'THOUGHTFUL GIFTING',
        title: 'Birthday gifts',
        destination: '/shop?occasion=birthday-gifts',
        icon: 'cake',
        theme: 'crimson',
      },
      {
        kicker: 'THE COMPLETE COLLECTION',
        title: 'Explore all gifts',
        destination: '/shop?category=gifts',
        icon: 'gift',
        theme: 'warm',
      },
    ],
  },
  approvedSlideTwo,
];

void test('homepage occasion slides are ordinary versioned public content', () => {
  const definition = getBusinessSettingDefinition(
    'homepage_occasion_slides' as never,
  );
  assert.equal(definition.changeControl, 'simple');
  assert.equal(definition.effectiveMode, 'effective_dated');
  assert.equal(definition.sensitivity, 'public_content');
  assert.equal(definition.snapshotOnTransaction, false);
  assert.deepEqual(definition.defaultValue, validSlides());
});

void test('occasion validation accepts two through eight slides and exact approved slide two', () => {
  assert.deepEqual(
    validateBusinessSettingValue(
      'homepage_occasion_slides' as never,
      validSlides() as never,
    ),
    validSlides(),
  );
  const eight = Array.from({ length: 8 }, (_, index) => ({
    ...approvedSlideTwo,
    id: `occasion-${index + 1}`,
    position: index + 1,
  }));
  assert.equal(
    (
      validateBusinessSettingValue(
        'homepage_occasion_slides' as never,
        eight as never,
      ) as unknown[]
    ).length,
    8,
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady(
      'homepage_occasion_slides' as never,
      validSlides() as never,
    ),
  );
});

void test('occasion validation rejects IDs, positions, URLs, unknown fields, and fewer than two enabled', () => {
  const invalid: readonly [unknown, RegExp][] = [
    [
      validSlides().map((slide, index) =>
        index === 1 ? { ...slide, id: 'occasion-current' } : slide,
      ),
      /duplicate ID/i,
    ],
    [validSlides().map((slide) => ({ ...slide, position: 1 })), /position/i],
    [
      validSlides().map((slide, index) =>
        index === 1
          ? {
              ...slide,
              cards: slide.cards.map((card, cardIndex) =>
                cardIndex === 0
                  ? { ...card, destination: 'javascript:alert(1)' }
                  : card,
              ),
            }
          : slide,
      ),
      /safe internal/i,
    ],
    [
      validSlides().map((slide, index) =>
        index === 1
          ? { ...slide, rawHtml: '<script>alert(1)</script>' }
          : slide,
      ),
      /unknown field/i,
    ],
  ];
  for (const [value, message] of invalid) {
    assert.throws(
      () =>
        validateBusinessSettingValue(
          'homepage_occasion_slides' as never,
          value as never,
        ),
      message,
    );
  }
  const oneEnabled = validSlides().map((slide, index) => ({
    ...slide,
    enabled: index === 0,
  }));
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'homepage_occasion_slides' as never,
        oneEnabled as never,
      ),
    /at least 2 enabled/i,
  );
});

void test('occasion editor adds, reorders, enables, disables, and removes while preserving stable IDs', async () => {
  const modulePath = '../lib/homepage/occasion-editor';
  const editor = (await import(modulePath).catch(() => null)) as null | {
    addHomepageOccasionSlide: (slides: unknown[], id: string) => unknown[];
    moveHomepageOccasionSlide: (
      slides: unknown[],
      id: string,
      direction: 'up' | 'down',
    ) => Array<{ id: string; position: number }>;
    removeHomepageOccasionSlide: (slides: unknown[], id: string) => unknown[];
    setHomepageOccasionSlideEnabled: (
      slides: unknown[],
      id: string,
      enabled: boolean,
    ) => unknown[];
  };
  assert.ok(editor, 'occasion editor module must exist');
  const initial = validSlides();
  const added = editor.addHomepageOccasionSlide(
    initial,
    'occasion-third',
  ) as Array<{ id: string; enabled: boolean }>;
  assert.equal(added[2]?.id, 'occasion-third');
  assert.equal(added[2]?.enabled, false);
  const moved = editor.moveHomepageOccasionSlide(added, 'occasion-third', 'up');
  assert.deepEqual(
    moved.map((slide) => slide.id),
    ['occasion-current', 'occasion-third', 'occasion-human-story'],
  );
  assert.deepEqual(
    moved.map((slide) => slide.position),
    [1, 2, 3],
  );
  const enabled = editor.setHomepageOccasionSlideEnabled(
    added,
    'occasion-third',
    true,
  );
  const removed = editor.removeHomepageOccasionSlide(
    enabled,
    'occasion-human-story',
  ) as Array<{ id: string }>;
  assert.deepEqual(
    removed.map((slide) => slide.id),
    ['occasion-current', 'occasion-third'],
  );
  const oneEnabled = editor.setHomepageOccasionSlideEnabled(
    initial,
    'occasion-current',
    false,
  ) as Array<{ enabled: boolean }>;
  assert.equal(oneEnabled.filter((slide) => slide.enabled).length, 1);
  assert.equal(
    editor.removeHomepageOccasionSlide(initial, 'occasion-current').length,
    1,
  );
});

void test('occasion carousel wraps, uses six seconds, pauses, and announces manual changes', async () => {
  const modulePath = '../lib/homepage/occasion-autoplay';
  const autoplay = (await import(modulePath).catch(() => null)) as null | {
    nextOccasionIndex: (
      current: number,
      count: number,
      direction: 'next' | 'previous',
    ) => number;
    occasionAdvanceDelayMs: () => number;
    shouldAutoplayOccasions: (reasons: ReadonlySet<string>) => boolean;
    occasionSelectionAnnouncement: (
      index: number,
      count: number,
      heading: string,
      selection: 'manual' | 'automatic',
    ) => string;
  };
  assert.ok(autoplay, 'occasion autoplay module must exist');
  assert.equal(autoplay.nextOccasionIndex(1, 2, 'next'), 0);
  assert.equal(autoplay.nextOccasionIndex(0, 2, 'previous'), 1);
  assert.equal(autoplay.occasionAdvanceDelayMs(), 6_000);
  for (const reason of [
    'manual',
    'hover',
    'focus',
    'document-hidden',
    'reduced-motion',
  ]) {
    assert.equal(autoplay.shouldAutoplayOccasions(new Set([reason])), false);
  }
  assert.equal(autoplay.shouldAutoplayOccasions(new Set()), true);
  assert.equal(
    autoplay.occasionSelectionAnnouncement(1, 2, 'Made by hand', 'manual'),
    'Slide 2 of 2: Made by hand',
  );
  assert.equal(
    autoplay.occasionSelectionAnnouncement(1, 2, 'Made by hand', 'automatic'),
    '',
  );
});

void test('public and Super Admin surfaces reuse the central setting and actual occasion layout', async () => {
  const [page, adminPage, manager, carousel, styles] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../app/admin/homepage/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../components/admin/homepage-occasion-manager.tsx',
        import.meta.url,
      ),
      'utf8',
    ).catch(() => ''),
    readFile(
      new URL(
        '../components/homepage/homepage-occasion-carousel.tsx',
        import.meta.url,
      ),
      'utf8',
    ).catch(() => ''),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.match(
    page,
    /getEffectiveBusinessSetting[\s\S]*?'homepage_occasion_slides'/,
  );
  assert.match(page, /CURRENT_OCCASION_RECOVERY_SLIDES/);
  assert.match(page, /<HomepageOccasionCarousel slides=\{occasionSlides\}/);
  assert.equal((page.match(/<HomepageOccasionCarousel/g) ?? []).length, 1);
  const navigation =
    page.match(/<nav\s+aria-label="Gift occasions"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(navigation, /occasions\.map/);
  assert.match(navigation, /encodeURIComponent\(occasion.slug\)/);
  assert.match(navigation, /occasion.nameEn/);
  assert.doesNotMatch(
    navigation,
    /HomepageOccasionCarousel|aria-hidden|inert=/,
  );
  assert.match(adminPage, /<HomepageOccasionManager/);
  assert.match(
    adminPage,
    /listBusinessSettingHistory[\s\S]*?'homepage_occasion_slides'/,
  );
  assert.match(manager, /key:\s*'homepage_occasion_slides'/);
  assert.match(manager, /Desktop preview/);
  assert.match(manager, /Mobile preview/);
  assert.match(manager, /slides=\{slides\}/);
  assert.match(manager, /initialSlideId=\{previewId\}/);
  assert.match(carousel, /opts=\{\{ loop: true, startIndex: initialIndex \}\}/);
  assert.match(carousel, /aria-live="polite"/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(carousel, /setTimeout/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /ArrowRight/);
  assert.match(carousel, /inert=\{index === current \? undefined : true\}/);
  assert.match(
    carousel,
    /aria-hidden=\{index === current \? undefined : true\}/,
  );
  assert.match(
    styles,
    /:where\(section, article, main\)\[id\]\s*\{[\s\S]*?scroll-margin-top:\s*12rem/,
  );
  assert.match(
    styles,
    /\.homepage-occasion-section\s*\{[\s\S]*?container-name:\s*homepage-occasion/,
  );
  assert.match(styles, /@container homepage-occasion \(max-width:\s*639px\)/);
});
