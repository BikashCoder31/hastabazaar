import { env } from 'cloudflare:workers';

import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';
import {
  beginFeedbackSend, claimFeedbackDelivery, completeFeedbackSend,
  createFeedbackSubmission, decodeFeedbackJob, findFeedbackDeliveryJob,
  isFeedbackDeliveryExhausted, rejectFeedbackBeforeSend, type FeedbackDeliveryJob,
} from '@/lib/db/repositories/feedback-submissions';
import { FeedbackDeliveryUnavailableError, sendCustomerFeedbackEmail } from '@/lib/email/customer-feedback';
import { validateCustomerFeedback } from '@/lib/feedback/customer-feedback';
import type { CustomerFeedback } from '@/lib/feedback/customer-feedback';
import { FormRuntimeError, resolvePublishedForm, validateSubmittedForm } from '@/lib/forms/runtime';
import { canonicalKey } from '@/lib/forms/submission';
import type { FormId, PublishedFormConfig } from '@/lib/forms/types';
import { FormValidationError } from '@/lib/forms/validation';
import { readBoundedForm } from '@/lib/http/bounded-body';
import {
  consumePublicRequestRateLimit,
  consumeRequestRateLimit,
  rateLimitJson,
} from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

const noStoreHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status: number) => Response.json(body, { status, headers: noStoreHeaders });
const retryableDelivery = () => json({ code: 'delivery_retryable',
  error: 'Your message was not sent. Retry without changing it.' }, 503);
const uncertainDelivery = () => json({ code: 'delivery_uncertain',
  error: 'Delivery is uncertain. Your message may have been sent. Contact support before sending a new message.' }, 503);
const exhaustedDelivery = () => json({ code: 'delivery_exhausted',
  error: 'Your message was not sent after repeated delivery failures. Contact support before starting a new message.' }, 503);
const requestConflict = { code: 'request_id_conflict', error: 'Your earlier message may have been sent. These edits were not sent. Contact support before sending a new message.' };
const commonKeys = new Set(['kind', 'pagePath', 'website', 'name', 'email', 'topic', 'message',
  'privacyAcknowledgement', 'requestId', 'formVersion']);
const variants = {
  contact: { formId: 'public.contact', path: '/contact-us', extra: ['phone', 'subject', 'orderReference'] },
  feedback: { formId: 'public.feedback', path: '/feedback', extra: ['phone', 'subject', 'rating'] },
  footer: { formId: 'public.footer-feedback', path: null, extra: ['orderReference'] },
} as const;

function formContract(form: FormData): { formId: FormId; requestId: string; version: number } | null {
  const kind = form.get('kind');
  if (typeof kind !== 'string' || !Object.hasOwn(variants, kind)) return null;
  const variant = variants[kind as keyof typeof variants];
  if (variant.path && form.get('pagePath') !== variant.path) return null;
  for (const key of form.keys()) {
    const values = form.getAll(key);
    if (values.length > (key.startsWith('custom.') ? 100 : 1) ||
      values.some((value) => typeof value !== 'string') ||
      !commonKeys.has(key) && !variant.extra.some((value) => value === key) && !key.startsWith('custom.')) return null;
  }
  const requestId = form.get('requestId');
  const rawVersion = form.get('formVersion');
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9._:-]{8,191}$/.test(requestId) ||
    typeof rawVersion !== 'string' || !/^[1-9]\d*$/.test(rawVersion)) return null;
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version)) return null;
  return { formId: variant.formId, requestId, version };
}

async function formHash(form: FormData): Promise<string> {
  const entries = [...form.entries()].filter(([key]) => key !== 'website').map(([key, value]) => {
    if (typeof value !== 'string') throw new Error('Unsupported feedback value.');
    return [key, value] as const;
  }).toSorted(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(entries)));
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function configuredAnswers(form: FormData, config: PublishedFormConfig, feedback: CustomerFeedback): unknown[] {
  const fields = new Map(config.fields.filter((field) => field.status === 'active').map((field) => [field.id, field]));
  const customKeys = [...new Set([...form.keys()].filter((key) => key.startsWith('custom.')))];
  const safeBuiltIns = { name: 'name', email: 'email', phone: 'phone', topic: 'topic', message: 'message' } as const;
  if (customKeys.some((key) => !fields.has(key.slice(7)) || Object.hasOwn(safeBuiltIns, canonicalKey(key.slice(7)))))
    throw new FormValidationError('invalid_answer', 'Unknown answer field');
  const answers: { fieldId: string; value: unknown }[] = [];
  for (const field of config.fields) {
    if (field.status !== 'active') continue;
    const builtIn = safeBuiltIns[canonicalKey(field.id) as keyof typeof safeBuiltIns];
    if (builtIn) {
      const value = feedback[builtIn];
      if (value) answers.push({ fieldId: field.id, value });
      continue;
    }
    const values = form.getAll(`custom.${field.id}`);
    if (values.some((value) => typeof value !== 'string') ||
      field.type !== 'multiple_choice' && values.length > 1) throw new FormValidationError('invalid_answer', 'Duplicate or invalid answer field', field.id);
    if (field.type === 'checkbox') { answers.push({ fieldId: field.id, value: values.length > 0 }); continue; }
    if (!values.length || values.length === 1 && values[0] === '') continue;
    if (field.type === 'multiple_choice') { answers.push({ fieldId: field.id, value: values }); continue; }
    if (field.type === 'number') answers.push({ fieldId: field.id, value: Number(values[0]) });
    else answers.push({ fieldId: field.id, value: values[0] });
  }
  return answers;
}

async function deliver(db: D1Database, job: FeedbackDeliveryJob): Promise<Response> {
  if (job.status === 'sent') return json({ ok: true }, 200);
  // A sending lease is never reclaimed: the mail transport could already have accepted it.
  if (job.status === 'sending') return uncertainDelivery();
  if (isFeedbackDeliveryExhausted(job, Date.now())) return exhaustedDelivery();
  let feedback: CustomerFeedback;
  try {
    const answers = await listFormAnswersForSubject(db, 'feedback_submission', job.id);
    if (answers.length !== 1 || answers[0].formId !== job.formId || answers[0].requestId !== job.requestId)
      return uncertainDelivery();
    feedback = decodeFeedbackJob(job);
  } catch { return uncertainDelivery(); }
  const now = Date.now();
  const token = await claimFeedbackDelivery(db, job.id, now);
  if (!token || !(await beginFeedbackSend(db, job.id, token, Date.now()))) {
    const current = await findFeedbackDeliveryJob(db, job.requestId);
    return current?.status === 'sent' ? json({ ok: true }, 200)
      : current && isFeedbackDeliveryExhausted(current, Date.now()) ? exhaustedDelivery()
      : uncertainDelivery();
  }
  try {
    await sendCustomerFeedbackEmail(feedback);
    if (!(await completeFeedbackSend(db, job.id, token, Date.now())))
      return uncertainDelivery();
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof FeedbackDeliveryUnavailableError) {
      try {
        if (await rejectFeedbackBeforeSend(db, job.id, token, Date.now())) {
          const current = await findFeedbackDeliveryJob(db, job.requestId);
          return current && isFeedbackDeliveryExhausted(current, Date.now())
            ? exhaustedDelivery() : retryableDelivery();
        }
      } catch { /* keep uncertain state */ }
    }
    return uncertainDelivery();
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);

  let form: FormData;
  try {
    form = await readBoundedForm(request, 16 * 1024);
  } catch { return json({ error: 'The submitted form is invalid or too large.' }, 413); }

  // Bots commonly populate this visually hidden field. Return a neutral success
  // response without sending mail so the endpoint does not become a spam relay.
  if (form.get('website')) return json({ ok: true }, 200);

  const contract = formContract(form);
  if (!contract) return json({ error: 'The submitted form is invalid.' }, 400);

  const validation = validateCustomerFeedback(form);
  if (!validation.ok) return json({ error: validation.error }, 400);

  try {
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    let job = await findFeedbackDeliveryJob(database, contract.requestId);
    if (job) {
      const payloadHash = await formHash(form);
      if (job.formId !== contract.formId || job.payloadHash !== payloadHash)
        return json(requestConflict, 409);
      return deliver(database, job);
    }
    const networkLimit = await consumePublicRequestRateLimit(database, request, {
      scope: 'public-feedback', limit: 10, windowMs: 15 * 60_000,
    });
    if (!networkLimit.allowed) return rateLimitJson(networkLimit);
    const addressLimit = await consumeRequestRateLimit(database, request, {
      scope: `public-feedback:${validation.feedback.email}`, limit: 3, windowMs: 60 * 60_000,
    });
    if (!addressLimit.allowed) return rateLimitJson(addressLimit);

    const payloadHash = await formHash(form);
    const config = await resolvePublishedForm(database, contract.formId);
    const answers = await validateSubmittedForm(database, contract.formId, contract.version,
      configuredAnswers(form, config, validation.feedback));
    try {
      job = await createFeedbackSubmission(database, { formId: contract.formId, requestId: contract.requestId,
        payloadHash, feedback: validation.feedback, answers, now: Date.now() });
    } catch {
      job = await findFeedbackDeliveryJob(database, contract.requestId);
      if (!job) {
        const current = await resolvePublishedForm(database, contract.formId);
        return current.version !== contract.version
          ? json({ error: 'This form changed. Refresh and review your answers.' }, 409)
          : uncertainDelivery();
      }
      if (job.formId !== contract.formId || job.payloadHash !== payloadHash)
        return json(requestConflict, 409);
    }
    return deliver(database, job);
  } catch (error) {
    if (error instanceof FormRuntimeError && error.code === 'stale_version')
      return json({ error: 'This form changed. Refresh and review your answers.' }, 409);
    if (error instanceof FormValidationError)
      return json({ error: error.fieldId ? `${error.fieldId} has an invalid answer.` : 'The submitted answers are invalid.', fieldId: error.fieldId }, 400);
    return uncertainDelivery();
  }
}
