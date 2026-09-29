import { createHash } from 'node:crypto';
import { prepareHomepageHeroUpload, HomepageHeroMediaError } from '../homepage/hero-media';

export class CategoryImageError extends Error {}

export async function prepareCategoryImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new CategoryImageError('Use a JPG, PNG, or WebP category image up to 8 MB.');
  try {
    const media = await prepareHomepageHeroUpload(file);
    if (media.mimeType !== 'image/webp') throw new CategoryImageError('Use a raster image for the category.');
    return { ...media, contentHash: createHash('sha256').update(media.bytes).digest('hex') };
  } catch (error) {
    if (error instanceof HomepageHeroMediaError) throw new CategoryImageError(error.message.replace(/hero/gi, 'category'));
    throw error;
  }
}
