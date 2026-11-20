import type { FormAnswerSnapshot } from './types';

/** Maria JSON_REMOVE may format whitespace; no keys, values or ordering are discarded. */
export function formAnswerSnapshotMatches(stored: string, expected: FormAnswerSnapshot): boolean {
  try { return JSON.stringify(JSON.parse(stored) as unknown) === JSON.stringify(expected); }
  catch { return false; }
}

/** Same immutable answer facts for original publications and real native audit receipts. */
export function formAnswerSourceSql(db: D1Database): string {
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  const value = maria ? 'JSON_VALUE' : 'json_extract';
  return `(SELECT id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at,
      NULL AS core_config,NULL AS core_version,NULL AS core_published_at FROM form_answer_sets
    UNION ALL SELECT id,${value}(next_json,'$.formId'),${value}(next_json,'$.requestId'),${value}(next_json,'$.versionId'),
      subject_type,subject_id,actor_id,${maria ? 'JSON_REMOVE' : 'json_remove'}(next_json,'$.requestId','$.versionId','$.healthScope'),created_at,
      json_object('formId',${value}(next_json,'$.formId'),'fields',json_array()),1,0
      FROM audit_logs WHERE action='form.core_answers')`;
}
