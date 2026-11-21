import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  heroAdvanceDelayMs,
  heroSelectionAnnouncement,
  nextHeroIndex,
  nextHeroTimerRevision,
  shouldAutoplayHero,
  type HeroPauseReason,
} from '../lib/homepage/hero-autoplay';

void test('hero index advances, reverses, and wraps in configured order', () => {
  assert.equal(nextHeroIndex(0, 3, 'next'), 1);
  assert.equal(nextHeroIndex(2, 3, 'next'), 0);
  assert.equal(nextHeroIndex(0, 3, 'previous'), 2);
  assert.equal(nextHeroIndex(1, 3, 'previous'), 0);
  assert.throws(() => nextHeroIndex(0, 0, 'next'), /slide count/i);
});

void test('both image and paused video stories use the requested six-and-a-half-second delay', () => {
  assert.equal(heroAdvanceDelayMs('image'), 6_500);
  assert.equal(heroAdvanceDelayMs('video'), 6_500);
});

void test('every pause reason stops autoplay and an empty set permits it', () => {
  const reasons: readonly HeroPauseReason[] = [
    'manual',
    'hover',
    'focus',
    'document-hidden',
    'reduced-motion',
  ];
  assert.equal(shouldAutoplayHero(new Set()), true);
  for (const reason of reasons) {
    assert.equal(shouldAutoplayHero(new Set([reason])), false);
  }
});

void test('manual selection resets the timer revision while automatic selection does not announce', () => {
  assert.equal(nextHeroTimerRevision(4, 'manual'), 5);
  assert.equal(nextHeroTimerRevision(4, 'automatic'), 4);
  assert.equal(
    heroSelectionAnnouncement(1, 3, 'Every piece begins', 'manual'),
    'Slide 2 of 3: Every piece begins',
  );
  assert.equal(
    heroSelectionAnnouncement(2, 3, 'For every moment', 'automatic'),
    '',
  );
});

void test('carousel presentation keeps manual browsing and playable videos with safe offscreen slides', async () => {
  const source = await readFile(
    new URL(
      '../components/homepage/homepage-hero-carousel.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /opts=\{\{ loop: true \}\}/);
  assert.match(source, /aria-label="Featured Hastabazaar stories"/);
  assert.match(source, /aria-label=\{`Slide \$\{index \+ 1\} of/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /video\.currentTime = 0/);
  assert.match(source, /muted/);
  assert.match(source, /playsInline/);
  assert.match(source, /loading=\{index === 0 \? 'eager' : 'lazy'\}/);
  assert.match(source, /poster=\{posterUrl\}/);
  assert.match(source, /preload=\{index === current \? 'metadata' : 'none'\}/);
  assert.match(source, /data-media-frame="cover"/);
  assert.equal((source.match(/data-media-mode="cover"/g) ?? []).length, 2);
  assert.match(
    source,
    /const mediaUrl = `\/api\/homepage\/hero-media\/\$\{encodeURIComponent\(slide\.mediaId\)\}`;/,
  );
  assert.match(
    source,
    /`\/api\/homepage\/hero-media\/\$\{encodeURIComponent\(slide\.posterMediaId\)\}`/,
  );
  assert.match(source, /controls/);
  assert.match(source, /inert=\{index === current \? undefined : true\}/);
  assert.doesNotMatch(source, /video\.play\(/);
});
