import { FORM_REGISTRY } from '../../forms/registry';
import type { CustomFieldType, FormAnswerSnapshot, FormId } from '../../forms/types';
import { validateAnswersForDefinition } from '../../forms/validation';

export class FormAnswerRepositoryError extends Error {
  constructor(message = 'Form answer snapshot is invalid.') {
    super(message);
    this.name = 'FormAnswerRepositoryError';
  }
}

export type StoredFormAnswer = {
  id: string;
  formId: FormId;
  requestId: string;
  versionId: string;
  subjectType: string;
  subjectId: string;
  actorId: string | null;
  answers: Omit<FormAnswerSnapshot, 'answers'> & { answers: readonly (FormAnswerSnapshot['answers'][number] & { choiceLabels?: readonly string[] })[] };
  createdAt: number;
  historicalFieldIds: readonly string[];
};

const FIELD_TYPES: readonly CustomFieldType[] = [
  'short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone',
];

function required(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new FormAnswerRepositoryError(`${label} is invalid.`);
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unsafeName(value: string): boolean {
  const parts = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return parts.some((part) => /^(?:password|passcode|credential|secret|token|otp|pin|pincode|verificationcode|securitycode|recoverycode|backupcode|resetcode|authcode|accesscode|apikey|privatekey|bankaccount|accountnumber|routingnumber|iban|swift|creditcard|debitcard|cardnumber|cardexpiry|cardcvv|cardcvc|cvv|cvc|payment|captcha|recaptcha|turnstile|honeypot|csrf)$/.test(part)) ||
    /(?:password|passcode|credential|secret|token|otp|payment|captcha|turnstile|honeypot|csrf)/i.test(value.replace(/[^a-z0-9]/gi, ''));
}

function validateInput(formId: FormId, raw: unknown): FormAnswerSnapshot {
  if (!FORM_REGISTRY[formId] || !record(raw) || Object.keys(raw).some((key) => !['formId', 'version', 'answers'].includes(key)) ||
      raw.formId !== formId || !Number.isSafeInteger(raw.version) || Number(raw.version) < 1 ||
      !Array.isArray(raw.answers) || raw.answers.length > 64) throw new FormAnswerRepositoryError();
  const seen = new Set<string>();
  const answers: FormAnswerSnapshot['answers'][number][] = [];
  for (const entry of raw.answers) {
    if (!record(entry) || Object.keys(entry).some((key) => !['fieldId', 'label', 'type', 'value', 'choiceLabels'].includes(key)) ||
        typeof entry.fieldId !== 'string' || !/^[a-z][a-z0-9_]*$/.test(entry.fieldId) ||
        seen.has(entry.fieldId) || unsafeName(entry.fieldId) ||
        typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 200 || unsafeName(entry.label) ||
        !FIELD_TYPES.includes(entry.type as CustomFieldType)) throw new FormAnswerRepositoryError();
    seen.add(entry.fieldId);
    const type = entry.type as CustomFieldType;
    if (entry.choiceLabels !== undefined && ((type !== 'single_choice' && type !== 'multiple_choice') ||
        !Array.isArray(entry.choiceLabels) ||
        !entry.choiceLabels.every((item) => typeof item === 'string' && item.length <= 200 && !unsafeName(item)))) {
      throw new FormAnswerRepositoryError();
    }
    const value = entry.value;
    if (type === 'checkbox' ? typeof value !== 'boolean' :
        type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) :
        type === 'multiple_choice' ? !Array.isArray(value) || value.length < 1 || value.length > 100 ||
          value.some((item) => typeof item !== 'string') || new Set(value).size !== value.length :
        typeof value !== 'string' || !value.trim() || value.length > (type === 'long_text' ? 5000 : 500)) {
      throw new FormAnswerRepositoryError();
    }
    answers.push({ fieldId: entry.fieldId, label: entry.label, type, value,
      ...(entry.choiceLabels ? { choiceLabels: entry.choiceLabels } : {}) });
  }
  const version = Number(raw.version);
  const checked = validateAnswersForDefinition(FORM_REGISTRY[formId], {
    formId, version, publishedAt: 0,
    fields: answers.map((answer, order) => ({
      id: answer.fieldId, key: answer.fieldId, label: answer.label, type: answer.type,
      required: false, order, status: 'active' as const,
      ...(answer.type === 'single_choice' || answer.type === 'multiple_choice' ? {
        choices: (Array.isArray(answer.value) ? answer.value : [answer.value]).map((value) => ({
          value: String(value), label: String(value),
        })),
      } : {}),
    })),
  }, answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })));
  if (checked.answers.length !== answers.length) throw new FormAnswerRepositoryError();
  return { formId, version, answers };
}

// Every predicate runs inside the caller's D1 batch, so invalid versions or
// snapshots abort the parent action instead of leaving an unlinked write.
const validAgainstVersion = `EXISTS (
  SELECT 1 FROM form_config_versions v
  WHERE v.id = ? AND v.form_id = ? AND v.status = 'published' AND v.version = ?
    AND NOT EXISTS (
      SELECT 1 FROM json_each(?, '$.answers') answer
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each(v.config_json, '$.fields') field
        WHERE json_extract(field.value, '$.id') = json_extract(answer.value, '$.fieldId')
          AND json_extract(field.value, '$.label') = json_extract(answer.value, '$.label')
          AND json_extract(field.value, '$.type') = json_extract(answer.value, '$.type')
          AND json_extract(field.value, '$.status') = 'active'
          AND (json_extract(field.value, '$.type') != 'checkbox'
            OR json_extract(field.value, '$.required') != 1
            OR json_type(answer.value, '$.value') = 'true')
          AND (json_extract(field.value, '$.type') NOT IN ('single_choice','multiple_choice')
            OR ((json_type(answer.value, '$.choiceLabels') IS NULL OR
              json_array_length(answer.value, '$.choiceLabels') =
                CASE WHEN json_extract(field.value, '$.type') = 'multiple_choice'
                  THEN json_array_length(answer.value, '$.value') ELSE 1 END)
              AND NOT EXISTS (
              SELECT 1 FROM json_each(
                CASE WHEN json_extract(field.value, '$.type') = 'multiple_choice'
                  THEN json_extract(answer.value, '$.value')
                  ELSE json_array(json_extract(answer.value, '$.value')) END
              ) selected
              WHERE NOT EXISTS (
                SELECT 1 FROM json_each(field.value, '$.choices') choice
                WHERE json_extract(choice.value, '$.value') = selected.value
                  AND (json_type(answer.value, '$.choiceLabels') IS NULL OR
                    json_extract(choice.value, '$.label') =
                      json_extract(answer.value, '$.choiceLabels[' || selected.key || ']'))
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%password%'
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%credential%'
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%secret%'
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%token%'
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%payment%'
                  AND lower(json_extract(choice.value, '$.label')) NOT LIKE '%captcha%'
              )
            )))
          AND (json_extract(field.value, '$.type') != 'number' OR
            ((json_extract(field.value, '$.min') IS NULL OR json_extract(answer.value, '$.value') >= json_extract(field.value, '$.min'))
              AND (json_extract(field.value, '$.max') IS NULL OR json_extract(answer.value, '$.value') <= json_extract(field.value, '$.max'))
              AND (json_extract(field.value, '$.integerOnly') IS NOT 1 OR json_extract(answer.value, '$.value') = CAST(json_extract(answer.value, '$.value') AS INTEGER))))
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM json_each(v.config_json, '$.fields') required_field
      WHERE json_extract(required_field.value, '$.status') = 'active'
        AND json_extract(required_field.value, '$.required') = 1
        AND NOT EXISTS (SELECT 1 FROM json_each(?) built_in
          WHERE built_in.value = lower(replace(json_extract(required_field.value, '$.key'), '_', '')))
        AND NOT EXISTS (SELECT 1 FROM json_each(?, '$.answers') given
          WHERE json_extract(given.value, '$.fieldId') = json_extract(required_field.value, '$.id'))
    )
)`;

/** Returns an unexecuted native statement for the parent domain batch. */
export function buildFormAnswerInsert(db: D1Database, input: {
  formId: FormId; requestId: string; versionId: string; subjectType: string; subjectId: string;
  actorId: string | null; answers: FormAnswerSnapshot; now: number;
}): D1PreparedStatement {
  const formId = required(input.formId, 'Form ID', 191);
  const requestId = required(input.requestId, 'Request ID', 191);
  const versionId = required(input.versionId, 'Version ID', 191);
  const subjectType = required(input.subjectType, 'Subject type', 64);
  const subjectId = required(input.subjectId, 'Subject ID', 191);
  const actorId = input.actorId === null ? null : required(input.actorId, 'Actor ID', 191);
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new FormAnswerRepositoryError('Timestamp is invalid.');
  const snapshot = validateInput(formId, input.answers);
  const builtInKeys = JSON.stringify(FORM_REGISTRY[formId].baseFields.map((field) =>
    field.key.replace(/[^a-z0-9]/gi, '').toLowerCase()));
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).length > 131072) throw new FormAnswerRepositoryError('Answer snapshot is too large.');
  return db.prepare(`INSERT INTO form_answer_sets
    (id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
    VALUES (?,?,?,?,?,?,?,CASE WHEN ${validAgainstVersion} THEN ? ELSE json_extract('invalid', '$') END,?)`)
    .bind(crypto.randomUUID(), formId, requestId, versionId, subjectType, subjectId, actorId,
      versionId, formId, snapshot.version, json, builtInKeys, json, json, input.now);
}

type AnswerRow = Omit<StoredFormAnswer, 'answers' | 'historicalFieldIds'> & {
  answersJson: string; configJson: string; currentConfigJson: string | null;
};

const answerSelect = `SELECT a.id, a.form_id AS formId, a.request_id AS requestId,
    a.config_version_id AS versionId, a.subject_type AS subjectType, a.subject_id AS subjectId,
    a.actor_id AS actorId, a.answers_json AS answersJson, a.created_at AS createdAt,
    v.config_json AS configJson, current.config_json AS currentConfigJson
    FROM form_answer_sets a JOIN form_config_versions v ON v.id=a.config_version_id
    LEFT JOIN form_config_versions current ON current.id=(SELECT id FROM form_config_versions
      WHERE form_id=a.form_id AND status='published' ORDER BY version DESC LIMIT 1)`;

function decodeAnswer(row: AnswerRow): StoredFormAnswer {
  const { answersJson, configJson, currentConfigJson, ...metadata } = row;
  try {
    const snapshot = validateInput(metadata.formId, JSON.parse(answersJson) as unknown);
    const config = JSON.parse(configJson) as { fields: { id: string; type: string; choices?: { value: string; label: string }[] }[] };
    const current = currentConfigJson ? JSON.parse(currentConfigJson) as { fields: { id: string; status: string }[] } : null;
    if (!Array.isArray(config.fields) || (current && !Array.isArray(current.fields))) throw new FormAnswerRepositoryError();
    const answers = snapshot.answers.map((answer) => {
      const field = config.fields.find((item) => item.id === answer.fieldId);
      if (!field || !field.choices || (field.type !== 'single_choice' && field.type !== 'multiple_choice')) return answer;
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      const labels = values.map((value) => field.choices?.find((choice) => choice.value === value)?.label);
      if (labels.some((label) => typeof label !== 'string' || unsafeName(label))) throw new FormAnswerRepositoryError();
      return { ...answer, choiceLabels: labels as string[] };
    });
    const historicalFieldIds = answers.filter((answer) =>
      !current?.fields.some((field) => field.id === answer.fieldId && field.status === 'active'))
      .map((answer) => answer.fieldId);
    return { ...metadata, answers: { ...snapshot, answers }, historicalFieldIds };
  } catch (error) {
    if (error instanceof FormAnswerRepositoryError) throw error;
    throw new FormAnswerRepositoryError('Stored answer snapshot is unavailable.');
  }
}

export async function getFormAnswerById(db: D1Database, answerId: string): Promise<StoredFormAnswer | null> {
  const id = required(answerId, 'Answer ID', 191);
  const row = await db.prepare(`${answerSelect} WHERE a.id=? LIMIT 1`).bind(id).first<AnswerRow>();
  return row ? decodeAnswer(row) : null;
}

export async function listFormAnswersForSubject(db: D1Database, subjectType: string, subjectId: string): Promise<StoredFormAnswer[]> {
  const type = required(subjectType, 'Subject type', 64);
  const id = required(subjectId, 'Subject ID', 191);
  const answers: StoredFormAnswer[] = [];
  let cursor: { createdAt: number; id: string } | null = null;
  while (true) {
    const rows: { results: AnswerRow[] } = await db.prepare(`${answerSelect}
      WHERE a.subject_type=? AND a.subject_id=?
        AND (? IS NULL OR a.created_at>? OR (a.created_at=? AND a.id>?))
      ORDER BY a.created_at,a.id LIMIT 100`)
      .bind(type, id, cursor?.createdAt ?? null, cursor?.createdAt ?? 0,
        cursor?.createdAt ?? 0, cursor?.id ?? '').all<AnswerRow>();
    answers.push(...rows.results.map(decodeAnswer));
    if (rows.results.length < 100) break;
    cursor = rows.results[rows.results.length - 1];
  }
  return answers;
}

export async function listFormAnswersForSubjectPage(db: D1Database, input: {
  subjectType: string; subjectId: string; formId: FormId;
  after?: { createdAt: number; id: string };
}): Promise<{ answers: StoredFormAnswer[]; nextCursor: { createdAt: number; id: string } | null }> {
  const type = required(input.subjectType, 'Subject type', 64);
  const id = required(input.subjectId, 'Subject ID', 191);
  const formId = required(input.formId, 'Form ID', 191);
  const after = input.after;
  if (after && (!Number.isSafeInteger(after.createdAt) || after.createdAt < 0))
    throw new FormAnswerRepositoryError('History cursor is invalid.');
  const cursorId = after ? required(after.id, 'History cursor', 191) : '';
  const rows = await db.prepare(`${answerSelect}
    WHERE a.subject_type=? AND a.subject_id=? AND a.form_id=?
      AND (? IS NULL OR a.created_at>? OR (a.created_at=? AND a.id>?))
    ORDER BY a.created_at,a.id LIMIT 51`)
    .bind(type, id, formId, after?.createdAt ?? null,
      after?.createdAt ?? 0, after?.createdAt ?? 0, cursorId).all<AnswerRow>();
  const page = rows.results.slice(0, 50);
  const last = page.at(-1);
  return { answers: page.map(decodeAnswer), nextCursor: rows.results.length > 50 && last
    ? { createdAt: last.createdAt, id: last.id } : null };
}
