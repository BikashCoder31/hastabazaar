import sharp from 'sharp';
import { stat } from 'node:fs/promises';

const brandDirectory = new URL('../public/brand/', import.meta.url);
const lockupSource = new URL('hastabazaar-logo-lockup.png', brandDirectory);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

function windowsPath(url) {
  return url.pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

async function report(name) {
  const file = new URL(name, brandDirectory);
  console.log(`${name}: ${(await stat(file)).size} bytes`);
}

// Compact transparent lockups for the footer, about page, and brand downloads.
await sharp(windowsPath(lockupSource))
  .resize({ width: 640, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toFile(windowsPath(new URL('hastabazaar-logo-lockup-640.png', brandDirectory)));
await report('hastabazaar-logo-lockup-640.png');

await sharp(windowsPath(lockupSource))
  .resize({ width: 640, withoutEnlargement: true })
  .webp({ quality: 92, alphaQuality: 100, smartSubsample: true })
  .toFile(windowsPath(new URL('hastabazaar-logo-lockup-640.webp', brandDirectory)));
await report('hastabazaar-logo-lockup-640.webp');

// The approved source artwork is 1254px square. This crop isolates the HB monogram and
// removes the wordmark/tagline, which become illegible in navigation-sized use.
const croppedMark = await sharp(windowsPath(lockupSource))
  .extract({ left: 185, top: 105, width: 900, height: 785 })
  .png()
  .toBuffer();

const trimmedMark = await sharp(croppedMark)
  .trim({ background: transparent })
  .png()
  .toBuffer();

const mark = await sharp(trimmedMark)
  .resize(512, 512, {
    fit: 'contain',
    background: transparent,
    kernel: sharp.kernel.lanczos3,
  })
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(mark).toFile(windowsPath(new URL('hastabazaar-mark-512.png', brandDirectory)));
await report('hastabazaar-mark-512.png');

for (const [name, size] of [
  ['hastabazaar-mark-192.png', 192],
  ['hastabazaar-mark-96.png', 96],
  ['hastabazaar-icon-32.png', 32],
  ['hastabazaar-apple-touch-icon.png', 180],
]) {
  await sharp(mark)
    .resize(size, size, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(windowsPath(new URL(name, brandDirectory)));
  await report(name);
}
