import { safeHeroDestination } from './hero-slides';

export const homepageOccasionIcons = [
  'gift',
  'cake',
  'heart',
  'sparkles',
  'hand-heart',
  'flower',
  'home',
  'plane',
  'paintbrush',
  'briefcase',
] as const;
export type HomepageOccasionIcon = (typeof homepageOccasionIcons)[number];

export const homepageOccasionThemes = [
  'warm',
  'crimson',
  'navy',
  'sage',
] as const;
export type HomepageOccasionTheme = (typeof homepageOccasionThemes)[number];

export type HomepageOccasionCard = Readonly<{
  kicker: string;
  title: string;
  destination: string;
  icon: HomepageOccasionIcon;
  theme: HomepageOccasionTheme;
}>;

export type HomepageOccasionSlide = Readonly<{
  id: string;
  position: number;
  enabled: boolean;
  eyebrow: string;
  headingLead: string;
  highlightedPhrase: string | null;
  headingTail: string | null;
  body: string;
  supportingNote: string | null;
  cards: readonly [HomepageOccasionCard, HomepageOccasionCard];
}>;

export type HomepageOccasionSlides = readonly HomepageOccasionSlide[];

const currentOccasionSlide: HomepageOccasionSlide = {
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
};

const humanStorySlide: HomepageOccasionSlide = {
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
};

function freezeSlides(
  slides: readonly HomepageOccasionSlide[],
): HomepageOccasionSlides {
  return Object.freeze(
    slides.map((slide) =>
      Object.freeze({
        ...slide,
        cards: Object.freeze(
          slide.cards.map((card) => Object.freeze({ ...card })),
        ) as unknown as readonly [HomepageOccasionCard, HomepageOccasionCard],
      }),
    ),
  );
}

export const CURRENT_OCCASION_RECOVERY_SLIDES = freezeSlides([
  currentOccasionSlide,
]);
export const INITIAL_HOMEPAGE_OCCASION_SLIDES = freezeSlides([
  currentOccasionSlide,
  humanStorySlide,
]);

const slideFields = new Set([
  'id',
  'position',
  'enabled',
  'eyebrow',
  'headingLead',
  'highlightedPhrase',
  'headingTail',
  'body',
  'supportingNote',
  'cards',
]);
const cardFields = new Set(['kicker', 'title', 'destination', 'icon', 'theme']);

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(
  label: string,
  value: unknown,
  maximum: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be text${nullable ? ' or null' : ''}.`);
  }
  if (value.length > maximum) {
    throw new RangeError(`${label} must be at most ${maximum} characters.`);
  }
  if (/\p{Cc}|[<>]/u.test(value)) {
    throw new RangeError(
      `${label} cannot contain markup or control characters.`,
    );
  }
  return value.trim();
}

function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(value.trim())
  ) {
    throw new RangeError('Occasion slide ID must be a safe identifier.');
  }
  return value.trim();
}

function card(
  value: unknown,
  slideNumber: number,
  cardNumber: number,
): HomepageOccasionCard {
  const candidate = plainObject(
    value,
    `Occasion slide ${slideNumber} card ${cardNumber}`,
  );
  if (Object.keys(candidate).some((field) => !cardFields.has(field))) {
    throw new RangeError(
      `Occasion slide ${slideNumber} card ${cardNumber} contains an unknown field.`,
    );
  }
  const destination = text(
    'Card destination',
    candidate.destination,
    200,
  ) as string;
  if (destination) safeHeroDestination(destination);
  if (!homepageOccasionIcons.includes(candidate.icon as HomepageOccasionIcon)) {
    throw new RangeError('Occasion card icon must use an approved icon.');
  }
  if (
    !homepageOccasionThemes.includes(candidate.theme as HomepageOccasionTheme)
  ) {
    throw new RangeError(
      'Occasion card theme must use an approved visual theme.',
    );
  }
  return Object.freeze({
    kicker: text('Card kicker', candidate.kicker, 60) as string,
    title: text('Card title', candidate.title, 60) as string,
    destination,
    icon: candidate.icon as HomepageOccasionIcon,
    theme: candidate.theme as HomepageOccasionTheme,
  });
}

export function validateHomepageOccasionDraft(
  value: unknown,
): HomepageOccasionSlides {
  if (!Array.isArray(value))
    throw new TypeError('Homepage occasion slides must be a list.');
  if (value.length > 8)
    throw new RangeError(
      'Homepage occasion slides may contain at most 8 slides.',
    );
  const ids = new Set<string>();
  const slides = value.map((entry, index): HomepageOccasionSlide => {
    const candidate = plainObject(entry, `Occasion slide ${index + 1}`);
    if (Object.keys(candidate).some((field) => !slideFields.has(field))) {
      throw new RangeError(
        `Occasion slide ${index + 1} contains an unknown field.`,
      );
    }
    const id = identifier(candidate.id);
    if (ids.has(id))
      throw new RangeError('Homepage occasion slides contain a duplicate ID.');
    ids.add(id);
    if (
      !Number.isSafeInteger(candidate.position) ||
      candidate.position !== index + 1
    ) {
      throw new RangeError(
        'Homepage occasion slide positions must be unique and contiguous from 1.',
      );
    }
    if (typeof candidate.enabled !== 'boolean')
      throw new TypeError('Occasion slide enabled must be true or false.');
    if (!Array.isArray(candidate.cards) || candidate.cards.length !== 2) {
      throw new RangeError(
        'Each homepage occasion slide must contain exactly two action cards.',
      );
    }
    return Object.freeze({
      id,
      position: candidate.position as number,
      enabled: candidate.enabled,
      eyebrow: text('Eyebrow', candidate.eyebrow, 60) as string,
      headingLead: text('Heading lead', candidate.headingLead, 90) as string,
      highlightedPhrase: text(
        'Highlighted phrase',
        candidate.highlightedPhrase,
        70,
        true,
      ),
      headingTail: text('Heading tail', candidate.headingTail, 90, true),
      body: text('Body copy', candidate.body, 260) as string,
      supportingNote: text(
        'Supporting note',
        candidate.supportingNote,
        120,
        true,
      ),
      cards: Object.freeze([
        card(candidate.cards[0], index + 1, 1),
        card(candidate.cards[1], index + 1, 2),
      ]) as readonly [HomepageOccasionCard, HomepageOccasionCard],
    });
  });
  return Object.freeze(slides);
}

function required(label: string, value: string | null, minimum: number): void {
  if (value === null || value.length < minimum) {
    throw new RangeError(
      `${label} must contain at least ${minimum} characters.`,
    );
  }
}

export function assertHomepageOccasionPublicationReady(
  value: HomepageOccasionSlides,
): HomepageOccasionSlides {
  const enabled = value.filter((slide) => slide.enabled);
  if (enabled.length < 2) {
    throw new RangeError(
      'Homepage occasion publication requires at least 2 enabled slides.',
    );
  }
  if (enabled.length > 8) {
    throw new RangeError(
      'Homepage occasion publication supports at most 8 enabled slides.',
    );
  }
  for (const slide of enabled) {
    required('Eyebrow', slide.eyebrow, 3);
    required('Heading lead', slide.headingLead, 3);
    required('Body copy', slide.body, 20);
    if (slide.highlightedPhrase !== null)
      required('Highlighted phrase', slide.highlightedPhrase, 2);
    if (slide.headingTail !== null)
      required('Heading tail', slide.headingTail, 2);
    if (slide.supportingNote !== null)
      required('Supporting note', slide.supportingNote, 3);
    for (const action of slide.cards) {
      required('Card kicker', action.kicker, 2);
      required('Card title', action.title, 2);
      required('Card destination', action.destination, 1);
      safeHeroDestination(action.destination);
    }
  }
  return value;
}
