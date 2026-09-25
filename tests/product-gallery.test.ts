import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement, type ComponentType } from 'react';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import path from 'node:path';

void test('gallery main photo overrides the real Vinext fill default with contain', async () => {
  const compiled = await build({
    entryPoints: ['components/catalog/product-gallery.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    alias: {
      'next/image': path.resolve('node_modules/vinext/dist/shims/image.js'),
    },
  });
  const renderedModule = {
    exports: {} as {
      ProductGallery: ComponentType<{
        media: { id: string; altEn: string; mimeType: string }[];
        productName: string;
      }>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
    URL,
    console,
  });
  const html = renderToStaticMarkup(
    createElement(renderedModule.exports.ProductGallery, {
      media: [
        { id: 'portrait', altEn: 'Complete portrait', mimeType: 'image/png' },
        { id: 'landscape', altEn: 'Landscape', mimeType: 'image/png' },
      ],
      productName: 'Craft',
    }),
  );
  const main = html.match(/<img\b[^>]*data-media-mode="contain"[^>]*>/)?.[0];
  assert.ok(main);
  assert.match(main, /style="[^"]*object-fit:contain/);
  assert.doesNotMatch(main, /object-fit:cover/);
  const thumbnails =
    html.match(/<img\b[^>]*data-media-mode="cover"[^>]*>/g) ?? [];
  assert.equal(thumbnails.length, 2);
  for (const thumbnail of thumbnails)
    assert.match(thumbnail, /object-fit:cover/);
});
void test('gallery renders photos with correct count and retains video even when historical photos are absent', async () => {
  const compiled = await build({
    entryPoints: ['components/catalog/product-gallery.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'test-image',
        setup(b) {
          b.onResolve({ filter: /^next\/image$/ }, () => ({
            path: 'image',
            namespace: 'test',
          }));
          b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents:
              "const React=require('react');module.exports=function Image({fill,priority,unoptimized,...props}){return React.createElement('img',props);};",
            loader: 'js',
          }));
        },
      },
    ],
  });
  const renderedModule = {
    exports: {} as {
      ProductGallery: ComponentType<{
        media: { id: string; altEn: string; mimeType: string }[];
        productName: string;
      }>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
  });
  const photo = {
      id: 'photo-one',
      altEn: 'Useful photo',
      mimeType: 'image/jpeg',
    },
    video = { id: 'video-one', altEn: 'Demonstration', mimeType: 'video/mp4' };
  const render = (media: (typeof photo)[]) =>
    renderToStaticMarkup(
      createElement(renderedModule.exports.ProductGallery, {
        media,
        productName: 'Handmade bowl',
      }),
    );
  const mixed = render([photo, video]);
  assert.match(mixed, /Photo 1 of 1/);
  assert.match(mixed, /<video/);
  assert.match(mixed, /Useful photo/);
  assert.match(mixed, /<div[^>]*data-media-frame="contain"[^>]*>/);
  assert.match(
    mixed,
    /<img[^>]*src="\/api\/product-media\/photo-one"[^>]*alt="Useful photo"[^>]*data-media-mode="contain"[^>]*>/,
  );
  assert.match(
    mixed,
    /<video[^>]*data-media-mode="contain"[^>]*controls=""[^>]*muted=""[^>]*playsInline=""[^>]*preload="metadata"[^>]*class="[^"]*aspect-video[^"]*"[^>]*src="\/api\/product-media\/video-one"[^>]*>/,
  );
  const multiple = render([
    photo,
    { ...photo, id: 'photo-two', altEn: 'Second photo' },
  ]);
  assert.match(
    multiple,
    /<button[^>]*data-media-frame="cover"[^>]*aria-label="Show photo 1 of Handmade bowl"[^>]*>/,
  );
  assert.match(
    multiple,
    /<img[^>]*src="\/api\/product-media\/photo-one"[^>]*alt=""[^>]*data-media-mode="cover"[^>]*>/,
  );
  const videoOnly = render([video]);
  assert.match(videoOnly, /<video/);
  assert.match(videoOnly, /Photos coming soon/);
  assert.doesNotMatch(videoOnly, /Photo 1 of/);
  const empty = render([]);
  assert.match(empty, /Photos coming soon/);
  assert.doesNotMatch(empty, /<video/);
});
