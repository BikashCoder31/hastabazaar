import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mediaSizes } from '../lib/media/responsive-media';
// Interpret the declared CSS lengths independently from the layout dimensions.
function hinted(sizes: string, viewport: number): number {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] === '(') depth++;
    if (sizes[i] === ')') depth--;
    if (sizes[i] === ',' && depth === 0) {
      entries.push(sizes.slice(start, i).trim());
      start = i + 1;
    }
  }
  entries.push(sizes.slice(start).trim());
  const selected = entries.find((entry) => {
    const m = entry.match(/^\(min-width: (\d+)px\)/);
    return !m || viewport >= Number(m[1]);
  })!;
  const expression = selected
    .replace(/^\(min-width: \d+px\) /, '')
    .replace(/([\d.]+)vw/g, (_, n) => String((Number(n) * viewport) / 100))
    .replace(/([\d.]+)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/\bclamp\(/g, 'clamp(');
  assert.match(expression, /^[\d\s.,()+*/\-A-Za-z]+$/);
  const tokens = expression.match(/\d+(?:\.\d+)?|[A-Za-z]+|[(),+*/-]/g)!;
  let cursor = 0;
  function atom(): number {
    const token = tokens[cursor++];
    if (token === '(') {
      const value = sum();
      assert.equal(tokens[cursor++], ')');
      return value;
    }
    if (/^[a-z]+$/.test(token)) {
      assert.equal(tokens[cursor++], '(');
      const args = [sum()];
      while (tokens[cursor] === ',') {
        cursor++;
        args.push(sum());
      }
      assert.equal(tokens[cursor++], ')');
      if (token === 'min') return Math.min(...args);
      if (token === 'max') return Math.max(...args);
      assert.equal(token, 'clamp');
      return Math.min(Math.max(args[0], args[1]), args[2]);
    }
    assert.match(token, /^\d/);
    return Number(token);
  }
  function product(): number {
    let value = atom();
    while (['*', '/'].includes(tokens[cursor])) {
      const op = tokens[cursor++];
      const right = atom();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (['+', '-'].includes(tokens[cursor])) {
      const op = tokens[cursor++];
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  assert.equal(cursor, tokens.length);
  return result;
}
void test('responsive hints match shell gutters and actual slider/grid track widths at boundary viewports', () => {
  for (const v of [
    240, 299, 300, 320, 375, 639, 640, 768, 1023, 1024, 1280, 1439, 1440, 1535,
    1536, 1679, 1680, 1920,
  ]) {
    const padding =
      v < 300 ? 12 : v >= 1024 ? 48 : Math.min(Math.max(12, v * 0.05), 32);
    const content = Math.min(v, 1440) - 2 * padding;
    const wide = Math.min(v, 1680) - 2 * padding;
    const widths = {
      productSlider:
        v >= 1024 ? content / 4 - 18 : content * (v >= 640 ? 0.42 : 0.78),
      productSliderWide:
        v >= 1536
          ? wide / 5 - 19.2
          : v >= 1024
            ? wide / 4 - 18
            : wide * (v >= 640 ? 0.42 : 0.78),
      productGrid:
        v >= 1024
          ? (content - 72) / 4
          : v >= 640
            ? (content - 24) / 2
            : content,
      shopGrid:
        v >= 1280
          ? (content - 320 - 40) / 3
          : v >= 1024
            ? (content - 320 - 20) / 2
            : (content - (v >= 640 ? 20 : 16)) / 2,
      productGallery:
        v >= 1024 ? (content - (v >= 1280 ? 64 : 40)) * 0.525 : content,
      galleryThumbnail:
        ((v >= 1024 ? (content - (v >= 1280 ? 64 : 40)) * 0.525 : content) -
          (v >= 640 ? 48 : 32)) /
        5,
      savedProduct:
        v >= 1280
          ? (content - 280 - 40) / 3
          : v >= 1024
            ? (content - 280 - 20) / 2
            : v >= 640
              ? (content - 20) / 2
              : content,
      makerGrid:
        v >= 1280
          ? (content - 72) / 4
          : v >= 1024
            ? (content - 48) / 3
            : v >= 640
              ? (content - 24) / 2
              : content,
      notFound: v >= 1024 ? (content - 64) * 0.56 : content,
      editorial:
        v >= 1024
          ? (content - Math.min(Math.max(32, v * 0.04), 64)) * 0.54
          : content,
    };
    for (const [purpose, actual] of Object.entries(widths))
      assert.ok(
        Math.abs(
          hinted(mediaSizes[purpose as keyof typeof mediaSizes], v) - actual,
        ) < 0.02,
        purpose +
          ' at ' +
          v +
          ': hint ' +
          hinted(mediaSizes[purpose as keyof typeof mediaSizes], v) +
          ' vs track ' +
          actual,
      );
  }
});

void test('geometry fixtures track the current fluid shell and mounted component rules', async () => {
  const read = (path: string) =>
    readFile(new URL(path, import.meta.url), 'utf8');
  const [css, slider, details, gallery, page] = await Promise.all([
    read('../app/globals.css'),
    read('../components/catalog/product-slider.tsx'),
    read('../components/homepage/craft-details.module.css'),
    read('../components/catalog/product-gallery.tsx'),
    read('../app/page.tsx'),
  ]);
  assert.match(
    css,
    /max-w-\[90rem\] px-\[clamp\(0.75rem,5vw,2rem\)\] lg:px-12/,
  );
  assert.match(css, /width:\s*min\(100%,\s*105rem\)/);
  assert.match(
    css,
    /@media \(max-width:\s*299px\)[\s\S]*?\.shell\s*\{\s*padding-inline:\s*0.75rem/,
  );
  assert.match(
    slider,
    /basis-\[78%\].*sm:basis-\[42%\].*lg:basis-\[calc\(25%-1.125rem\)\].*2xl:basis-\[calc\(20%-1.2rem\)\]/,
  );
  assert.match(
    details,
    /grid-template-columns: minmax\(0, 1.08fr\) minmax\(0, 0.92fr\)/,
  );
  assert.match(details, /gap: clamp\(2rem, 4vw, 4rem\)/);
  assert.match(gallery, /grid-cols-5 gap-2 sm:gap-3/);
  assert.match(page, /<CraftDetails\s*\/>/);
});

void test('sizes length parser keeps nested min and max functions in CSS notation', () => {
  const sizes = 'min(100vw, max(320px, 50vw))';
  assert.equal(hinted(sizes, 240), 240);
  assert.equal(hinted(sizes, 400), 320);
  assert.equal(hinted(sizes, 1000), 500);
});
