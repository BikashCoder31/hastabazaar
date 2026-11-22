import { GUEST_NATIVE_FORM_IDS } from '../../forms/catalog-policy';
import { coreFormReceiptId } from '../../forms/core-receipts';
import { FORM_REGISTRY } from '../../forms/registry';
import type { CustomFieldType, FormAnswerSnapshot, FormId } from '../../forms/types';
import { validateAnswersForDefinition } from '../../forms/validation';
import { normalizeSellerSku } from '../../products/stock-codes';
import { coreFormContract, coreFormVersionId } from '../../forms/core-contracts';
import { compatibilityGrantId, compatibilityRevocationId } from '../../forms/compatibility';
import { compatibilityAwareSellerForms } from '../../forms/catalog-changes';
import {readDatabaseHealthScope} from '../health-context';

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
  if (!FORM_REGISTRY[formId] || !record(raw) || Object.keys(raw).some((key) => !['formId', 'version', 'presentedVersion', 'answers', 'productIdentity'].includes(key)) ||
      raw.formId !== formId || !Number.isSafeInteger(raw.version) || Number(raw.version) < 1 ||
      !Array.isArray(raw.answers) || raw.answers.length > 64) throw new FormAnswerRepositoryError();
  if (raw.presentedVersion !== undefined && (!compatibilityAwareSellerForms.has(formId) || !Number.isSafeInteger(raw.presentedVersion) || Number(raw.presentedVersion) < 1 || Number(raw.presentedVersion) >= Number(raw.version)))
    throw new FormAnswerRepositoryError();
  let productIdentity: FormAnswerSnapshot['productIdentity'];
  if (raw.productIdentity !== undefined) {
    if (formId !== 'seller.product-submission' || !record(raw.productIdentity) ||
      Object.keys(raw.productIdentity).some(key=>!['sellerSku','revision'].includes(key)) || !Object.hasOwn(raw.productIdentity, 'sellerSku')) throw new FormAnswerRepositoryError();
    try {
      const sellerSku = normalizeSellerSku(raw.productIdentity.sellerSku);
      if (sellerSku !== raw.productIdentity.sellerSku) throw new FormAnswerRepositoryError();
      const revision=raw.productIdentity.revision;
      if(revision!==undefined&&(!Number.isSafeInteger(revision)||Number(revision)<1))throw new FormAnswerRepositoryError();
      productIdentity = { sellerSku,...(revision===undefined?{}:{revision:Number(revision)}) };
    } catch { throw new FormAnswerRepositoryError(); }
  }
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
  return { formId, version, answers, ...(raw.presentedVersion === undefined ? {} : { presentedVersion: Number(raw.presentedVersion) }), ...(productIdentity ? { productIdentity } : {}) };
}

// Every predicate runs inside the caller's D1 batch, so invalid versions or
// snapshots abort the parent action instead of leaving an unlinked write.
// Materialize the validation stages to stay below D1's SQLite expression-depth
// limit without dropping any checks from the native parent transaction.
const validAgainstVersion = (optionalRegistration = false) => `WITH current_version AS MATERIALIZED (
  SELECT v.config_json FROM form_config_versions v
  WHERE v.id=? AND v.form_id=? AND v.status='published' AND v.version=?
    AND json_type(v.config_json,'$.formId')='text' AND json_extract(v.config_json,'$.formId')=v.form_id
    AND json_type(v.config_json,'$.fields')='array'
    AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest
      WHERE latest.form_id=v.form_id AND latest.status='published')
), answer_fields AS MATERIALIZED (
  SELECT answer.value AS answer_json,
    (SELECT field.value FROM json_each(v.config_json,'$.fields') field
      WHERE json_extract(field.value,'$.id')=json_extract(answer.value,'$.fieldId') LIMIT 1) AS field_json
  FROM current_version v,json_each(?,'$.answers') answer
), selected_choices AS MATERIALIZED (
  SELECT answer.answer_json,answer.field_json,selected.value AS selected_value,
    selected.key AS selected_index
  FROM answer_fields answer,json_each(
    CASE WHEN json_extract(answer.field_json,'$.type')='multiple_choice'
      THEN json_extract(answer.answer_json,'$.value')
      ELSE json_array(json_extract(answer.answer_json,'$.value')) END) selected
  WHERE json_extract(answer.field_json,'$.type') IN ('single_choice','multiple_choice')
)
SELECT EXISTS(SELECT 1 FROM current_version)
  AND NOT EXISTS (SELECT 1 FROM current_version v,json_each(v.config_json,'$.fields') configured_field WHERE
    json_type(configured_field.value) IS NOT 'object'
    OR json_type(configured_field.value,'$.id') IS NOT 'text'
    OR json_type(configured_field.value,'$.key') IS NOT 'text'
    OR length(trim(json_extract(configured_field.value,'$.key')))=0
    OR json_type(configured_field.value,'$.label') IS NOT 'text'
    OR json_type(configured_field.value,'$.type') IS NOT 'text'
    OR json_extract(configured_field.value,'$.type') NOT IN
      ('short_text','long_text','number','date','single_choice','multiple_choice','checkbox','email','phone')
    OR json_type(configured_field.value,'$.status') IS NOT 'text'
    OR json_extract(configured_field.value,'$.status') NOT IN ('active','archived')
    OR COALESCE(json_type(configured_field.value,'$.required'),'missing') NOT IN ('true','false')
    OR (json_type(configured_field.value,'$.integerOnly') IS NOT NULL
      AND json_type(configured_field.value,'$.integerOnly') NOT IN ('true','false'))
    OR (json_type(configured_field.value,'$.min') IS NOT NULL
      AND json_type(configured_field.value,'$.min') NOT IN ('integer','real'))
    OR (json_type(configured_field.value,'$.max') IS NOT NULL
      AND json_type(configured_field.value,'$.max') NOT IN ('integer','real'))
    OR NOT (json_extract(configured_field.value,'$.key')=json_extract(configured_field.value,'$.id')
      OR (lower(replace(json_extract(configured_field.value,'$.key'),'_',''))=
            lower(replace(json_extract(configured_field.value,'$.id'),'_',''))
        AND EXISTS (SELECT 1 FROM json_each(?) built_in WHERE built_in.value=
          lower(replace(json_extract(configured_field.value,'$.key'),'_','')))))
  )

  AND NOT EXISTS (SELECT 1 FROM answer_fields answer WHERE
    answer.field_json IS NULL
    OR json_extract(answer.field_json,'$.label') IS NOT json_extract(answer.answer_json,'$.label')
    OR json_extract(answer.field_json,'$.type') IS NOT json_extract(answer.answer_json,'$.type')
    OR json_extract(answer.field_json,'$.status') IS NOT 'active'
    OR (json_extract(answer.field_json,'$.type')='checkbox'
      AND (${optionalRegistration ? '1' : "json_extract(answer.field_json,'$.required')!=1"}
        OR json_type(answer.answer_json,'$.value')='true') IS NOT 1)
    OR (json_extract(answer.field_json,'$.type') IN ('single_choice','multiple_choice')
      AND json_type(answer.answer_json,'$.choiceLabels') IS NOT NULL
      AND json_array_length(answer.answer_json,'$.choiceLabels')!=
        CASE WHEN json_extract(answer.field_json,'$.type')='multiple_choice'
          THEN json_array_length(answer.answer_json,'$.value') ELSE 1 END)
    OR (json_extract(answer.field_json,'$.type')='number'
      AND ((json_extract(answer.field_json,'$.min') IS NOT NULL
          AND json_extract(answer.answer_json,'$.value')<json_extract(answer.field_json,'$.min'))
        OR (json_extract(answer.field_json,'$.max') IS NOT NULL
          AND json_extract(answer.answer_json,'$.value')>json_extract(answer.field_json,'$.max'))
        OR (json_extract(answer.field_json,'$.integerOnly')=1
          AND json_extract(answer.answer_json,'$.value')!=CAST(json_extract(answer.answer_json,'$.value') AS INTEGER))))
  )
  AND NOT EXISTS (SELECT 1 FROM selected_choices selected WHERE NOT EXISTS (
    SELECT 1 FROM json_each(selected.field_json,'$.choices') choice
    WHERE json_type(choice.value,'$.label')='text'
      AND json_extract(choice.value,'$.value')=selected.selected_value
      AND (json_type(selected.answer_json,'$.choiceLabels') IS NULL OR
        json_extract(choice.value,'$.label')=
          json_extract(selected.answer_json,'$.choiceLabels['||selected.selected_index||']'))
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%password%'
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%credential%'
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%secret%'
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%token%'
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%payment%'
      AND lower(json_extract(choice.value,'$.label')) NOT LIKE '%captcha%'
  ))
  AND NOT EXISTS (SELECT 1 FROM current_version v,json_each(v.config_json,'$.fields') required_field
    WHERE json_extract(required_field.value,'$.status')='active'
      AND ${optionalRegistration ? '0' : "json_extract(required_field.value,'$.required')=1"}
      AND NOT EXISTS (SELECT 1 FROM json_each(?) built_in
        WHERE built_in.value=lower(replace(json_extract(required_field.value,'$.key'),'_','')))
      AND NOT EXISTS (SELECT 1 FROM json_each(?,'$.answers') given
        WHERE json_extract(given.value,'$.fieldId')=json_extract(required_field.value,'$.id'))
  )`;

// MariaDB has no MATERIALIZED hint or json_each. JSON_TABLE provides the same
// array rows. String type guards and binary scalar comparisons preserve both
// JSON types and text identity; JSON_VALUE alone coerces numbers into text.
const mariaValidAgainstVersion = (optionalRegistration = false) => `WITH current_version AS (
  SELECT v.config_json FROM form_config_versions v
  WHERE v.id=? AND v.form_id=? AND v.status='published' AND v.version=?
    AND JSON_TYPE(JSON_EXTRACT(v.config_json,'$.formId'))='STRING'
    AND BINARY JSON_VALUE(v.config_json,'$.formId')=BINARY v.form_id
    AND JSON_TYPE(JSON_EXTRACT(v.config_json,'$.fields'))='ARRAY'
    AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest
      WHERE latest.form_id=v.form_id AND latest.status='published')
), answer_fields AS (
  SELECT answer.value AS answer_json,
    (SELECT field.value FROM JSON_TABLE(v.config_json,'$.fields[*]' COLUMNS (value JSON PATH '$')) field
      WHERE BINARY JSON_VALUE(field.value,'$.id')=BINARY JSON_VALUE(answer.value,'$.fieldId') LIMIT 1) AS field_json
  FROM current_version v,JSON_TABLE(?,'$.answers[*]' COLUMNS (value JSON PATH '$')) answer
), selected_choices AS (
  SELECT answer.answer_json,answer.field_json,selected.value AS selected_value,
    selected.ordinality-1 AS selected_index
  FROM answer_fields answer,JSON_TABLE(
    CASE WHEN JSON_VALUE(answer.field_json,'$.type')='multiple_choice'
      THEN JSON_EXTRACT(answer.answer_json,'$.value')
      ELSE JSON_ARRAY(JSON_VALUE(answer.answer_json,'$.value')) END,
    '$[*]' COLUMNS (ordinality FOR ORDINALITY,value LONGTEXT PATH '$')) selected
  WHERE JSON_VALUE(answer.field_json,'$.type') IN ('single_choice','multiple_choice')
)
SELECT EXISTS(SELECT 1 FROM current_version)
  AND NOT EXISTS (SELECT 1 FROM current_version v,
    JSON_TABLE(v.config_json,'$.fields[*]' COLUMNS (value JSON PATH '$')) configured_field WHERE
    NOT (JSON_TYPE(configured_field.value) <=> 'OBJECT')
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.id')) <=> 'STRING')
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.key')) <=> 'STRING')
    OR CHAR_LENGTH(TRIM(JSON_VALUE(configured_field.value,'$.key')))=0
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.label')) <=> 'STRING')
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.type')) <=> 'STRING')
    OR BINARY JSON_VALUE(configured_field.value,'$.type') NOT IN
      ('short_text','long_text','number','date','single_choice','multiple_choice','checkbox','email','phone')
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.status')) <=> 'STRING')
    OR BINARY JSON_VALUE(configured_field.value,'$.status') NOT IN ('active','archived')
    OR NOT (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.required')) <=> 'BOOLEAN')
    OR (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.integerOnly')) IS NOT NULL
      AND JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.integerOnly'))!='BOOLEAN')
    OR (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.min')) IS NOT NULL
      AND JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.min')) NOT IN ('INTEGER','DOUBLE'))
    OR (JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.max')) IS NOT NULL
      AND JSON_TYPE(JSON_EXTRACT(configured_field.value,'$.max')) NOT IN ('INTEGER','DOUBLE'))
    OR NOT (BINARY JSON_VALUE(configured_field.value,'$.key')=BINARY JSON_VALUE(configured_field.value,'$.id')
      OR (BINARY LOWER(REPLACE(JSON_VALUE(configured_field.value,'$.key'),'_',''))=
            BINARY LOWER(REPLACE(JSON_VALUE(configured_field.value,'$.id'),'_',''))
        AND EXISTS (SELECT 1 FROM JSON_TABLE(?,'$[*]' COLUMNS (value LONGTEXT PATH '$')) built_in
          WHERE BINARY built_in.value=BINARY LOWER(REPLACE(JSON_VALUE(configured_field.value,'$.key'),'_','')))))
  )

  AND NOT EXISTS (SELECT 1 FROM answer_fields answer WHERE
    answer.field_json IS NULL
    OR JSON_TYPE(JSON_EXTRACT(answer.field_json,'$.label'))!='STRING'
    OR NOT (BINARY JSON_VALUE(answer.field_json,'$.label') <=> BINARY JSON_VALUE(answer.answer_json,'$.label'))
    OR NOT (BINARY JSON_VALUE(answer.field_json,'$.type') <=> BINARY JSON_VALUE(answer.answer_json,'$.type'))
    OR NOT (BINARY JSON_VALUE(answer.field_json,'$.status') <=> BINARY 'active')
    OR (JSON_VALUE(answer.field_json,'$.type')='checkbox'
      AND (${optionalRegistration ? 'TRUE' : "NULLIF(JSON_EXTRACT(answer.field_json,'$.required'),'null')!='true'"}
        OR JSON_EXTRACT(answer.answer_json,'$.value')='true') IS NOT TRUE)
    OR (JSON_VALUE(answer.field_json,'$.type') IN ('single_choice','multiple_choice')
      AND JSON_TYPE(JSON_EXTRACT(answer.answer_json,'$.choiceLabels')) IS NOT NULL
      AND JSON_LENGTH(answer.answer_json,'$.choiceLabels')!=
        CASE WHEN JSON_VALUE(answer.field_json,'$.type')='multiple_choice'
          THEN JSON_LENGTH(answer.answer_json,'$.value') ELSE 1 END)
    OR (JSON_VALUE(answer.field_json,'$.type')='number'
      AND ((JSON_VALUE(answer.field_json,'$.min') IS NOT NULL
          AND JSON_VALUE(answer.answer_json,'$.value')+0e0<JSON_VALUE(answer.field_json,'$.min')+0e0)
        OR (JSON_VALUE(answer.field_json,'$.max') IS NOT NULL
          AND JSON_VALUE(answer.answer_json,'$.value')+0e0>JSON_VALUE(answer.field_json,'$.max')+0e0)
        OR (JSON_EXTRACT(answer.field_json,'$.integerOnly')='true'
          AND JSON_VALUE(answer.answer_json,'$.value')+0e0!=FLOOR(JSON_VALUE(answer.answer_json,'$.value')+0e0))))
  )
  AND NOT EXISTS (SELECT 1 FROM selected_choices selected WHERE NOT EXISTS (
    SELECT 1 FROM JSON_TABLE(selected.field_json,'$.choices[*]' COLUMNS (value JSON PATH '$')) choice
    WHERE JSON_TYPE(JSON_EXTRACT(choice.value,'$.value'))='STRING'
      AND JSON_TYPE(JSON_EXTRACT(choice.value,'$.label'))='STRING'
      AND BINARY JSON_VALUE(choice.value,'$.value')=BINARY selected.selected_value
      AND (JSON_TYPE(JSON_EXTRACT(selected.answer_json,'$.choiceLabels')) IS NULL OR
        (JSON_TYPE(JSON_EXTRACT(choice.value,'$.label'))='STRING'
          AND BINARY JSON_VALUE(choice.value,'$.label')=
            BINARY JSON_VALUE(selected.answer_json,CONCAT('$.choiceLabels[',selected.selected_index,']'))))
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%password%'
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%credential%'
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%secret%'
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%token%'
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%payment%'
      AND LOWER(JSON_VALUE(choice.value,'$.label')) NOT LIKE '%captcha%'
  ))
  AND NOT EXISTS (SELECT 1 FROM current_version v,JSON_TABLE(v.config_json,'$.fields[*]' COLUMNS (value JSON PATH '$')) required_field
    WHERE JSON_VALUE(required_field.value,'$.status')='active'
      AND ${optionalRegistration ? 'FALSE' : "JSON_EXTRACT(required_field.value,'$.required')='true'"}
      AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(?,'$[*]' COLUMNS (value LONGTEXT PATH '$')) built_in
        WHERE BINARY built_in.value=BINARY LOWER(REPLACE(JSON_VALUE(required_field.value,'$.key'),'_','')))
      AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(?,'$.answers[*]' COLUMNS (value JSON PATH '$')) given
        WHERE BINARY JSON_VALUE(given.value,'$.fieldId')=BINARY JSON_VALUE(required_field.value,'$.id'))
  )`;

/** Returns an unexecuted native statement for the parent domain batch. */
export function buildFormAnswerInsert(db: D1Database, input: {
  formId: FormId; requestId: string; versionId: string; subjectType: string; subjectId: string;
  actorId: string | null; answers: FormAnswerSnapshot; now: number;
  optionalRegistration?: boolean;
}): D1PreparedStatement {
  const formId = required(input.formId, 'Form ID', 191);
  const requestId = required(input.requestId, 'Request ID', 191);
  const versionId = required(input.versionId, 'Version ID', 191);
  const subjectType = required(input.subjectType, 'Subject type', 64);
  const subjectId = required(input.subjectId, 'Subject ID', 191);
  const actorId = input.actorId === null ? null : required(input.actorId, 'Actor ID', 191);
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new FormAnswerRepositoryError('Timestamp is invalid.');
  const snapshot = validateInput(formId, input.answers);
  const healthScope=readDatabaseHealthScope(db);
  if (snapshot.productIdentity && (subjectType !== 'product' || !actorId)) throw new FormAnswerRepositoryError();
  const optionalRegistration = input.optionalRegistration === true;
  if (optionalRegistration && (formId !== 'seller.application' || subjectType !== 'seller' || !actorId)) throw new FormAnswerRepositoryError();
  if (versionId.startsWith('core:')) {
    if (!coreFormContract(formId) || versionId !== coreFormVersionId(formId) || snapshot.version !== 1 || snapshot.answers.length !== 0 || (!actorId && !GUEST_NATIVE_FORM_IDS.has(formId)))
      throw new FormAnswerRepositoryError();
    if (formId === 'seller.application' && !optionalRegistration) throw new FormAnswerRepositoryError();
    // Core-only snapshots contain no custom answers or protected values. Keep
    // a durable receipt in the existing audit store, never silently create or
    // publish catalogue data. The domain write and this guard share one batch.
    return db.prepare(`/* core-form-answer-insert */ INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at)
      VALUES(?,?,CASE WHEN NOT EXISTS(SELECT 1 FROM form_config_versions WHERE form_id=? AND status='published')
        ${optionalRegistration ? 'AND EXISTS(SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND user_id=?)' : ''}
        THEN 'form.core_answers' ELSE NULL END,?,?,?,?)`)
      .bind(coreFormReceiptId(formId, requestId), actorId, formId, ...(optionalRegistration ? [subjectId, actorId] : []), subjectType, subjectId,
        JSON.stringify({ ...snapshot, requestId, versionId,...(healthScope?{healthScope}:{}) }), input.now);
  }
  if (snapshot.productIdentity && (subjectType !== 'product' || !actorId)) throw new FormAnswerRepositoryError();
  const builtInKeys = JSON.stringify(FORM_REGISTRY[formId].baseFields.map((field) =>
    field.key.replace(/[^a-z0-9]/gi, '').toLowerCase()));
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).length > 131072) throw new FormAnswerRepositoryError('Answer snapshot is too large.');
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  const validation = (maria ? mariaValidAgainstVersion : validAgainstVersion)(optionalRegistration);
  const intakeGuard = optionalRegistration ? ' AND EXISTS(SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND user_id=?)' : '';
  const scalar = maria ? 'JSON_VALUE' : 'json_extract';
  const compatibilityGuard = snapshot.presentedVersion ? ` AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='form.compatibility.revoked')
    AND (NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='form.compatibility.granted') OR
      EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='form.compatibility.granted'
        AND ${scalar}(next_json,'$.fromVersion')=? AND ${scalar}(next_json,'$.toVersion')=?
        AND ${scalar}(next_json,'$.createdAt')<=? AND ${scalar}(next_json,'$.expiresAt')>?
        AND ${scalar}(next_json,'$.expiresAt')<=${scalar}(next_json,'$.createdAt')+86400000))` : '';
  const compatibilityValues = snapshot.presentedVersion ? [compatibilityRevocationId(formId, snapshot.version),
    compatibilityGrantId(formId, snapshot.version), compatibilityGrantId(formId, snapshot.version),
    snapshot.presentedVersion, snapshot.version, input.now, input.now] : [];
  const failure = maria ? 'NULL' : "json_extract('invalid', '$')";
  return db.prepare(`${maria ? '/* form-answer-insert */ ' : ''}INSERT INTO form_answer_sets
    (id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at,health_environment,health_release_id)
    VALUES (?,?,?,?,?,?,?,CASE WHEN (${validation})${intakeGuard}${compatibilityGuard} THEN ? ELSE ${failure} END,?,?,?)`)
    .bind(crypto.randomUUID(), formId, requestId, versionId, subjectType, subjectId, actorId,
      versionId, formId, snapshot.version, json, builtInKeys, builtInKeys, json, ...(optionalRegistration ? [subjectId, actorId] : []), ...compatibilityValues, json, input.now,healthScope?.environment??null,healthScope?.releaseId??null);
}

type AnswerRow = Omit<StoredFormAnswer, 'answers' | 'historicalFieldIds'> & {
  answersJson: string; configJson: string; currentConfigJson: string | null;
};

const answerSelect = (db: D1Database) => {
  const value = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  return `SELECT a.id, a.form_id AS formId, a.request_id AS requestId,
    a.config_version_id AS versionId, a.subject_type AS subjectType, a.subject_id AS subjectId,
    a.actor_id AS actorId, a.answers_json AS answersJson, a.created_at AS createdAt,
    COALESCE(v.config_json,a.core_config) AS configJson, current.config_json AS currentConfigJson
    FROM (SELECT id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at,NULL AS core_config FROM form_answer_sets
      UNION ALL SELECT id,${value}(next_json,'$.formId'),${value}(next_json,'$.requestId'),${value}(next_json,'$.versionId'),
        subject_type,subject_id,actor_id,${(db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_REMOVE' : 'json_remove'}(next_json,'$.requestId','$.versionId','$.healthScope'),created_at,'{"fields":[]}'
      FROM audit_logs WHERE action='form.core_answers') a LEFT JOIN form_config_versions v ON v.id=a.config_version_id
    LEFT JOIN form_config_versions current ON current.id=(SELECT id FROM form_config_versions
      WHERE form_id=a.form_id AND status='published' ORDER BY version DESC LIMIT 1)`;
};

function decodeAnswer(row: AnswerRow): StoredFormAnswer {
  const { answersJson, configJson, currentConfigJson, ...metadata } = row;
  try {
    const snapshot = validateInput(metadata.formId, JSON.parse(answersJson) as unknown);
    if (snapshot.productIdentity && (metadata.subjectType !== 'product' || !metadata.actorId)) throw new FormAnswerRepositoryError();
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
  const row = await db.prepare(`${answerSelect(db)} WHERE a.id=? LIMIT 1`).bind(id).first<AnswerRow>();
  return row ? decodeAnswer(row) : null;
}

export async function listFormAnswersForSubject(db: D1Database, subjectType: string, subjectId: string): Promise<StoredFormAnswer[]> {
  const type = required(subjectType, 'Subject type', 64);
  const id = required(subjectId, 'Subject ID', 191);
  const answers: StoredFormAnswer[] = [];
  let cursor: { createdAt: number; id: string } | null = null;
  while (true) {
    const rows: { results: AnswerRow[] } = await db.prepare(`${answerSelect(db)}
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
  const rows = await db.prepare(`${answerSelect(db)}
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
