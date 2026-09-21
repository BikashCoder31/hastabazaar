export type OccasionPauseReason =
  | 'manual'
  | 'hover'
  | 'focus'
  | 'document-hidden'
  | 'reduced-motion';
export type OccasionSelectionKind = 'manual' | 'automatic';

export function nextOccasionIndex(
  current: number,
  count: number,
  direction: 'next' | 'previous',
): number {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new RangeError('Occasion slide count must be a positive integer.');
  if (!Number.isSafeInteger(current) || current < 0 || current >= count)
    throw new RangeError(
      'Current occasion slide index is outside the slide count.',
    );
  return direction === 'next'
    ? (current + 1) % count
    : (current - 1 + count) % count;
}

export const occasionAdvanceDelayMs = () => 7_000;

export function shouldAutoplayOccasions(reasons: ReadonlySet<string>): boolean {
  return reasons.size === 0;
}

export function occasionSelectionAnnouncement(
  index: number,
  count: number,
  heading: string,
  selection: OccasionSelectionKind,
): string {
  if (selection === 'automatic') return '';
  if (!Number.isSafeInteger(index) || index < 0 || index >= count)
    throw new RangeError(
      'Occasion announcement index is outside the slide count.',
    );
  return `Slide ${index + 1} of ${count}: ${heading.trim() || 'Gifting story'}`;
}
