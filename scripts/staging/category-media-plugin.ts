import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { prepareCategoryImage } from '../../lib/catalog/category-image-upload';

const endpointPath = '/__staging/category-image-decode';
const maxBytes = 8 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Internal loopback primitive. Activation uses the existing disposable staging guard. */
export function createLocalCategoryDecoderPlugin(projectRoot: string, appOrigin: string): Plugin {
  const origin = new URL(appOrigin);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || !origin.port ||
    origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('The category decoder requires a plain loopback HTTP origin with an explicit port.');
  const port = Number(origin.port);
  const capability = Buffer.from(randomBytes(32)).toString('hex');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const mediaPath = resolve(projectRoot, 'lib/catalog/category-image-upload.ts').replaceAll('\\', '/');
  let active = 0;
  function reject(response: ServerResponse, status: number) {
    response.statusCode = status;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-content-type-options', 'nosniff');
    response.end('{"error":"Local category image decoding was refused."}');
  }
  function authorized(request: IncomingMessage) {
    const value = request.headers.authorization;
    return typeof value === 'string' && /^Bearer [a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value.slice(7)), Buffer.from(capability));
  }
  async function decode(request: IncomingMessage, response: ServerResponse, type: string, name: string) {
    active++;
    try {
      const chunks: Buffer[] = []; let total = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const bytes = Buffer.from(chunk as Uint8Array); total += bytes.length;
        if (total > maxBytes) { reject(response, 413); request.resume(); return; }
        chunks.push(bytes);
      }
      if (!total) { reject(response, 400); return; }
      const image = await prepareCategoryImage(new File([Buffer.concat(chunks) as BlobPart], name, { type }));
      response.statusCode = 200;
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', 'image/webp');
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-image-width', String(image.width));
      response.setHeader('x-image-height', String(image.height));
      response.end(Buffer.from(image.bytes));
    } catch { if (!response.headersSent) reject(response, 400); }
    finally { active--; }
  }
  const workerSource = `import {createHash} from 'node:crypto';
const capability = ${JSON.stringify(capability)};
const endpoint = ${JSON.stringify(`http://127.0.0.1:${port}${endpointPath}`)};
export class CategoryImageError extends Error {}
export async function prepareCategoryImage(file){
 const name=file.name.trim();
 if(!name||name.length>255||/[\\p{Cc}<>/\\\\]/u.test(name))throw new CategoryImageError('The original media filename is invalid.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>${maxBytes})throw new CategoryImageError('Use a JPG, PNG, or WebP category image up to 8 MB.');
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+capability,'content-type':file.type,'x-image-name':encodeURIComponent(name)},body:new Uint8Array(await file.arrayBuffer()),redirect:'manual',signal:AbortSignal.timeout(30000)});
  const width=Number(response.headers.get('x-image-width')),height=Number(response.headers.get('x-image-height'));
  if(!response.ok||response.headers.get('content-type')!=='image/webp'||!response.body||!Number.isSafeInteger(width)||width<1||width>2400||!Number.isSafeInteger(height)||height<1||height>1600)throw new Error('Decoder unavailable');
  const reader=response.body.getReader();let total=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>5242880){await reader.cancel();throw new Error('Image too large');}chunks.push(value);}}finally{reader.releaseLock();}
  if(total<12)throw new Error('Empty image');const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const tag=(start)=>String.fromCharCode(...bytes.slice(start,start+4));if(tag(0)!=='RIFF'||tag(8)!=='WEBP')throw new Error('Invalid decoded image');
  return {bytes,mimeType:'image/webp',width,height,durationSeconds:null,originalName:name,contentHash:createHash('sha256').update(bytes).digest('hex')};
 }catch{throw new CategoryImageError('The category image could not be safely read. Use a valid image with at most 20 million pixels.');}
}`;
  return {
    name: 'hastabazaar-local-category-media-decoder', apply: 'serve', enforce: 'pre',
    applyToEnvironment: (selected) => selected.name === 'rsc' || selected.name === 'ssr',
    load(id) {
      if (!['rsc', 'ssr'].includes(this.environment.name)) return null;
      return id.split('?', 1)[0].replaceAll('\\', '/') === mediaPath ? workerSource : null;
    },
    configureServer(server) {
      if (server.config.server.host !== '127.0.0.1' || server.config.server.port !== port || server.config.server.strictPort !== true)
        throw new Error('The category decoder must share the strict loopback dev listener.');
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?', 1)[0] !== endpointPath) { next(); return; }
        if (request.method !== 'POST') { reject(response, 405); return; }
        if (request.url !== endpointPath || typeof request.headers.host !== 'string' || !hosts.has(request.headers.host) ||
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') ||
          request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined || !authorized(request)) {
          reject(response, 403); return;
        }
        const type = request.headers['content-type'];
        const length = request.headers['content-length'];
        const name = request.headers['x-image-name'];
        if (typeof type !== 'string' || !imageTypes.has(type) || typeof name !== 'string' || name.length > 3060 ||
          request.headers['content-encoding'] !== undefined || length !== undefined && (typeof length !== 'string' || !/^(0|[1-9]\d*)$/.test(length))) {
          reject(response, 400); return;
        }
        if (length !== undefined && Number(length) > maxBytes) { reject(response, 413); return; }
        if (active >= 2) { reject(response, 503); return; }
        let decodedName: string;
        try { decodedName = decodeURIComponent(name); } catch { reject(response, 400); return; }
        void decode(request, response, type, decodedName);
      });
    },
  };
}
