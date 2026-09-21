import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '../lib/media/responsive-media';
import { auditResponsiveMediaSource } from './helpers/responsive-media-policy';

void test('responsive media exposes explicit modes and bounded size purposes', () => {
  assert.match(mediaFrameClass('cover'), /media-frame/);
  assert.match(mediaObjectClass('cover'), /media-object-cover/);
  assert.match(mediaObjectClass('contain'), /media-object-contain/);
  assert.match(mediaObjectClass('natural'), /media-object-natural/);
  for (const key of [
    'editorial',
    'occasion',
    'productSlider',
    'productGrid',
    'shopGrid',
    'productGallery',
    'galleryThumbnail',
    'savedProduct',
    'cartThumbnail',
    'reviewAttachment',
    'adminThumbnail',
    'brandMark',
    'footerLogo',
    'qr',
    'makerGrid',
    'notFound',
  ] as const) {
    assert.ok(mediaSizes[key].length > 0, `${key} sizes must be defined`);
  }
});

void test('global media safety never forces fill media to automatic height', async () => {
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /:where\(img, video\)[\s\S]*?max-inline-size:\s*100%/);
  assert.doesNotMatch(css, /:where\(img, video\)[\s\S]{0,120}height:\s*auto/);
  assert.match(css, /\.media-object-cover[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.media-object-contain[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.media-object-natural[\s\S]*?height:\s*auto/);
  assert.match(css, /\.media-shrink[\s\S]*?max-inline-size:\s*100%/);
});

void test('policy rejects every unsupported render shape', () => {
  const invalid = [
    '<Image src="/x.jpg" alt="x" fill />',
    '<img src={url} alt="x" />',
    '<video src={url} controls />',
    '<div style={{ backgroundImage: `url(${preview})` }} />',
  ];
  for (const source of invalid) {
    assert.ok(auditResponsiveMediaSource('fixture.tsx', source).length > 0);
  }
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover"><Image data-media-mode="cover" src="/x.jpg" alt="x" fill sizes="100vw" className={mediaObjectClass(\'cover\')} /></div>',
    ),
    [],
  );
});
