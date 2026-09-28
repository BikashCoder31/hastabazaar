import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as createViteServer, loadConfigFromFile, type Plugin, type ViteDevServer } from 'vite';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLocalRiderDecoderPlugin, localRiderMediaPlugin } from '../scripts/staging/rider-media-plugin';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { sharp } from '../lib/reviews/image-processor';
import { prepareRiderEvidence as nativePrepare, singleRiderFile as nativeSingle } from '../lib/riders/media-upload';

const names = ['HASTABAZAAR_LOCAL_RIDER_DECODER', 'HASTABAZAAR_RUNTIME_ENV', 'NODE_ENV', 'APP_ORIGIN',
  'HASTABAZAAR_MAIL_MODE', 'HASTABAZAAR_PAYMENT_MODE', 'HASTABAZAAR_RECIPIENT_DOMAIN', 'DEPLOY_TARGET',
  'HASTABAZAAR_STAGING_ROOT', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SMTP_HOST', 'SMTP_USER',
  'SMTP_PASSWORD', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'S3_ENDPOINT'];
const safe = { HASTABAZAAR_LOCAL_RIDER_DECODER: '1', HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  NODE_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:4173', HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated', HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test' } as const;

async function config(overrides: Record<string, string | undefined> = {}, command: 'serve' | 'build' = 'serve') {
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, safe);
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    const loaded = await loadConfigFromFile({ command, mode: 'development' }, 'vite.config.ts', process.cwd(), 'silent');
    assert.ok(loaded);
    return loaded.config;
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
}
async function plugin(overrides: Record<string, string | undefined> = {}) {
  return { plugin: createLocalRiderDecoderPlugin(process.cwd(), overrides.APP_ORIGIN ?? safe.APP_ORIGIN) };
}

void test('portable decoder primitive needs no staging marker while the real activation guard refuses it', async () => {
  const ordinary = await config({ HASTABAZAAR_LOCAL_RIDER_DECODER: undefined });
  const ordinaryPlugins = await Promise.all((ordinary.plugins as unknown[] ?? []).flat(Infinity));
  assert.equal(ordinaryPlugins.some((item) => item && typeof item === 'object' &&
    'name' in item && item.name === 'hastabazaar-local-rider-media-decoder'), false);
  const project = await mkdtemp(resolve(tmpdir(), 'rider-decoder-fixture-'));
  try {
    assert.equal(createLocalRiderDecoderPlugin(project, safe.APP_ORIGIN).apply, 'serve');
    await assert.rejects(() => localRiderMediaPlugin(safe, project), /exact approved worktree/);
    for (const origin of ['https://127.0.0.1:4173', 'http://remote.invalid:4173', 'http://127.0.0.1:4173/extra',
      'http://user:pass@127.0.0.1:4173', 'http://127.0.0.1'])
      assert.throws(() => createLocalRiderDecoderPlugin(project, origin));
  } finally { await rm(project, { recursive: true, force: true }); }
});

void test('actual opt-in rejects production, Babal, build, remote origin/bindings and unsafe staging modes', async () => {
  for (const overrides of [{ NODE_ENV: 'production' }, { DEPLOY_TARGET: 'babal' },
    { HASTABAZAAR_RUNTIME_ENV: 'production' }, { APP_ORIGIN: 'https://hastabazaar.com' },
    { APP_ORIGIN: 'http://127.0.0.1:4173/extra' }, { APP_ORIGIN: 'http://user:pass@127.0.0.1:4173' },
    { HASTABAZAAR_MAIL_MODE: 'smtp' }, { HASTABAZAAR_PAYMENT_MODE: 'real' },
    { HASTABAZAAR_RECIPIENT_DOMAIN: 'example.com' }, { DB_HOST: 'remote.invalid' },
    { HASTABAZAAR_STAGING_ROOT: '../outside' }])
    await assert.rejects(() => config(overrides), 'Unsafe decoder opt-in must fail before activation');
  await assert.rejects(() => config({}, 'build'), 'A decoder opt-in may never enter a build');
});

const decodePath = '/__staging/rider-media-decode';
type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
async function moduleSource(selected: Plugin, environment = 'rsc', path = resolve('lib/riders/media-upload.ts')) {
  const load = typeof selected.load === 'function' ? selected.load : selected.load?.handler;
  assert.ok(load);
  const result = await load.call({ environment: { name: environment } } as never, path);
  return typeof result === 'string' ? result : result && 'code' in result ? result.code : null;
}
async function middleware(selected: Plugin, port: number) {
  let captured: Middleware | undefined;
  const configure = typeof selected.configureServer === 'function' ? selected.configureServer : selected.configureServer?.handler;
  assert.ok(configure);
  await configure.call(null as never, { config: { root: process.cwd(), server: { host: '127.0.0.1', port, strictPort: true } },
    middlewares: { use(handler: Middleware) { captured = handler; } } } as never);
  assert.ok(captured);
  return captured;
}
async function fixture() {
  let handler: Middleware | undefined;
  const statuses: number[] = [];
  let fault: 'none' | 'wrong_mime' | 'redirect' | 'oversize' = 'none';
  const server = createServer((request, response) => {
    response.on('finish', () => statuses.push(response.statusCode));
    if (fault === 'wrong_mime') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('not jpeg'); return; }
    if (fault === 'redirect') { response.writeHead(302, { location: 'http://remote.invalid/image' }); response.end(); return; }
    if (fault === 'oversize') { response.writeHead(200, { 'content-type': 'image/jpeg' }); response.end(new Uint8Array(5 * 1024 * 1024 + 1)); return; }
    if (!handler) { response.writeHead(503); response.end(); return; }
    handler(request, response, () => { response.writeHead(404); response.end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const selected = await plugin({ APP_ORIGIN: `http://127.0.0.1:${address.port}` });
    handler = await middleware(selected.plugin, address.port);
    const source = await moduleSource(selected.plugin); assert.ok(source);
    const match = source.match(/const capability = "([a-f0-9]{64})";/); assert.ok(match, 'Server-only bridge capability must be opaque');
    return { server, plugin: selected.plugin, source, handler, capability: match[1], port: address.port, statuses,
      setFault(value: typeof fault) { fault = value; }, async close() {
        if (!server.listening) return;
        server.closeAllConnections(); server.close(); await once(server, 'close');
      } };
  } catch (error) { server.closeAllConnections(); server.close(); throw error; }
}

void test('only exact worker media modules get the capability, never client or unrelated modules', async () => {
  const selected = await plugin();
  assert.ok(await moduleSource(selected.plugin, 'rsc'));
  assert.ok(await moduleSource(selected.plugin, 'ssr'));
  assert.equal(await moduleSource(selected.plugin, 'client') === null, true);
  assert.equal(await moduleSource(selected.plugin, 'rsc', resolve('lib/riders/repository.ts')) === null, true);
  const apply = selected.plugin.applyToEnvironment; assert.ok(apply);
  assert.equal(await apply({ name: 'client' } as never), false);
});

void test('the actual loopback Vite client module response never contains the worker capability', async () => {
  const f = await fixture(); await f.close();
  const cacheDir = await mkdtemp(resolve(tmpdir(), 'rider-decoder-vite-cache-'));
  let server: ViteDevServer | undefined;
  try {
    server = await createViteServer({ configFile: false, root: process.cwd(), cacheDir, logLevel: 'silent',
      plugins: [f.plugin], server: { host: '127.0.0.1', port: f.port, strictPort: true }, optimizeDeps: { noDiscovery: true } });
    await server.listen();
    for (const path of ['/lib/riders/media-upload.ts', '/lib/riders/media-upload.ts?import']) {
      const response = await fetch(`http://127.0.0.1:${f.port}${path}`);
      assert.equal(response.status, 200);
      const source = await response.text();
      assert.equal(source.includes(f.capability), false, 'Server capability must never be in served client source');
      assert.equal(source.includes('Bearer '), false);
    }
  } finally { await server?.close(); await rm(cacheDir, { recursive: true, force: true }); }
});

function mp4(seconds: number) {
  const box = (type: string, data: Uint8Array) => {
    const result = Buffer.alloc(8 + data.length); result.writeUInt32BE(result.length); result.write(type, 4);
    result.set(data, 8); return result;
  };
  const duration = Buffer.alloc(100); duration.writeUInt32BE(1000, 12); duration.writeUInt32BE(seconds * 1000, 16);
  const handler = Buffer.concat([Buffer.alloc(8), Buffer.from('vide'), Buffer.alloc(12)]);
  const media = box('mdia', Buffer.concat([box('mdhd', duration), box('hdlr', handler)]));
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isommp42')),
    box('moov', Buffer.concat([box('mvhd', duration), box('trak', media)])), box('mdat', Buffer.alloc(8))]);
}

void test('decoder rejects unauthenticated/browser/foreign/malformed/oversized requests before reading bodies', async () => {
  const f = await fixture();
  try {
    for (const overrides of [{ method: 'GET', status: 405 }, { capability: '0'.repeat(64), status: 403 },
      { host: 'remote.invalid', status: 403 }, { origin: 'http://127.0.0.1:' + f.port, status: 403 },
      { remoteAddress: '192.0.2.1', status: 403 }, { type: 'image/gif', status: 400 },
      { length: String(5 * 1024 * 1024 + 1), status: 413 }, { length: 'garbage', status: 400 }]) {
      let reads = 0, status = 0;
      const request = Readable.from([]) as unknown as IncomingMessage;
      request.method = 'method' in overrides ? overrides.method : 'POST'; request.url = decodePath;
      request.headers = { host: 'host' in overrides ? overrides.host : `127.0.0.1:${f.port}`,
        authorization: 'Bearer ' + ('capability' in overrides ? overrides.capability : f.capability),
        'content-type': 'type' in overrides ? overrides.type : 'image/png',
        'content-length': 'length' in overrides ? overrides.length : '12',
        ...('origin' in overrides ? { origin: overrides.origin } : {}) };
      Object.defineProperty(request, 'socket', { value: { remoteAddress: 'remoteAddress' in overrides ? overrides.remoteAddress : '127.0.0.1' } });
      request.iterator = (() => { reads++; throw new Error('Denied input body was read'); }) as never;
      const responseFixture = { statusCode: 0, setHeader() {}, end() { status = responseFixture.statusCode; } };
      const response = responseFixture as unknown as ServerResponse;
      f.handler(request, response, () => { throw new Error('Exact decoder path was not handled'); });
      assert.equal(status, overrides.status); assert.equal(reads, 0);
    }
    const declared = await new Promise<number>((resolveResponse, reject) => {
      const outgoing = httpRequest({ hostname: '127.0.0.1', port: f.port, path: decodePath, method: 'POST',
        headers: { authorization: 'Bearer ' + f.capability, 'content-type': 'image/png', 'content-length': String(5 * 1024 * 1024 + 1) } },
      (response) => { response.resume(); resolveResponse(response.statusCode ?? 0); });
      outgoing.on('error', reject); outgoing.end();
    });
    assert.equal(declared, 413);
    const streamed = await fetch(`http://127.0.0.1:${f.port}${decodePath}`, { method: 'POST',
      headers: { authorization: 'Bearer ' + f.capability, 'content-type': 'image/png' },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1)); controller.close(); } }), duplex: 'half' } as RequestInit);
    assert.equal(streamed.status, 413);
  } finally { await f.close(); }
});

void test('actual workerd bridge decodes native Sharp, strips EXIF and preserves type/pixel/private-photo limits', async () => {
  const f = await fixture(); let mf: Miniflare | undefined;
  try {
    const bundle = await build({ stdin: { contents: f.source + `\nconst originalFetch=globalThis.fetch;let diagnostic={started:false};
      globalThis.fetch=async(...args)=>{diagnostic.started=true;try{const response=await originalFetch(...args);diagnostic.status=response.status;return response;}
        catch(error){diagnostic.failure=String(error.message).replaceAll(capability,'[redacted]');throw error}};
      export default {async fetch(request){try{
      if(new URL(request.url).pathname==='/single'){
        const input=await request.json();const form=new FormData();
        for(const entry of input.entries)form.append(entry.name,new File([new Uint8Array(entry.size)],'synthetic-proof',{type:entry.type}));
        return Response.json({size:singleRiderFile(form,['photo','video'],input.required)?.size??null});
      }
      const file=new File([await request.arrayBuffer()],'synthetic.png',{type:request.headers.get('content-type')});
      const result=await prepareRiderEvidence(file,request.headers.get('x-video-allowed')==='yes');return new Response(result.bytes,{headers:{'content-type':result.mime}});
      }catch{return Response.json({diagnostic,timeoutType:typeof AbortSignal.timeout},{status:400})}}};`, resolveDir: process.cwd(), loader: 'js' },
      bundle: true, write: false, platform: 'browser', format: 'esm' });
    mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text }));
    const original = await sharp({ create: { width: 12, height: 7, channels: 3, background: '#347856' } }).withMetadata({ orientation: 6 }).png().toBuffer();
    assert.ok((await sharp(original).metadata()).exif);
    const native = await fetch(`http://127.0.0.1:${f.port}${decodePath}`, { method: 'POST',
      headers: { authorization: 'Bearer ' + f.capability, 'content-type': 'image/png' }, body: new Uint8Array(original) });
    assert.equal(native.status, 200, 'The real native middleware must decode before the worker bridge is evaluated');
    const saved = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST',
      headers: { 'content-type': 'image/png' }, body: new Uint8Array(original) });
    assert.equal(saved.status, 200, saved.status === 200 ? undefined :
      `Worker diagnostic:${await saved.text()}; native statuses:${JSON.stringify(f.statuses)}`);
    const output = new Uint8Array(await saved.arrayBuffer()); const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined); assert.equal(metadata.width, 7); assert.equal(metadata.height, 12);
    const wide = await sharp({ create: { width: 4097, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const resized = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST', headers: { 'content-type': 'image/png' }, body: wide });
    assert.equal(resized.status, 200); assert.equal((await sharp(new Uint8Array(await resized.arrayBuffer())).metadata()).width, 4096);
    const framePixels = Buffer.alloc(8 * 16 * 4, 255); framePixels.fill(0, 0, 8 * 8 * 4);
    const animated = await sharp(framePixels, { raw: { width: 8, height: 16, channels: 4, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    assert.equal((await sharp(animated).metadata()).pages, 2);
    const tooManyPixels = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: '#ffffff' } }).png().toBuffer();
    for (const [type, bytes] of [['image/png', new TextEncoder().encode('not image')], ['image/jpeg', original],
      ['video/mp4', new Uint8Array([1, 2, 3])], ['image/webp', animated], ['image/png', tooManyPixels],
      ['image/png', new Uint8Array(5 * 1024 * 1024 + 1)]] as const) {
      const rejected = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST', headers: { 'content-type': type }, body: bytes });
      assert.equal(rejected.status, 400);
    }
    const callsBeforeVideo = f.statuses.length;
    const movie = mp4(2);
    const nativeVideo = await nativePrepare(new File([movie as BlobPart], 'synthetic.mp4', { type: 'video/mp4' }), true);
    const workerVideo = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST',
      headers: { 'content-type': 'video/mp4', 'x-video-allowed': 'yes' }, body: movie });
    assert.equal(workerVideo.status, 200); assert.equal(workerVideo.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(new Uint8Array(await workerVideo.arrayBuffer()), nativeVideo.bytes);
    for (const movieBytes of [mp4(61), new Uint8Array([1, 2, 3])]) {
      const rejected = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST',
        headers: { 'content-type': 'video/mp4', 'x-video-allowed': 'yes' }, body: movieBytes });
      assert.equal(rejected.status, 400);
    }
    assert.equal(f.statuses.length, callsBeforeVideo, 'MP4 validation must not invoke the native image bridge');
    for (const input of [{ required: true, entries: [] }, { required: false, entries: [] },
      { required: true, entries: [{ name: 'photo', size: 8, type: 'image/png' }] },
      { required: true, entries: [{ name: 'photo', size: 8, type: 'image/png' }, { name: 'video', size: 8, type: 'video/mp4' }] },
      { required: false, entries: [{ name: 'photo', size: 0, type: 'image/png' }] },
      { required: false, entries: [{ name: 'photo', size: 8, type: 'image/png' }, { name: 'photo', size: 8, type: 'image/png' }] }]) {
      const form = new FormData(); for (const entry of input.entries)
        form.append(entry.name, new File([new Uint8Array(entry.size)], 'synthetic-proof', { type: entry.type }));
      let expected: number | null | 'rejected';
      try { expected = nativeSingle(form, ['photo', 'video'], input.required)?.size ?? null; } catch { expected = 'rejected'; }
      const actual = await mf.dispatchFetch('http://rider-decoder-fixture/single', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      if (expected === 'rejected') assert.equal(actual.status, 400);
      else { assert.equal(actual.status, 200); assert.deepEqual(await actual.json(), { size: expected }); }
    }
    for (const fault of ['wrong_mime', 'redirect', 'oversize'] as const) {
      f.setFault(fault);
      const rejected = await mf.dispatchFetch('http://rider-decoder-fixture/', { method: 'POST',
        headers: { 'content-type': 'image/png' }, body: new Uint8Array(original) });
      assert.equal(rejected.status, 400, 'Untrusted decoder response must fail closed');
    }
  } finally { await mf?.dispose(); await f.close(); }
});
