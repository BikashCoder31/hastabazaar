import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { formAnswerSourceSql, formAnswerSnapshotMatches } from '@/lib/forms/answer-proof';

export type CommerceForm = { versionId: string; answers: FormAnswerSnapshot };

/** A domain duplicate is replayable only with the exact answer and subject saved by its first action. */
export async function assertCommerceFormReplay(db: D1Database, input: {
  formId: string; requestId: string; subjectType: string; subjectId: string;
  actorId: string | null; form?: CommerceForm; conflictError: new (message: string) => Error;
}): Promise<void> {
  if (!input.form) return;
  const row = await db.prepare(`SELECT config_version_id AS versionId, subject_type AS subjectType,
    subject_id AS subjectId, actor_id AS actorId, answers_json AS answersJson
    FROM ${formAnswerSourceSql(db)} original_answers WHERE form_id=? AND request_id=? LIMIT 1`)
    .bind(input.formId, input.requestId)
    .first<{ versionId: string; subjectType: string; subjectId: string;
      actorId: string | null; answersJson: string }>();
  if (!row || row.versionId !== input.form.versionId || row.subjectType !== input.subjectType ||
    row.subjectId !== input.subjectId || row.actorId !== input.actorId ||
    !formAnswerSnapshotMatches(row.answersJson, input.form.answers)) {
    throw new input.conflictError('This request was already used for different form answers.');
  }
}
