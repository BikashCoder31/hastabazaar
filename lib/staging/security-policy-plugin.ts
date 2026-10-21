import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { markLocalSecurityInitialized, readLocalSecurityPolicy } from '../../scripts/staging/security-key.mjs';
import { securityKeyId } from '../security/crypto';
import { LOCAL_SECURITY_POLICY_ORIGIN, LOCAL_SECURITY_POLICY_PATH, securityPolicyRequestSignature, type SecurityPolicyAction } from '../security/runtime-policy';

interface LocalPolicyOptions { projectRoot: string; key: string; origin: string; now?: () => number; }
const forbidden = () => Object.assign(new Error('Local security policy request refused.'), { status: 403 });

/** Node-only, authenticated service shared with the local Worker; never a browser API. */
export function createLocalSecurityPolicyHandler(options: LocalPolicyOptions) {
  if (options.origin !== LOCAL_SECURITY_POLICY_ORIGIN) throw forbidden();
  securityKeyId(options.key);
  const nonces = new Map<string, number>();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('cache-control', 'no-store, private');
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('x-content-type-options', 'nosniff');
    try {
      const remote = request.socket.remoteAddress;
      if (request.method !== 'POST' || request.url !== LOCAL_SECURITY_POLICY_PATH || request.headers.host !== 'localhost:3018' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '') || request.headers.origin !== undefined || request.headers.cookie !== undefined || ['sec-fetch-site', 'sec-fetch-dest'].some(name => request.headers[name] !== undefined) || ![undefined,'cors'].includes(request.headers['sec-fetch-mode'] as 'cors'|undefined)) throw forbidden();
      const signature = request.headers['x-hastabazaar-security-auth'];
      if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || typeof request.headers['content-type'] !== 'string' || !/^application\/json(?:;|$)/i.test(request.headers['content-type'])) throw forbidden();
      const declared = request.headers['content-length'];
      if (declared !== undefined && (typeof declared !== 'string' || !/^\d{1,4}$/.test(declared) || Number(declared) > 1_024)) throw forbidden();
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length; if (size > 1_024) throw forbidden(); chunks.push(bytes);
      }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw forbidden(); }
      const now = (options.now ?? Date.now)();
      if (!payload || Object.keys(payload).sort().join(',') !== 'action,nonce,timestamp' || !['read', 'initialize'].includes(payload.action) || !Number.isSafeInteger(payload.timestamp) || Math.abs(now - payload.timestamp) > 30_000 || typeof payload.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(payload.nonce)) throw forbidden();
      const expected = securityPolicyRequestSignature(options.key, payload.action as SecurityPolicyAction, payload.timestamp, payload.nonce);
      if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw forbidden();
      for (const [nonce, expiry] of nonces) if (expiry <= now) nonces.delete(nonce);
      if (nonces.has(payload.nonce) || nonces.size >= 4_096) throw forbidden();
      nonces.set(payload.nonce, now + 60_000);
      const state = payload.action === 'initialize' ? await markLocalSecurityInitialized(options.projectRoot, options.key) : await readLocalSecurityPolicy(options.projectRoot, options.key);
      response.statusCode = 200; response.end(JSON.stringify(state));
    } catch (error) {
      response.statusCode = error && typeof error === 'object' && 'status' in error && error.status === 403 ? 403 : 503;
      response.end(JSON.stringify({ error: response.statusCode === 403 ? 'Local security policy request refused.' : 'Local security metadata is unavailable. Preserve the existing key and review recovery.' }));
    }
  };
}

export function localSecurityPolicyPlugin(projectRoot = process.cwd()): Plugin {
  return { name: 'hastabazaar-local-security-policy', apply: 'serve', configureServer(server) {
    if (process.env.HASTABAZAAR_RUNTIME_ENV !== 'local_staging') return;
    if (process.env.NODE_ENV === 'production' || !process.env.HASTABAZAAR_SECURITY_KEY) throw forbidden();
    const handler = createLocalSecurityPolicyHandler({ projectRoot, key: process.env.HASTABAZAAR_SECURITY_KEY, origin: process.env.APP_ORIGIN ?? '' });
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== LOCAL_SECURITY_POLICY_PATH) { next(); return; }
      void handler(request, response);
    });
  } };
}
