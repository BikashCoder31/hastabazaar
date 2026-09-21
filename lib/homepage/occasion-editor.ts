import type { HomepageOccasionSlide } from './occasion-slides';

function renumber(
  slides: readonly HomepageOccasionSlide[],
): HomepageOccasionSlide[] {
  return slides.map((slide, index) => ({ ...slide, position: index + 1 }));
}

function find(
  slides: readonly HomepageOccasionSlide[],
  id: string,
): HomepageOccasionSlide {
  const slide = slides.find((item) => item.id === id);
  if (!slide) throw new RangeError('Homepage occasion slide was not found.');
  return slide;
}

export function addHomepageOccasionSlide(
  slides: readonly HomepageOccasionSlide[],
  id: string,
): HomepageOccasionSlide[] {
  if (slides.length >= 8)
    throw new RangeError('Homepage occasion slides support at most 8 slides.');
  const slideId = id.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(slideId))
    throw new RangeError('New slide ID must be a safe identifier.');
  if (slides.some((slide) => slide.id === slideId))
    throw new RangeError('Homepage occasion slide IDs must be unique.');
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
      supportingNote: null,
      cards: [
        { kicker: '', title: '', destination: '', icon: 'gift', theme: 'warm' },
        {
          kicker: '',
          title: '',
          destination: '',
          icon: 'hand-heart',
          theme: 'navy',
        },
      ],
    },
  ];
}

export function moveHomepageOccasionSlide(
  slides: readonly HomepageOccasionSlide[],
  id: string,
  direction: 'up' | 'down',
): HomepageOccasionSlide[] {
  find(slides, id);
  const next = slides.map((slide) => ({ ...slide }));
  const from = next.findIndex((slide) => slide.id === id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to >= 0 && to < next.length)
    [next[from], next[to]] = [next[to]!, next[from]!];
  return renumber(next);
}

export function setHomepageOccasionSlideEnabled(
  slides: readonly HomepageOccasionSlide[],
  id: string,
  enabled: boolean,
): HomepageOccasionSlide[] {
  find(slides, id);
  return slides.map((slide) =>
    slide.id === id ? { ...slide, enabled } : { ...slide },
  );
}

export function removeHomepageOccasionSlide(
  slides: readonly HomepageOccasionSlide[],
  id: string,
): HomepageOccasionSlide[] {
  find(slides, id);
  return renumber(slides.filter((slide) => slide.id !== id));
}
