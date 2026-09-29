import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import type { Plugin } from 'vite';
import sharp from 'sharp';
import type { SharpConstructor } from '../node_modules/sharp/dist/index.d.mts';
import { createLocalCategoryDecoderPlugin } from '../scripts/staging/category-media-plugin';

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
async function source(plugin: Plugin, environment: string, path = resolve('lib/catalog/category-image-upload.ts')) {
  const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler;
  assert.ok(load);
  const result = await load.call({ environment: { name: environment } } as never, path);
  return typeof result === 'string' ? result : null;
}

void test('category local decoder is private to worker modules and normalizes the real WebP fixture through native decoding', async () => {
  let middleware: Middleware | undefined;
  const server = createServer((request, response) => {
    if (middleware) middleware(request, response, () => { response.writeHead(404); response.end(); });
    else { response.writeHead(503); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const plugin = createLocalCategoryDecoderPlugin(process.cwd(), origin);
    assert.equal(await source(plugin, 'client'), null);
    assert.equal(await source(plugin, 'rsc', resolve('lib/catalog/category-media.ts')), null);
    const code = await source(plugin, 'rsc'); assert.ok(code);
    assert.ok(await source(plugin, 'ssr'));
    const configure = typeof plugin.configureServer === 'function' ? plugin.configureServer : plugin.configureServer?.handler;
    assert.ok(configure);
    await configure.call(null as never, { config: { server: { host: '127.0.0.1', port: address.port, strictPort: true } },
      middlewares: { use(value: Middleware) { middleware = value; } } } as never);
    const capability = code.match(/const capability = "([a-f0-9]{64})";/)?.[1]; assert.ok(capability);
    const decoder = await import(`data:text/javascript,${encodeURIComponent(code)}`) as { prepareCategoryImage(file: File): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number; originalName: string; contentHash: string }> };
    const bytes = await readFile('public/homepage/category-pottery.webp');
    const image = await decoder.prepareCategoryImage(new File([new Uint8Array(bytes)], 'category-pottery.webp', { type: 'image/webp' }));
    const metadata = await (sharp as SharpConstructor)(image.bytes).metadata();
    assert.equal(image.mimeType, 'image/webp');
    assert.equal(metadata.format, 'webp');
    assert.equal(image.width, metadata.width);
    assert.equal(image.height, metadata.height);
    assert.equal(image.originalName, 'category-pottery.webp');
    assert.match(image.contentHash, /^[a-f0-9]{64}$/);
    assert.ok(image.bytes.length <= 5 * 1024 * 1024);
    const nepaliFilename = 'क'.repeat(250) + '.png';
    const png = await (sharp as SharpConstructor)(bytes).png().toBuffer();
    const named = await decoder.prepareCategoryImage(new File([new Uint8Array(png)], nepaliFilename, { type: 'image/png' }));
    assert.equal(named.originalName, nepaliFilename, 'Keep the native decoder filename limit for Unicode uploads.');
    const endpoint = `${origin}/__staging/category-image-decode`;
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'image/webp', 'x-image-name': 'fixture.webp' }, body: bytes })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${capability}`, Origin: origin, 'content-type': 'image/webp', 'x-image-name': 'fixture.webp' }, body: bytes })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${capability}`, 'content-type': 'image/svg+xml', 'x-image-name': 'fixture.svg' }, body: '<svg/>' })).status, 400);
    await assert.rejects(decoder.prepareCategoryImage(new File([bytes], 'wrong.png', { type: 'image/png' })), /safely read/);
    await assert.rejects(decoder.prepareCategoryImage(new File(['bad'], '../unsafe.png', { type: 'image/png' })), /filename/);
    await assert.rejects(decoder.prepareCategoryImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })), /8 MB/);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

void test('category decoder refuses hosted origins and requires the guarded loopback server configuration', async () => {
  for (const origin of ['https://127.0.0.1:4173', 'http://remote.invalid:4173', 'http://127.0.0.1:4173/extra', 'http://user:pass@127.0.0.1:4173', 'http://127.0.0.1'])
    assert.throws(() => createLocalCategoryDecoderPlugin(process.cwd(), origin));
  const plugin = createLocalCategoryDecoderPlugin(process.cwd(), 'http://127.0.0.1:4173');
  const configure = typeof plugin.configureServer === 'function' ? plugin.configureServer : plugin.configureServer?.handler;
  assert.ok(configure);
  await assert.rejects(async () => configure.call(null as never, { config: { server: { host: '0.0.0.0', port: 4173, strictPort: true } } } as never), /strict loopback/);
});
