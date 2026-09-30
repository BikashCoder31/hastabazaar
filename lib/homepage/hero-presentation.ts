// Container queries let an authenticated preview represent a fixed public
// viewport even when the admin editor is much narrower than that viewport.
export const heroLayoutClass =
  'homepage-hero-layout mx-auto grid min-h-0 max-w-[1600px]';
export const heroMediaVisualClass =
  'homepage-hero-media absolute inset-0 z-[1] object-center brightness-[0.82] saturate-[0.82] contrast-[0.96]';
export const heroNoteClass =
  'homepage-hero-image-note z-[3] rounded-xl font-heading font-semibold italic text-[#0b3156]';
export const heroPreviewWidths = { desktop: 1440, mobile: 390 } as const;
