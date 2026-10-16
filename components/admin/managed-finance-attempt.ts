import type { PublishedFormConfig } from '@/lib/forms/types';
import type { ManagedFinanceAction } from '@/lib/managed-commerce/finance-contract';
import { managedFinanceAction } from '@/lib/managed-commerce/finance-contract';
import { digestFormRequest } from '@/lib/forms/submission';
import { parsePublishedFormConfig } from '@/components/forms/form-config-client';
export interface FinanceAttemptScope { ownerId: string; sellerId: string; action: ManagedFinanceAction }
export interface RetainedManagedFinanceAttempt extends FinanceAttemptScope {
  schema: 1; formId: string; requestId: string; body: Record<string, unknown>; config: PublishedFormConfig; digest: string;
}
const prefix = 'hastabazaar:managed-finance:v1:';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function financeAttemptPrefix(scope: Pick<FinanceAttemptScope, 'ownerId' | 'sellerId'>) {
  return `${prefix}${encodeURIComponent(scope.ownerId)}:${encodeURIComponent(scope.sellerId)}:`;
}
export function financeAttemptKey(operation: RetainedManagedFinanceAttempt) {
  return `${financeAttemptPrefix(operation)}${operation.action}:${encodeURIComponent(typeof operation.body.payoutId === 'string' ? operation.body.payoutId : operation.sellerId)}`;
}
function validBody(action: ManagedFinanceAction, body: Record<string, unknown>) {
  const definition = managedFinanceAction(action);
  if (!definition || Object.keys(body).some(key => !['action','requestId','formVersion','customAnswers',...definition.keys].includes(key)) ||
    body.action !== action || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.requestId) ||
    typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.length > 1000 || !Array.isArray(body.customAnswers)) return false;
  if (action === 'prepare_sale_linked_payout') return typeof body.destinationReference === 'string' && body.destinationReference.trim().length >= 3 &&
    body.destinationReference.length <= 191 && Number.isSafeInteger(body.scheduledFor) && Number(body.scheduledFor) >= 0 &&
    Number.isSafeInteger(body.expectedAmountPaisa) && Number(body.expectedAmountPaisa) > 0 && typeof body.expectedSnapshot === 'string' && /^[a-f0-9]{64}$/.test(body.expectedSnapshot);
  return action === 'release_eligibility' || typeof body.payoutId === 'string' && body.payoutId.length > 0 && body.payoutId.length <= 191 &&
    ['prepared','approved','processing','failed'].includes(String(body.expectedStatus)) &&
    (action !== 'record_sale_linked_payment' || typeof body.providerReference === 'string' && body.providerReference.trim().length >= 3 && body.providerReference.length <= 191);
}
export async function createManagedFinanceAttempt(scope: FinanceAttemptScope, rawBody: Record<string, unknown>, config: PublishedFormConfig): Promise<RetainedManagedFinanceAttempt> {
  const definition = managedFinanceAction(scope.action);
  if (!scope.ownerId || !scope.sellerId || !definition || !parsePublishedFormConfig(definition.formId, { config })) throw new Error('Reload the payment form before continuing.');
  const requestId = crypto.randomUUID();
  const body = { ...rawBody, action: scope.action, requestId, formVersion: config.version };
  if (!validBody(scope.action, body)) throw new Error('Review the payment fields before continuing.');
  const original = JSON.parse(JSON.stringify({ ...scope, schema: 1, formId: definition.formId, requestId, body, config })) as Omit<RetainedManagedFinanceAttempt,'digest'>;
  return { ...original, digest: await digestFormRequest(original) };
}
export async function readManagedFinanceAttempts(storage: Storage, scope: Pick<FinanceAttemptScope,'ownerId'|'sellerId'>): Promise<RetainedManagedFinanceAttempt[]> {
  const records: RetainedManagedFinanceAttempt[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(financeAttemptPrefix(scope))) continue;
    const raw = storage.getItem(key);
    if (!raw || raw.length > 524288) throw new Error('A recorded payment attempt cannot be read. Check payment history before clearing it.');
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('The recorded payment attempt is invalid.');
    const { digest, ...original } = value;
    const definition = managedFinanceAction(value.action);
    if (value.schema !== 1 || value.ownerId !== scope.ownerId || value.sellerId !== scope.sellerId || !definition ||
      value.formId !== definition.formId || !object(value.body) || !validBody(value.action as ManagedFinanceAction,value.body) ||
      value.requestId !== value.body.requestId || !parsePublishedFormConfig(definition.formId,{config:value.config}) ||
      (value.config as PublishedFormConfig).version !== value.body.formVersion || digest !== await digestFormRequest(original) ||
      financeAttemptKey(value as unknown as RetainedManagedFinanceAttempt) !== key) throw new Error('The recorded payment attempt changed. Check history before clearing it.');
    records.push(value as unknown as RetainedManagedFinanceAttempt);
  }
  return records;
}
export function retainManagedFinanceAttempt(storage: Storage, operation: RetainedManagedFinanceAttempt) {
  const key = financeAttemptKey(operation);
  if (storage.getItem(key) !== null) throw new Error('Retry the recorded operation before starting another attempt.');
  const json = JSON.stringify(operation);
  if (json.length > 524288) throw new Error('The payment form is too large to retain safely.');
  storage.setItem(key,json);
  if (storage.getItem(key) !== json) throw new Error('The operation could not be saved for safe retry.');
}
export function verifiedManagedFinanceReceipt(operation: RetainedManagedFinanceAttempt, value: unknown): boolean {
  if (!object(value) || value.ok !== true || value.simulation !== true || value.requestId !== operation.requestId ||
    value.sellerId !== operation.sellerId || value.action !== operation.action) return false;
  if (operation.action === 'release_eligibility') return Number.isSafeInteger(value.released) && Number(value.released) >= 0;
  if (typeof value.payoutId !== 'string' || !value.payoutId) return false;
  if (operation.action === 'prepare_sale_linked_payout') return value.amountPaisa === operation.body.expectedAmountPaisa && ['prepared','approved'].includes(String(value.status));
  return value.payoutId === operation.body.payoutId && value.status === (operation.action === 'approve_sale_linked_payout' ? 'approved' : operation.action === 'cancel_sale_linked_payout' ? 'rejected' : 'paid');
}
