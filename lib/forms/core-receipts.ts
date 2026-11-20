import { createHash } from 'node:crypto';
import { coreFormReceiptId as legacyReceiptId, LEGACY_CORE_FORM_IDS, coreFormContract } from './core-contracts';

// Server-only receipt addressing: retain all original core IDs; bound new native
// receipt IDs to the actual MariaDB VARCHAR(191) key without narrowing native request IDs.
export function coreFormReceiptId(formId: string, requestId: string): string {
  if (LEGACY_CORE_FORM_IDS.has(formId)) return legacyReceiptId(formId, requestId);
  if (!coreFormContract(formId) || !requestId || requestId.length > 191 || requestId !== requestId.trim())
    throw new Error('Invalid core form request.');
  const digest = createHash('sha256').update(JSON.stringify([formId, requestId])).digest('hex');
  return `core-form:${formId}:${digest}`;
}
