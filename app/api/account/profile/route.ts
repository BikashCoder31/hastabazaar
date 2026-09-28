import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, customerProfileRequestStatus, updateCustomerProfile } from '@/lib/db/repositories/customers';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { canonicalKey } from '@/lib/forms/submission';
import { validateAnswersForDefinition, FormValidationError } from '@/lib/forms/validation';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

type ProfileBody = { displayName?: unknown; phone?: unknown; locale?: unknown; idempotencyKey?: unknown;
  formVersion?: unknown; customAnswers?: unknown };
async function readProfileBody(request: Request): Promise<ProfileBody | null> {
  try {
    return await readBoundedJsonObject(request) as ProfileBody;
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error;
    return null;
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireCustomerApi();
    const body = await readProfileBody(request);
    if (!body || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey || body.idempotencyKey.length > 100 ||
      !['en-NP', 'ne-NP'].includes(body.locale as string) || typeof body.displayName !== 'string' || typeof body.phone !== 'string' ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers)) {
      return Response.json({ error: 'Valid profile values, form version, answers, and idempotency key are required.' }, { status: 400 });
    }
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const replay = await customerProfileRequestStatus(db, { userId: customer.userId, requestId: body.idempotencyKey,
      displayName: body.displayName, phone: body.phone, locale: body.locale as 'en-NP' | 'ne-NP',
      formVersion: body.formVersion as number, customAnswers: body.customAnswers });
    if (replay === 'same') return Response.json({ ok: true });
    if (replay === 'conflict') return Response.json({ error: 'This request ID was already used for different profile values.' }, { status: 409 });
    const config = await resolvePublishedForm(db, 'account.profile');
    if (body.formVersion !== config.version) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    const baseKeys = new Set(FORM_REGISTRY['account.profile'].baseFields.map((field) => canonicalKey(field.key)));
    for (const entry of body.customAnswers) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'fieldId' in entry && typeof entry.fieldId === 'string') {
        const field = config.fields.find((item) => item.id === entry.fieldId);
        if (field && baseKeys.has(canonicalKey(field.key))) return Response.json({ error: 'Built-in answers cannot be submitted as custom fields.' }, { status: 400 });
      }
    }
    for (const field of config.fields) {
      if (field.status !== 'active' || !field.required || baseKeys.has(canonicalKey(field.key))) continue;
      if (!body.customAnswers.some((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) &&
        'fieldId' in entry && entry.fieldId === field.id && 'value' in entry && entry.value !== '' && entry.value !== null &&
        (!Array.isArray(entry.value) || entry.value.length > 0))) {
        return Response.json({ error: `${field.label} is required.`, fieldId: field.id }, { status: 400 });
      }
    }
    const builtInAnswers = config.fields.filter((field) => field.status === 'active' && baseKeys.has(canonicalKey(field.key)))
      .flatMap((field) => {
        const key = canonicalKey(field.key);
        const value = key === 'displayname' ? body.displayName : key === 'phone' ? body.phone : undefined;
        return value ? [{ fieldId: field.id, value }] : [];
      });
    let answers;
    try {
      answers = validateAnswersForDefinition(FORM_REGISTRY['account.profile'], config, [...body.customAnswers, ...builtInAnswers]);
    } catch (error) {
      if (error instanceof FormValidationError) {
        for (const entry of body.customAnswers) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.fieldId !== 'string') continue;
          const field = config.fields.find((item) => item.id === entry.fieldId && item.status === 'active' && !baseKeys.has(canonicalKey(item.key)));
          if (!field) continue;
          try { validateAnswersForDefinition(FORM_REGISTRY['account.profile'], { ...config, fields: [field] }, [entry]); }
          catch (fieldError) {
            if (fieldError instanceof FormValidationError) return Response.json({ error: `${field.label} has an invalid answer.`, fieldId: field.id }, { status: 400 });
          }
        }
      }
      throw error;
    }
    const version = await db.prepare(`SELECT id FROM form_config_versions WHERE form_id = ? AND status = 'published' AND version = ? LIMIT 1`)
      .bind('account.profile', config.version).first<{ id: string }>();
    if (!version) throw new FormRuntimeError('config_unavailable', 'Published form version unavailable');
    await updateCustomerProfile(db, {
      userId: customer.userId,
      displayName: body.displayName,
      phone: body.phone,
      locale: body.locale as 'en-NP' | 'ne-NP',
      requestId: body.idempotencyKey,
      now: Date.now(),
      formVersion: config.version,
      versionId: version.id,
      answers,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: 'Profile submission is too large.' }, { status: 413 });
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.code === 'stale_version' ? error.message : 'Form configuration is unavailable.', code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: 'The profile could not be updated.' }, { status: 500 });
  }
}
