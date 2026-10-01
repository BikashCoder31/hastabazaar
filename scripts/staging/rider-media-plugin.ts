import { randomBytes, timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { prepareRiderEvidence } from '../../lib/riders/media-upload';
import { createLocalProductWatermarkPlugin } from './product-watermark-plugin';
import { createLocalCategoryDecoderPlugin } from './category-media-plugin';
import { assertDisposableStagingContext, readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';

const approvedProject = fileURLToPath(new URL('../..', import.meta.url));
const endpointPath = '/__staging/rider-media-decode';
const maxBytes = 5 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Explicit local QA only. Production media processing and storage stay unchanged. */
export async function localRiderMediaPlugin(environment: NodeJS.ProcessEnv, projectRoot: string): Promise<Plugin[]> {
  if (environment.HASTABAZAAR_LOCAL_RIDER_DECODER !== '1' || environment.NODE_ENV === 'production' || environment.DEPLOY_TARGET)
    throw new Error('The rider decoder requires an explicit nonproduction local serve opt-in.');
  assertDisposableStagingContext(environment);
  const project = resolve(projectRoot);
  if (project !== resolve(approvedProject) || await realpath(project) !== project)
    throw new Error('The rider decoder requires the exact approved worktree.');
  const paths = resolveDisposableStagingPaths(project, environment);
  await readAndVerifyStagingMarker(paths);
  if (await realpath(paths.root) !== paths.root) throw new Error('The staging root must not redirect outside the worktree.');
  return [createLocalRiderDecoderPlugin(project, environment.APP_ORIGIN!), createLocalCategoryDecoderPlugin(project, environment.APP_ORIGIN!), createLocalProductWatermarkPlugin(project, environment.APP_ORIGIN!)];
}

/** Internal loopback transport primitive; Vite activation must use the guarded entry above. */
export function createLocalRiderDecoderPlugin(projectRoot: string, appOrigin: string): Plugin {
  const project = resolve(projectRoot);
  const origin = new URL(appOrigin);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
      !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('The rider decoder requires a plain loopback HTTP origin with an explicit port.');
  const port = Number(origin.port);
  const capability = Buffer.from(randomBytes(32)).toString('hex');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const mediaPath = resolve(project, 'lib/riders/media-upload.ts').replaceAll('\\', '/');
  let active = 0;

  function reject(response: ServerResponse, status: number) {
    response.statusCode = status;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-content-type-options', 'nosniff');
    response.end('{"error":"Local image decoding was refused."}');
  }
  function authorized(request: IncomingMessage): boolean {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(authorization)) return false;
    return timingSafeEqual(Buffer.from(authorization.slice(7)), Buffer.from(capability));
  }
  async function decode(request: IncomingMessage, response: ServerResponse, type: string) {
    active++;
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const part = Buffer.from(chunk as Uint8Array);
        bytes += part.byteLength;
        if (bytes > maxBytes) { reject(response, 413); request.resume(); return; }
        chunks.push(part);
      }
      if (!bytes) { reject(response, 400); return; }
      // This is the existing production pipeline, running in native Node.
      // It validates actual MIME/single frame/20MP, rotates and bounds to4096,
      // reencodes JPEG90 and removes EXIF. No uploaded bytes are written here.
      const image = await prepareRiderEvidence(new File([Buffer.concat(chunks) as BlobPart], 'local-rider-image', { type }), false);
      response.statusCode = 200;
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', 'image/jpeg');
      response.setHeader('x-content-type-options', 'nosniff');
      response.end(Buffer.from(image.bytes));
    } catch {
      if (!response.headersSent) reject(response, 400);
    } finally { active--; }
  }

  // This source exists only in worker RSC/SSR transforms. The capability is
  // generated per dev-server process, never exported, persisted or logged.
  const workerSource = `import {validateProductVideo} from ${JSON.stringify(resolve(project, 'lib/media/product-video.ts').replaceAll('\\', '/'))};
const capability = ${JSON.stringify(capability)};
const endpoint = ${JSON.stringify(`http://127.0.0.1:${port}${endpointPath}`)};
const maxBytes = ${maxBytes};
export class RiderMediaError extends Error {}
export async function prepareRiderEvidence(file,videoAllowed){
 if(file.type==='video/mp4'&&videoAllowed){const error=await validateProductVideo(file);if(error)throw new RiderMediaError(error);return {bytes:new Uint8Array(await file.arrayBuffer()),mime:'video/mp4'};}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>maxBytes)throw new RiderMediaError('Use a JPG, PNG or WebP image up to 5 MB.');
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+capability,'content-type':file.type},body:new Uint8Array(await file.arrayBuffer()),redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok||response.headers.get('content-type')!=='image/jpeg'||!response.body)throw new Error('Decoder unavailable');
  const reader=response.body.getReader();let total=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error('Image too large');}chunks.push(value);}}finally{reader.releaseLock();}
  if(!total)throw new Error('Empty image');const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if(bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new Error('Invalid decoded JPEG');
  return {bytes,mime:'image/jpeg'};
 }catch{throw new RiderMediaError('The image could not be safely read. Use a valid image with at most 20 million pixels.');}
}
export function singleRiderFile(form,fields,required){const files=fields.flatMap(field=>form.getAll(field)).filter(v=>v instanceof File&&v.size>0);if(files.length>1||required&&files.length!==1)throw new RiderMediaError('Attach exactly one photo or video as proof.');return files[0]??null;}`;

  return {
    name: 'hastabazaar-local-rider-media-decoder', apply: 'serve', enforce: 'pre',
    applyToEnvironment: (selected) => selected.name === 'rsc' || selected.name === 'ssr',
    load(id) {
      if (!['rsc', 'ssr'].includes(this.environment.name)) return null;
      return id.split('?', 1)[0].replaceAll('\\', '/') === mediaPath ? workerSource : null;
    },
    configureServer(server) {
      if (server.config.server.host !== '127.0.0.1' || server.config.server.port !== port || server.config.server.strictPort !== true)
        throw new Error('The local rider decoder must share the strict loopback dev listener.');
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
        if (typeof type !== 'string' || !imageTypes.has(type) || request.headers['content-encoding'] !== undefined ||
          length !== undefined && (typeof length !== 'string' || !/^(0|[1-9]\d*)$/.test(length))) { reject(response, 400); return; }
        if (length !== undefined && Number(length) > maxBytes) { reject(response, 413); return; }
        if (active >= 2) { reject(response, 503); return; }
        void decode(request, response, type);
      });
    },
  };
}
