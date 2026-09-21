export type HomepageHeroMediaType = 'image' | 'video';

export type HomepageHeroSlide = Readonly<{
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
  mediaType: HomepageHeroMediaType;
  mediaId: string;
  imageAlt: string | null;
  posterMediaId: string | null;
  videoDescription: string | null;
  imageNote: string | null;
}>;

export type HomepageHeroSlides = readonly HomepageHeroSlide[];

const slideFields = new Set([
  'id',
  'position',
  'enabled',
  'eyebrow',
  'headingLead',
  'highlightedPhrase',
  'headingTail',
  'body',
  'primaryActionLabel',
  'primaryActionHref',
  'secondaryActionLabel',
  'secondaryActionHref',
  'mediaType',
  'mediaId',
  'imageAlt',
  'posterMediaId',
  'videoDescription',
  'imageNote',
]);

const privateDestinations = [
  '/admin',
  '/api/admin',
  '/seller',
  '/rider',
  '/staff',
  '/local-testing',
] as const;

function freezeSlides(slides: readonly HomepageHeroSlide[]): HomepageHeroSlides {
  return Object.freeze(slides.map((slide) => Object.freeze({ ...slide })));
}

const currentHeroSlide: HomepageHeroSlide = {
  id: 'hero-nepal-craft',
  position: 1,
  enabled: true,
  eyebrow: 'Nepal’s handicraft marketplace',
  headingLead: 'Handmade today',
  highlightedPhrase: 'brighter',
  headingTail: 'Nepal.',
  body:
    'Discover authentic handmade products, support independent Nepali artisans, and bring home craft with a human story.',
  primaryActionLabel: 'Explore the collection',
  primaryActionHref: '/shop',
  secondaryActionLabel: 'Meet our makers',
  secondaryActionHref: '/#makers',
  mediaType: 'image',
  mediaId: 'system-nepal-craft-hero',
  imageAlt:
    'Nepali pottery, carved wood, woven craft and Dhaka textile overlooking temple rooftops and the Himalayas',
  posterMediaId: null,
  videoDescription: null,
  imageNote: 'Small hands · Big stories · Brighter tomorrows',
};

export const CURRENT_HERO_RECOVERY_SLIDES: HomepageHeroSlides = freezeSlides([
  currentHeroSlide,
]);

export const INITIAL_HOMEPAGE_HERO_SLIDES: HomepageHeroSlides = freezeSlides([
  currentHeroSlide,
  {
    id: 'hero-maker-stories',
    position: 2,
    enabled: true,
    eyebrow: 'Meet the spirit of Hastabazaar',
    headingLead: 'Every piece begins',
    highlightedPhrase: 'with a pair of hands.',
    headingTail: null,
    body:
      'Discover the care, patience, and imagination behind handmade work from Nepal.',
    primaryActionLabel: 'Meet our makers',
    primaryActionHref: '/#makers',
    secondaryActionLabel: 'Share your craft',
    secondaryActionHref: '/sell',
    mediaType: 'image',
    mediaId: 'system-maker-hands-hero',
    imageAlt:
      'Anonymous artisan hands carefully shaping a handmade Nepali craft piece',
    posterMediaId: null,
    videoDescription: null,
    imageNote: 'Made by hand · Shared with heart',
  },
  {
    id: 'hero-meaningful-gifts',
    position: 3,
    enabled: true,
    eyebrow: 'Thoughtful gifts from Nepal',
    headingLead: 'For every moment,',
    highlightedPhrase: 'something meaningful.',
    headingTail: null,
    body:
      'Find handmade gifts for celebrations, thank-yous, milestones, and everyday kindness.',
    primaryActionLabel: 'Shop gifts',
    primaryActionHref: '/#occasions',
    secondaryActionLabel: 'Explore the collection',
    secondaryActionHref: '/shop?category=gifts',
    mediaType: 'image',
    mediaId: 'system-meaningful-gifts-hero',
    imageAlt:
      'An editorial arrangement of Nepali pottery, paper, textile, and small handmade gifts',
    posterMediaId: null,
    videoDescription: null,
    imageNote: 'Chosen with care · Made to be remembered',
  },
]);

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function boundedText(
  label: string,
  value: unknown,
  maximum: number,
  options: { nullable?: boolean; allowNewline?: boolean } = {},
): string | null {
  if (options.nullable && value === null) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be text${options.nullable ? ' or null' : ''}.`);
  }
  if (value.length > maximum) {
    throw new RangeError(`${label} must be at most ${maximum} characters.`);
  }
  const disallowedControls = options.allowNewline
    ? /[\u0000-\u0009\u000b-\u001f\u007f]/u
    : /\p{Cc}/u;
  if (disallowedControls.test(value)) {
    throw new RangeError(`${label} cannot contain control characters.`);
  }
  if (value.includes('<') || value.includes('>')) {
    throw new RangeError(`${label} cannot contain markup.`);
  }
  if (options.allowNewline && value.split('\n').length > 2) {
    throw new RangeError(`${label} must use at most two lines.`);
  }
  return value.trim();
}

function safeIdentifier(label: string, value: unknown, allowBlank: boolean): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text.`);
  const result = value.trim();
  if (allowBlank && result === '') return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(result)) {
    throw new RangeError(`${label} must be a safe identifier.`);
  }
  return result;
}

export function safeHeroDestination(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Hero action destination must be text.');
  }
  const destination = value.trim();
  if (
    !destination.startsWith('/') ||
    destination.startsWith('//') ||
    destination.includes('\\') ||
    /\p{Cc}/u.test(destination)
  ) {
    throw new RangeError('Hero action destination must be a safe internal path.');
  }
  let parsed: URL;
  try {
    parsed = new URL(destination, 'https://hastabazaar.invalid');
  } catch {
    throw new RangeError('Hero action destination must be a safe internal path.');
  }
  if (parsed.origin !== 'https://hastabazaar.invalid') {
    throw new RangeError('Hero action destination must be a safe internal path.');
  }
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    throw new RangeError('Hero action destination must be a safe internal path.');
  }
  if (
    privateDestinations.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    throw new RangeError('Hero action destination cannot open a private area.');
  }
  return destination;
}

export function validateHomepageHeroDraft(value: unknown): HomepageHeroSlides {
  if (!Array.isArray(value)) {
    throw new TypeError('Homepage hero slides must be a list.');
  }
  if (value.length > 8) {
    throw new RangeError('Homepage hero slides may contain at most 8 cards.');
  }
  const ids = new Set<string>();
  const slides = value.map((entry, index): HomepageHeroSlide => {
    const candidate = plainObject(entry, `Hero slide ${index + 1}`);
    if (Object.keys(candidate).some((field) => !slideFields.has(field))) {
      throw new RangeError(`Hero slide ${index + 1} contains an unknown field.`);
    }
    const id = safeIdentifier('Hero slide ID', candidate.id, false);
    if (ids.has(id)) throw new RangeError('Homepage hero slides contain a duplicate ID.');
    ids.add(id);
    if (!Number.isSafeInteger(candidate.position) || candidate.position !== index + 1) {
      throw new RangeError('Homepage hero slide positions must be contiguous from 1.');
    }
    if (typeof candidate.enabled !== 'boolean') {
      throw new TypeError('Hero slide enabled must be true or false.');
    }
    if (candidate.mediaType !== 'image' && candidate.mediaType !== 'video') {
      throw new RangeError('Hero slide media type must be image or video.');
    }
    const primaryActionHref = boundedText(
      'Primary action destination',
      candidate.primaryActionHref,
      200,
    ) as string;
    const secondaryActionHref = boundedText(
      'Secondary action destination',
      candidate.secondaryActionHref,
      200,
      { nullable: true },
    );
    if (primaryActionHref) safeHeroDestination(primaryActionHref);
    if (secondaryActionHref) safeHeroDestination(secondaryActionHref);
    return Object.freeze({
      id,
      position: candidate.position as number,
      enabled: candidate.enabled,
      eyebrow: boundedText('Eyebrow', candidate.eyebrow, 60) as string,
      headingLead: boundedText('Heading lead', candidate.headingLead, 90) as string,
      highlightedPhrase: boundedText(
        'Highlighted phrase',
        candidate.highlightedPhrase,
        60,
        { nullable: true },
      ),
      headingTail: boundedText('Heading tail', candidate.headingTail, 90, {
        nullable: true,
      }),
      body: boundedText('Body copy', candidate.body, 240) as string,
      primaryActionLabel: boundedText(
        'Primary action label',
        candidate.primaryActionLabel,
        40,
      ) as string,
      primaryActionHref,
      secondaryActionLabel: boundedText(
        'Secondary action label',
        candidate.secondaryActionLabel,
        40,
        { nullable: true },
      ),
      secondaryActionHref,
      mediaType: candidate.mediaType,
      mediaId: safeIdentifier('Hero media ID', candidate.mediaId, true),
      imageAlt: boundedText('Image alternative text', candidate.imageAlt, 180, {
        nullable: true,
      }),
      posterMediaId:
        candidate.posterMediaId === null
          ? null
          : safeIdentifier('Video poster media ID', candidate.posterMediaId, true),
      videoDescription: boundedText(
        'Video accessible description',
        candidate.videoDescription,
        180,
        { nullable: true },
      ),
      imageNote: boundedText('Image note', candidate.imageNote, 100, {
        nullable: true,
        allowNewline: true,
      }),
    });
  });
  return Object.freeze(slides);
}

function requiredText(label: string, value: string | null, minimum: number): void {
  if (value === null || value.length < minimum) {
    throw new RangeError(`${label} must contain at least ${minimum} characters.`);
  }
}

export function assertHomepageHeroPublicationReady(
  value: HomepageHeroSlides,
): HomepageHeroSlides {
  const enabled = value.filter((slide) => slide.enabled);
  if (enabled.length < 3) {
    throw new RangeError('Homepage hero publication requires at least 3 enabled slides.');
  }
  if (enabled.length > 8) {
    throw new RangeError('Homepage hero publication supports at most 8 enabled slides.');
  }
  for (const slide of enabled) {
    requiredText('Eyebrow', slide.eyebrow, 3);
    requiredText('Heading lead', slide.headingLead, 3);
    requiredText('Body copy', slide.body, 20);
    requiredText('Primary action label', slide.primaryActionLabel, 2);
    requiredText('Primary action destination', slide.primaryActionHref, 1);
    safeHeroDestination(slide.primaryActionHref);
    requiredText('Hero media ID', slide.mediaId, 4);
    if ((slide.secondaryActionLabel === null) !== (slide.secondaryActionHref === null)) {
      throw new RangeError(
        'Secondary action label and destination must be supplied together.',
      );
    }
    if (slide.secondaryActionLabel !== null && slide.secondaryActionHref !== null) {
      requiredText('Secondary action label', slide.secondaryActionLabel, 2);
      requiredText('Secondary action destination', slide.secondaryActionHref, 1);
      safeHeroDestination(slide.secondaryActionHref);
    }
    if (slide.mediaType === 'image') {
      requiredText('Image alternative text', slide.imageAlt, 10);
      if (slide.posterMediaId !== null || slide.videoDescription !== null) {
        throw new RangeError('Image slides cannot contain video-only fields.');
      }
    } else {
      requiredText('Video poster media ID', slide.posterMediaId, 4);
      requiredText('Video accessible description', slide.videoDescription, 10);
      if (slide.imageAlt !== null) {
        throw new RangeError('Video slides cannot contain image alternative text.');
      }
    }
  }
  return value;
}
