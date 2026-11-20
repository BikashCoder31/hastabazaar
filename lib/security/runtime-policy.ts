import { createHmac, randomBytes } from 'node:crypto';
import { securityKeyId, SecurityStateError } from './crypto';

export const LOCAL_SECURITY_POLICY_PATH = '/_local-internal/security-state';
export const LOCAL_SECURITY_POLICY_ORIGIN = 'http://localhost:3018';
export type SecurityPolicyAction = 'read' | 'initialize';
export interface SecurityPolicyAdapter { read(): Promise<boolean>; mark(): Promise<void>; }
export interface SecurityPolicyBindings {
  HASTABAZAAR_SECURITY_KEY?: string;
  HASTABAZAAR_RUNTIME_ENV?: string;
  HASTABAZAAR_LOCAL_SKIP_STAFF_MFA?: string;
  HASTABAZAAR_SECURITY_INITIALIZED?: string;
  APP_ORIGIN?: string;
  /** Internal server binding for isolated fixtures or an explicitly reviewed host adapter. */
  SECURITY_POLICY?: SecurityPolicyAdapter;
}

const initializedKeys = new Set<string>();

export function securityPolicyRequestSignature(key: string, action: SecurityPolicyAction, timestamp: number, nonce: string): string {
  securityKeyId(key);
  if (!['read', 'initialize'].includes(action) || !Number.isSafeInteger(timestamp) || timestamp < 0 || !/^[a-f0-9]{32}$/.test(nonce)) throw new SecurityStateError();
  return createHmac('sha256', Buffer.from(key, 'base64url')).update(JSON.stringify(['hastabazaar-local-security-policy', 1, 'POST', LOCAL_SECURITY_POLICY_PATH, action, timestamp, nonce])).digest('hex');
}

function adapter(bindings: SecurityPolicyBindings): SecurityPolicyAdapter | undefined {
  if (bindings.SECURITY_POLICY === undefined) return undefined;
  const value = bindings.SECURITY_POLICY;
  if (!value || typeof value !== 'object' || typeof value.read !== 'function' || typeof value.mark !== 'function') throw new SecurityStateError();
  return value;
}

async function localPolicy(bindings: SecurityPolicyBindings, action: SecurityPolicyAction): Promise<boolean> {
  if (bindings.APP_ORIGIN !== LOCAL_SECURITY_POLICY_ORIGIN || !bindings.HASTABAZAAR_SECURITY_KEY) throw new SecurityStateError('Local security policy needs the checked localhost preview. No protection was removed.');
  const timestamp = Date.now(); const nonce = Buffer.from(randomBytes(16)).toString('hex');
  try {
    const response = await fetch(`${LOCAL_SECURITY_POLICY_ORIGIN}${LOCAL_SECURITY_POLICY_PATH}`, { method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(4_000), headers: {
      'content-type': 'application/json', 'x-hastabazaar-security-auth': securityPolicyRequestSignature(bindings.HASTABAZAAR_SECURITY_KEY, action, timestamp, nonce),
    }, body: JSON.stringify({ action, timestamp, nonce }) });
    if (!response.ok) throw new SecurityStateError();
    const raw = await response.text(); if (raw.length > 512) throw new SecurityStateError();
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(',') !== 'initialized,keyId' || typeof value.initialized !== 'boolean' || value.keyId !== securityKeyId(bindings.HASTABAZAAR_SECURITY_KEY) || (action === 'initialize' && value.initialized !== true)) throw new SecurityStateError();
    return value.initialized;
  } catch { throw new SecurityStateError('Local security state could not be checked. Restart the checked local preview; no protection was removed.'); }
}

export async function readSecurityInitialization(bindings: SecurityPolicyBindings): Promise<boolean> {
  const policy = adapter(bindings);
  if (bindings.HASTABAZAAR_RUNTIME_ENV === 'production' && (!policy || !bindings.HASTABAZAAR_SECURITY_KEY)) throw new SecurityStateError();
  if (!bindings.HASTABAZAAR_SECURITY_KEY) { if (policy) throw new SecurityStateError(); return false; }
  const keyId = securityKeyId(bindings.HASTABAZAAR_SECURITY_KEY);
  if (bindings.HASTABAZAAR_RUNTIME_ENV !== 'production' && initializedKeys.has(keyId)) return true;
  const initialized = policy ? await policy.read() : bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging' ? await localPolicy(bindings, 'read') : true;
  if (typeof initialized !== 'boolean') throw new SecurityStateError();
  if (initialized) initializedKeys.add(keyId);
  return initialized;
}

export async function markSecurityInitialized(bindings: SecurityPolicyBindings): Promise<void> {
  const policy = adapter(bindings);
  if (bindings.HASTABAZAAR_RUNTIME_ENV === 'production' && !policy) throw new SecurityStateError();
  if (!bindings.HASTABAZAAR_SECURITY_KEY) throw new SecurityStateError();
  const keyId = securityKeyId(bindings.HASTABAZAAR_SECURITY_KEY);
  if (policy) await policy.mark();
  else if (bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging') await localPolicy(bindings, 'initialize');
  initializedKeys.add(keyId);
}
