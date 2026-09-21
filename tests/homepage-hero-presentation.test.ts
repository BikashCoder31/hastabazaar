import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homepagePath = new URL('../app/page.tsx', import.meta.url);

void test('homepage uses the editorial Nepal craft hero without bag merchandising', async () => {
  const homepage = await readFile(homepagePath, 'utf8');

  assert.match(homepage, /Handmade today/);
  assert.match(homepage, /brighter[\s\S]{0,100}Nepal/);
  assert.match(homepage, /\/homepage\/nepal-craft-hero\.webp/);
  assert.match(homepage, /aria-label="Shop featured craft categories"/);
  assert.doesNotMatch(
    homepage,
    /macrame-crossbody|embroidered-clutch|straw-tote/i,
  );
  assert.doesNotMatch(homepage, />\s*Bags\s*&\s*Accessories\s*</i);
});

void test('disposable local staging can preview the category rail without changing production empty states', async () => {
  const homepage = await readFile(homepagePath, 'utf8');

  assert.match(homepage, /HASTABAZAAR_RUNTIME_ENV/);
  assert.match(homepage, /local_staging/);
  assert.match(homepage, /NODE_ENV === 'development'/);
  assert.match(homepage, /stagingHomepageCategories/);
  assert.match(homepage, /Home decor/);
});

void test('maker story uses the editorial artisan workshop presentation and preserves both journeys', async () => {
  const homepage = await readFile(homepagePath, 'utf8');

  assert.match(homepage, /homepage-maker-story/);
  assert.match(homepage, /\/homepage\/nepali-maker-workshop\.webp/);
  assert.match(homepage, /An artisan’s hands painting/);
  assert.match(homepage, /Meet the hands behind the craft/);
  assert.match(homepage, /href="\/shop"/);
  assert.match(homepage, /href="\/sell"/);
  assert.doesNotMatch(homepage, /\/catalog\/macrame-shelf\.jpg/);
});

void test('homepage occasion discovery uses the decorated editorial presentation', async () => {
  const homepage = await readFile(homepagePath, 'utf8');

  assert.match(homepage, /homepage-occasion-section/);
  assert.match(homepage, /homepage-occasion-pattern/);
  assert.match(homepage, /\/homepage\/nepali-gift-pattern\.webp/);
  assert.match(homepage, /homepage-occasion-card/);
  assert.match(homepage, /homepage-occasion-card-watermark/);
  assert.match(homepage, /homepage-occasion-all/);
  assert.match(homepage, /aria-label="Shop gifts by occasion"/);
  assert.match(homepage, /Delivery available across Nepal/);
});
