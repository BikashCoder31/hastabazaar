import {
  assertHomepageHeroPublicationReady,
  validateHomepageHeroDraft,
  type HomepageHeroSlide,
  type HomepageHeroSlides,
} from './hero-slides';

function renumber(slides: readonly HomepageHeroSlide[]): HomepageHeroSlide[] {
  return slides.map((slide, index) => ({ ...slide, position: index + 1 }));
}

function ensureIdentifier(id: string): string {
  const value = id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(value)) {
    throw new RangeError('New slide ID must be a safe identifier.');
  }
  return value;
}

export function addHomepageHeroSlide(
  slides: readonly HomepageHeroSlide[],
  id: string,
): HomepageHeroSlide[] {
  if (slides.length >= 8) {
    throw new RangeError('Homepage hero slides support at most 8 cards.');
  }
  const slideId = ensureIdentifier(id);
  if (slides.some((slide) => slide.id === slideId)) {
    throw new RangeError('Homepage hero slide IDs must be unique.');
  }
  return [
    ...slides.map((slide) => ({ ...slide })),
    {
      id: slideId,
      position: slides.length + 1,
      enabled: false,
      eyebrow: '',
      headingLead: '',
      highlightedPhrase: null,
      headingTail: null,
      body: '',
      primaryActionLabel: '',
      primaryActionHref: '',
      secondaryActionLabel: null,
      secondaryActionHref: null,
      mediaType: 'image',
      mediaId: '',
      imageAlt: null,
      posterMediaId: null,
      videoDescription: null,
      imageNote: null,
    },
  ];
}

export function moveHomepageHeroSlide(
  slides: readonly HomepageHeroSlide[],
  id: string,
  direction: 'up' | 'down',
): HomepageHeroSlide[] {
  const next = slides.map((slide) => ({ ...slide }));
  const from = next.findIndex((slide) => slide.id === id);
  if (from < 0) throw new RangeError('Homepage hero slide was not found.');
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= next.length) return renumber(next);
  [next[from], next[to]] = [next[to]!, next[from]!];
  return renumber(next);
}

function enabledCount(slides: readonly HomepageHeroSlide[]): number {
  return slides.filter((slide) => slide.enabled).length;
}

export function removeHomepageHeroSlide(
  slides: readonly HomepageHeroSlide[],
  id: string,
): HomepageHeroSlide[] {
  const target = slides.find((slide) => slide.id === id);
  if (!target) throw new RangeError('Homepage hero slide was not found.');
  if (target.enabled && enabledCount(slides) <= 3) {
    throw new RangeError('Keep at least 3 enabled homepage hero slides.');
  }
  return renumber(slides.filter((slide) => slide.id !== id));
}

export function setHomepageHeroSlideEnabled(
  slides: readonly HomepageHeroSlide[],
  id: string,
  enabled: boolean,
): HomepageHeroSlide[] {
  const target = slides.find((slide) => slide.id === id);
  if (!target) throw new RangeError('Homepage hero slide was not found.');
  if (!enabled && target.enabled && enabledCount(slides) <= 3) {
    throw new RangeError('Keep at least 3 enabled homepage hero slides.');
  }
  return slides.map((slide) =>
    slide.id === id ? { ...slide, enabled } : { ...slide },
  );
}

export type HomepageHeroReadiness = Readonly<{
  draftValid: boolean;
  publicationReady: boolean;
  message: string;
  slides: HomepageHeroSlides | null;
}>;

export function homepageHeroReadiness(value: unknown): HomepageHeroReadiness {
  try {
    const slides = validateHomepageHeroDraft(value);
    try {
      assertHomepageHeroPublicationReady(slides);
      return {
        draftValid: true,
        publicationReady: true,
        message: `${slides.filter((slide) => slide.enabled).length} enabled slides are ready for media verification.`,
        slides,
      };
    } catch (error) {
      return {
        draftValid: true,
        publicationReady: false,
        message: error instanceof Error ? error.message : 'Slides are incomplete.',
        slides,
      };
    }
  } catch (error) {
    return {
      draftValid: false,
      publicationReady: false,
      message: error instanceof Error ? error.message : 'Slide draft is invalid.',
      slides: null,
    };
  }
}
