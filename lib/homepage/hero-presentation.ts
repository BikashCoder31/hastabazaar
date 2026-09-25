// Container queries let an authenticated preview represent a fixed public
// viewport even when the admin editor is much narrower than that viewport.
export const heroLayoutClass =
  'mx-auto grid min-h-0 max-w-[1600px] @[1024px]/hero:min-h-[36rem] @[1024px]/hero:grid-cols-[48%_52%]';
export const heroMediaVisualClass =
  'homepage-hero-media absolute inset-0 z-[1] object-center brightness-[0.82] saturate-[0.82] contrast-[0.96]';
export const heroNoteClass =
  'homepage-hero-image-note absolute left-[16%] top-[16%] z-[3] max-w-[14rem] -rotate-2 whitespace-pre-line rounded-2xl border border-white/35 bg-[#eee5d8]/20 px-4 py-3 text-left font-heading text-base font-semibold italic leading-tight text-[#0b3156] drop-shadow-[0_2px_10px_rgba(255,255,255,0.75)] shadow-[0_12px_34px_rgba(5,25,43,0.2)] backdrop-blur-sm @[640px]/hero:max-w-[17rem] @[640px]/hero:px-5 @[640px]/hero:py-4 @[640px]/hero:text-xl @[1024px]/hero:max-w-[19rem] @[1024px]/hero:text-2xl';
export const heroPreviewWidths = { desktop: 1440, mobile: 390 } as const;
