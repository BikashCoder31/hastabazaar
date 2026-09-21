import type { HomepageHeroMediaType } from './hero-slides';

export type HeroPauseReason =
  | 'manual'
  | 'hover'
  | 'focus'
  | 'document-hidden'
  | 'reduced-motion';

export type HeroSelectionKind = 'manual' | 'automatic';

export function nextHeroIndex(
  current: number,
  count: number,
  direction: 'next' | 'previous',
): number {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError('Hero slide count must be a positive integer.');
  }
  if (!Number.isSafeInteger(current) || current < 0 || current >= count) {
    throw new RangeError('Current hero slide index is outside the slide count.');
  }
  return direction === 'next'
    ? (current + 1) % count
    : (current - 1 + count) % count;
}

export function heroAdvanceDelayMs(mediaType: HomepageHeroMediaType): number {
  if (mediaType === 'image') return 6_000;
  if (mediaType === 'video') return 15_000;
  throw new RangeError('Unsupported homepage hero media type.');
}

export function shouldAutoplayHero(
  pauseReasons: ReadonlySet<HeroPauseReason>,
): boolean {
  return pauseReasons.size === 0;
}

export function nextHeroTimerRevision(
  revision: number,
  selection: HeroSelectionKind,
): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Hero timer revision must be a non-negative integer.');
  }
  return selection === 'manual' ? revision + 1 : revision;
}

export function heroSelectionAnnouncement(
  index: number,
  count: number,
  heading: string,
  selection: HeroSelectionKind,
): string {
  if (selection === 'automatic') return '';
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    throw new RangeError('Hero announcement index is outside the slide count.');
  }
  const title = heading.trim() || 'Featured story';
  return `Slide ${index + 1} of ${count}: ${title}`;
}
