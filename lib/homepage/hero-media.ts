import type { SharpConstructor } from '../../node_modules/sharp/dist/index.d.mts';

import { readMp4Metadata } from './mp4-metadata';

const imageMimeByFormat = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type PreparedHeroMedia = Readonly<{
  bytes: Uint8Array;
  mimeType: 'image/webp' | 'video/mp4';
  width: number;
  height: number;
  durationSeconds: number | null;
  originalName: string;
}>;

export class HomepageHeroMediaError extends Error {}

function originalName(file: File): string {
  const value = file.name.trim();
  if (!value || value.length > 255 || /[\p{Cc}<>/\\]/u.test(value)) {
    throw new HomepageHeroMediaError('The original media filename is invalid.');
  }
  return value;
}

async function prepareImage(file: File, name: string): Promise<PreparedHeroMedia> {
  if (!file.size || file.size > 8 * 1024 * 1024) {
    throw new HomepageHeroMediaError(
      'Use a JPG, PNG, or WebP hero image up to 8 MB.',
    );
  }
  const input = new Uint8Array(await file.arrayBuffer());
  try {
    const sharp = (await import('sharp')).default as SharpConstructor;
    const image = sharp(input, { limitInputPixels: 20_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new HomepageHeroMediaError('The image could not be safely read.');
    }
    if (metadata.width > 8_000 || metadata.height > 8_000) {
      throw new HomepageHeroMediaError(
        'Hero image dimensions must not exceed 8,000 pixels per side.',
      );
    }
    const expectedType =
      imageMimeByFormat[metadata.format as keyof typeof imageMimeByFormat];
    if (!expectedType) {
      throw new HomepageHeroMediaError('Use a valid JPG, PNG, or WebP image.');
    }
    if (expectedType !== file.type) {
      throw new HomepageHeroMediaError(
        'The declared image type does not match its decoded content.',
      );
    }
    const output = await image
      .rotate()
      .resize({
        width: 2_400,
        height: 1_600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer();
    if (output.length > 5 * 1024 * 1024) {
      throw new HomepageHeroMediaError(
        'The normalized hero image exceeds the 5 MB display limit.',
      );
    }
    const outputMetadata = await sharp(output).metadata();
    if (!outputMetadata.width || !outputMetadata.height) {
      throw new HomepageHeroMediaError('The normalized image could not be verified.');
    }
    return Object.freeze({
      bytes: new Uint8Array(output),
      mimeType: 'image/webp',
      width: outputMetadata.width,
      height: outputMetadata.height,
      durationSeconds: null,
      originalName: name,
    });
  } catch (error) {
    if (error instanceof HomepageHeroMediaError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new HomepageHeroMediaError(
        'Hero images must contain at most 20 million pixels.',
      );
    }
    throw new HomepageHeroMediaError(
      'The image could not be safely read. Use a valid image with at most 20 million pixels.',
    );
  }
}

async function prepareVideo(file: File, name: string): Promise<PreparedHeroMedia> {
  if (!file.size || file.size > 20 * 1024 * 1024) {
    throw new HomepageHeroMediaError('Use an MP4 hero video up to 20 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let metadata;
  try {
    metadata = readMp4Metadata(bytes);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new HomepageHeroMediaError(
      error instanceof Error ? error.message : 'Invalid MP4 container.',
    );
  }
  return Object.freeze({
    bytes,
    mimeType: 'video/mp4',
    width: metadata.width,
    height: metadata.height,
    durationSeconds: metadata.durationSeconds,
    originalName: name,
  });
}

export async function prepareHomepageHeroUpload(
  file: File,
): Promise<PreparedHeroMedia> {
  const name = originalName(file);
  if (file.type === 'video/mp4') return prepareVideo(file, name);
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return prepareImage(file, name);
  }
  throw new HomepageHeroMediaError(
    'Use a supported image or MP4 file for homepage hero media.',
  );
}
