const staticAssets = new Map<string, { objectKey: string; path: string }>([
  [
    'system-nepal-craft-hero',
    {
      objectKey: 'public/homepage/nepal-craft-hero.webp',
      path: '/homepage/nepal-craft-hero.webp',
    },
  ],
  [
    'system-maker-hands-hero',
    {
      objectKey: 'public/homepage/maker-hands-hero.webp',
      path: '/homepage/maker-hands-hero.webp',
    },
  ],
  [
    'system-meaningful-gifts-hero',
    {
      objectKey: 'public/homepage/meaningful-gifts-hero.webp',
      path: '/homepage/meaningful-gifts-hero.webp',
    },
  ],
]);

/** The same fixed registry used by rendering and portable read-only backups. */
export function homepageHeroStaticAssets() {
  return Object.freeze(
    [...staticAssets].map(([id, asset]) => Object.freeze({ id, ...asset })),
  );
}

export function homepageHeroStaticAssetPath(
  media: { id: string; objectKey: string; mimeType: 'image/webp' | 'video/mp4' },
): string | null {
  const expected = staticAssets.get(media.id);
  return expected &&
    expected.objectKey === media.objectKey &&
    media.mimeType === 'image/webp'
    ? expected.path
    : null;
}
