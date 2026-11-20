import { randomBytes, timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { renderProductWatermark, ProductWatermarkError, maximumProductWatermarkBytes, productWatermarkRendererVersion } from '../../lib/products/watermark';
import { validateProductWatermarkPolicy } from '../../lib/products/watermark-policy';
import { createImageWorkQueue } from '../../lib/products/image-work-queue';
import { createLocalEnvironment, readLocalCheckout } from '../start-local.mjs';
import { assertDisposableStagingContext, readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';

const endpointPath = '/__staging/product-watermark';
/** Native image decoding for the checked Desktop preview; never initializes data. */
export async function localProductMediaPlugin(environment: Record<string, string | undefined>, projectRoot: string,
  command: 'serve' | 'build' = 'serve', cwd = process.cwd()): Promise<Plugin> {
  if (command !== 'serve' || environment.NODE_ENV !== 'development' || environment.DEPLOY_TARGET)
    throw new Error('Local product image processing requires development serve mode.');
  createLocalEnvironment(environment);
  assertDisposableStagingContext(environment);
  const checkout = await readLocalCheckout(await realpath(projectRoot), await realpath(cwd));
  const paths = resolveDisposableStagingPaths(checkout.projectRoot, environment);
  if (await realpath(paths.root) !== paths.root) throw new Error('The local staging directory must not redirect.');
  await readAndVerifyStagingMarker(paths);
  const origin = new URL(environment.APP_ORIGIN!);
  return createLocalProductWatermarkPlugin(checkout.projectRoot, origin.href,
    origin.hostname === 'localhost' ? 'localhost' : '127.0.0.1');
}
/** Internal loopback primitive, activated only through the existing disposable staging guard. */
export function createLocalProductWatermarkPlugin(projectRoot: string, appOrigin: string,
  boundHost: '127.0.0.1' | 'localhost' = '127.0.0.1'): Plugin {
  if (boundHost !== '127.0.0.1' && boundHost !== 'localhost') throw new Error('A strict loopback listener is required.');
  const origin = new URL(appOrigin);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || !origin.port ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('The product watermark bridge requires a plain loopback HTTP origin with an explicit port.');
  const port = Number(origin.port);
  const capability = Buffer.from(randomBytes(32)).toString('hex');
  const hosts = new Set(['localhost:' + port, '127.0.0.1:' + port]);
  const mediaPath = resolve(projectRoot, 'lib/products/watermark.ts').replaceAll('\\', '/');
  const policyPath = resolve(projectRoot, 'lib/products/watermark-policy.ts').replaceAll('\\', '/');
  const decodeQueue = createImageWorkQueue(2, 16);
  function reject(response: ServerResponse, status: number) {
    response.statusCode = status;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-content-type-options', 'nosniff');
    response.end('{"error":"Local product image processing was refused."}');
  }
  function authorized(request: IncomingMessage) {
    const value = request.headers.authorization;
    return typeof value === 'string' && /^Bearer [a-f0-9]{64}$/.test(value) &&
      timingSafeEqual(Buffer.from(value.slice(7)), Buffer.from(capability));
  }
  async function decode(request: IncomingMessage, response: ServerResponse, type: string, policyHeader: string) {
    if (request.destroyed || response.destroyed) return;
    try {
      const policy = validateProductWatermarkPolicy(JSON.parse(decodeURIComponent(policyHeader)));
      const chunks: Buffer[] = []; let total = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const bytes = Buffer.from(chunk as Uint8Array); total += bytes.length;
        if (total > maximumProductWatermarkBytes) { reject(response, 413); request.resume(); return; }
        chunks.push(bytes);
      }
      if (!total) { reject(response, 400); return; }
      const rendered = await renderProductWatermark(Buffer.concat(chunks), type, policy);
      response.statusCode = 200;
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', rendered.mimeType);
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-image-width', String(rendered.width));
      response.setHeader('x-image-height', String(rendered.height));
      response.end(Buffer.from(rendered.bytes));
    } catch (error) { if (!response.headersSent) reject(response, error instanceof ProductWatermarkError ? error.status : 400); }
  }
  const workerSource =
    'import {validateProductWatermarkPolicy} from ' + JSON.stringify(policyPath) + ';\n' +
    'const capability = ' + JSON.stringify(capability) + ';\n' +
    'const endpoint = ' + JSON.stringify('http://' + boundHost + ':' + port + endpointPath) + ';\n' +
    'export const maximumProductWatermarkBytes = ' + maximumProductWatermarkBytes + ';\n' +
    'export const productWatermarkRendererVersion = ' + JSON.stringify(productWatermarkRendererVersion) + ';\n' +
    [
      "export class ProductWatermarkError extends Error{constructor(message,status=400){super(message);this.status=status;}}",
      "export async function renderProductWatermark(input,mimeType,candidate){",
      " const policy=validateProductWatermarkPolicy(candidate);",
      " if(!input.byteLength||input.byteLength>maximumProductWatermarkBytes||!['image/jpeg','image/png','image/webp'].includes(mimeType))throw new ProductWatermarkError('Use a JPG, PNG, or WebP photo up to 5 MB.');",
      " try{",
      "  const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+capability,'content-type':mimeType,'x-watermark-policy':encodeURIComponent(JSON.stringify(policy))},body:input,redirect:'manual',signal:AbortSignal.timeout(30000)});",
      "  if(!response.ok)throw new ProductWatermarkError(response.status===503?'Product image processing is unavailable. Try again shortly.':'The product photo could not be safely decoded.',response.status===503?503:400);",
      "  const width=Number(response.headers.get('x-image-width')),height=Number(response.headers.get('x-image-height'));",
      "  if(response.headers.get('content-type')!=='image/webp'||!response.body||!Number.isSafeInteger(width)||width<1||width>2400||!Number.isSafeInteger(height)||height<1||height>2400)throw new ProductWatermarkError('Product image processing is unavailable.',503);",
      "  const reader=response.body.getReader();let total=0;const chunks=[];",
      "  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximumProductWatermarkBytes){await reader.cancel();throw new ProductWatermarkError('Product image processing is unavailable.',503);}chunks.push(value);}}finally{reader.releaseLock();}",
      "  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}",
      "  const tag=start=>String.fromCharCode(...bytes.slice(start,start+4));",
      "  if(total<12||tag(0)!=='RIFF'||tag(8)!=='WEBP')throw new ProductWatermarkError('Product image processing is unavailable.',503);",
      "  return {bytes,mimeType:'image/webp',width,height};",
      " }catch(error){if(error instanceof ProductWatermarkError)throw error;throw new ProductWatermarkError('Product image processing is unavailable. Try again shortly.',503);}",
      "}",
    ].join('\n');
  return {
    name: 'hastabazaar-local-product-watermark', apply: 'serve', enforce: 'pre',
    applyToEnvironment: selected => selected.name === 'rsc' || selected.name === 'ssr',
    load(id) {
      if (!['rsc', 'ssr'].includes(this.environment.name)) return null;
      return id.split('?', 1)[0].replaceAll('\\', '/') === mediaPath ? workerSource : null;
    },
    configureServer(server) {
      if (server.config.server.host !== boundHost || server.config.server.port !== port || server.config.server.strictPort !== true)
        throw new Error('The watermark bridge must share the strict loopback staging listener.');
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?', 1)[0] !== endpointPath) { next(); return; }
        if (request.method !== 'POST') { reject(response, 405); return; }
        if (request.url !== endpointPath || typeof request.headers.host !== 'string' || !hosts.has(request.headers.host) ||
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') ||
            request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined || !authorized(request)) {
          reject(response, 403); return;
        }
        const type = request.headers['content-type'], length = request.headers['content-length'], policyHeader = request.headers['x-watermark-policy'];
        if (typeof type !== 'string' || !['image/jpeg','image/png','image/webp'].includes(type) ||
            typeof policyHeader !== 'string' || policyHeader.length > 1000 ||
            request.headers['content-encoding'] !== undefined ||
            length !== undefined && (typeof length !== 'string' || !/^(0|[1-9]\d*)$/.test(length))) { reject(response, 400); return; }
        if (length !== undefined && Number(length) > maximumProductWatermarkBytes) { reject(response, 413); return; }
        // Keep incoming bodies paused until a decoder is available. A normal
        // four-photo product upload must not fail merely because two are busy.
        void decodeQueue(() => decode(request, response, type, policyHeader)).catch(() => {
          if (!response.destroyed && !response.headersSent) reject(response, 503);
          request.resume();
        });
      });
    },
  };
}
