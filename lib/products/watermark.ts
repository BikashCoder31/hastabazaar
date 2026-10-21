import type { SharpConstructor } from '../../node_modules/sharp/dist/index.d.mts';
import {
  validateProductWatermarkPolicy,
  type ProductWatermarkPolicy,
} from './watermark-policy';
import {
  createImageWorkQueue,
  ImageWorkQueueFullError,
} from './image-work-queue';
export const maximumProductWatermarkBytes = 5 * 1024 * 1024;
export const productWatermarkRendererVersion = 'wordmark-v1';
export class ProductWatermarkError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503 = 400,
  ) {
    super(message);
    this.name = 'ProductWatermarkError';
  }
}
export type RenderedProductPhoto = Readonly<{
  bytes: Uint8Array;
  mimeType: 'image/webp';
  width: number;
  height: number;
}>;
// Fixed vector outlines spell HastaBazaar without a runtime font or remote asset.
const glyphs: Record<string, string> = {
  H: 'M1 1V17M11 1V17M1 9H11',
  a: 'M10 6V17M10 9C8 3 1 5 1 11C1 18 8 19 10 13',
  s: 'M10 7C7 3 1 5 1 8C1 12 10 10 10 14C10 18 3 19 1 15',
  t: 'M5 1V14C5 18 9 18 11 16M1 6H10',
  B: 'M1 17V1H6C13 1 13 9 6 9H1M6 9C14 9 14 17 6 17H1',
  z: 'M1 6H11L1 17H11',
  r: 'M1 17V6M1 10C3 5 7 4 11 6',
};
function wordmarkSvg(
  width: number,
  height: number,
  opacity: number,
): Uint8Array {
  const letters = 'HastaBazaar'
    .split('')
    .map(
      (letter, index) =>
        '<path transform="translate(' +
        index * 14 +
        ' 0)" d="' +
        glyphs[letter] +
        '"/>',
    )
    .join('');
  return new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="-2 -2 158 23"><g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="' +
      opacity +
      '"><g stroke="#fff" stroke-width="3.7">' +
      letters +
      '</g><g stroke="#26211b" stroke-width="1.7">' +
      letters +
      '</g></g></svg>',
  );
}
const renderQueue = createImageWorkQueue(2, 16);
export async function renderProductWatermark(
  input: Uint8Array,
  mimeType: string,
  candidate: ProductWatermarkPolicy,
): Promise<RenderedProductPhoto> {
  const policy = validateProductWatermarkPolicy(candidate);
  if (
    !input.byteLength ||
    input.byteLength > maximumProductWatermarkBytes ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
  )
    throw new ProductWatermarkError(
      'Use a JPG, PNG, or WebP photo up to 5 MB.',
    );
  try {
    return await renderQueue(async () => {
      const sharp = (await import('sharp')).default as SharpConstructor;
      if (typeof sharp !== 'function')
        throw new ProductWatermarkError(
          'Product image processing is unavailable.',
          503,
        );
      const image = sharp(input, {
        limitInputPixels: 20_000_000,
        animated: false,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      const expected = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      }[metadata.format as 'jpeg' | 'png' | 'webp'];
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width > 8000 ||
        metadata.height > 8000 ||
        (metadata.pages ?? 1) !== 1 ||
        expected !== mimeType
      )
        throw new ProductWatermarkError(
          'Use a valid nonanimated photo with at most 20 million pixels and 8,000 pixels per side.',
        );
      // Apply EXIF orientation before choosing a corner. Re-encoding strips private metadata.
      const normalized = await image
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const oriented = await sharp(normalized).metadata();
      const width = oriented.width!,
        height = oriented.height!;
      let pipeline = sharp(normalized);
      if (policy.enabled) {
        const markWidth = Math.max(
          1,
          Math.min(width, Math.round((width * policy.sizePercent) / 100)),
        );
        const markHeight = Math.max(
          1,
          Math.min(height, Math.round((markWidth * 23) / 158)),
        );
        const inset = Math.max(
          0,
          Math.min(
            Math.round(Math.min(width, height) * 0.025),
            width - markWidth,
            height - markHeight,
          ),
        );
        const left = policy.position.endsWith('right')
          ? width - markWidth - inset
          : inset;
        const top = policy.position.startsWith('bottom')
          ? height - markHeight - inset
          : inset;
        pipeline = pipeline.composite([
          {
            input: wordmarkSvg(
              markWidth,
              markHeight,
              policy.opacityPercent / 100,
            ),
            left,
            top,
          },
        ]);
      }
      const output = await pipeline.webp({ quality: 85 }).toBuffer();
      if (
        !output.byteLength ||
        output.byteLength > maximumProductWatermarkBytes
      )
        throw new ProductWatermarkError(
          'The display photo exceeds the 5 MB limit.',
        );
      return {
        bytes: new Uint8Array(output),
        mimeType: 'image/webp' as const,
        width,
        height,
      };
    });
  } catch (error) {
    if (error instanceof ProductWatermarkError) throw error;
    if (error instanceof ImageWorkQueueFullError)
      throw new ProductWatermarkError(error.message, 503);
    if (
      error instanceof Error &&
      /sharp|native|module|binding|function/i.test(error.message)
    )
      throw new ProductWatermarkError(
        'Product image processing is unavailable.',
        503,
      );
    throw new ProductWatermarkError(
      'The product photo could not be safely decoded.',
    );
  }
}
