import type { CustomerFeedback } from '../../feedback/customer-feedback';
import type { FormAnswerSnapshot, FormId } from '../../forms/types';
import { buildFormAnswerInsert } from './form-answers';

export type FeedbackJobStatus = 'pending' | 'leased' | 'sending' | 'failed' | 'sent';
export interface FeedbackDeliveryJob {
  id: string;
  requestId: string;
  formId: FormId;
  payloadHash: string;
  feedbackJson: string;
  status: FeedbackJobStatus;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  attemptCount: number;
}

export async function findFeedbackDeliveryJob(db: D1Database, requestId: string): Promise<FeedbackDeliveryJob | null> {
  return db.prepare(`SELECT id,request_id AS requestId,form_id AS formId,
    payload_hash AS payloadHash,feedback_json AS feedbackJson,status,lease_token AS leaseToken,
    lease_expires_at AS leaseExpiresAt,attempt_count AS attemptCount
    FROM feedback_delivery_jobs WHERE request_id=? LIMIT 1`).bind(requestId).first<FeedbackDeliveryJob>();
}

export async function listSentFeedbackDeliveryJobs(db: D1Database, cursor?: { createdAt: number; id: string }): Promise<{
  jobs: FeedbackDeliveryJob[]; nextCursor: { createdAt: number; id: string } | null;
}> {
  const rows = await db.prepare(`SELECT id,request_id AS requestId,form_id AS formId,
    payload_hash AS payloadHash,feedback_json AS feedbackJson,status,lease_token AS leaseToken,
    lease_expires_at AS leaseExpiresAt,attempt_count AS attemptCount,created_at AS createdAt
    FROM feedback_delivery_jobs WHERE status='sent'
      AND (? IS NULL OR created_at<? OR (created_at=? AND id<?))
    ORDER BY created_at DESC,id DESC LIMIT 51`)
    .bind(cursor?.createdAt ?? null, cursor?.createdAt ?? 0, cursor?.createdAt ?? 0, cursor?.id ?? '')
    .all<FeedbackDeliveryJob & { createdAt: number }>();
  const jobs = rows.results.slice(0, 50);
  const last = rows.results.length > 50 ? jobs.at(-1) : null;
  return { jobs, nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null };
}

/** Both writes commit together. The answer insert rechecks the immutable published version. */
export async function createFeedbackSubmission(db: D1Database, input: {
  formId: FormId; requestId: string; payloadHash: string; feedback: CustomerFeedback;
  answers: FormAnswerSnapshot; now: number;
}): Promise<FeedbackDeliveryJob> {
  const version = await db.prepare(`SELECT id FROM form_config_versions WHERE form_id=? AND version=?
    AND status='published' LIMIT 1`).bind(input.formId, input.answers.version).first<{ id: string }>();
  if (!version) throw new Error('Published feedback version unavailable.');
  const id = crypto.randomUUID();
  const feedbackJson = JSON.stringify(input.feedback);
  await db.batch([
    db.prepare(`INSERT INTO feedback_delivery_jobs
      (id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,
        lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
      VALUES (?, ?, ?, ?, ?,
        CASE WHEN (SELECT MAX(version) FROM form_config_versions WHERE form_id=? AND status='published')=?
          THEN ? ELSE json_extract('invalid', '$') END,
        'pending', NULL, NULL, 0, ?, ?, NULL)`)
      .bind(id, input.requestId, input.formId, version.id, input.payloadHash,
        input.formId, input.answers.version, feedbackJson, input.now, input.now),
    buildFormAnswerInsert(db, { formId: input.formId, requestId: input.requestId,
      versionId: version.id, subjectType: 'feedback_submission', subjectId: id,
      actorId: null, answers: input.answers, now: input.now }),
  ]);
  const job = await findFeedbackDeliveryJob(db, input.requestId);
  if (!job) throw new Error('Feedback job unavailable after commit.');
  return job;
}

const LEASE_MS = 30_000;
const MAX_ATTEMPTS = 5;

/** A lease prevents two active requests from racing to the send boundary. */
export async function claimFeedbackDelivery(db: D1Database, jobId: string, now: number): Promise<string | null> {
  const token = crypto.randomUUID();
  const result = await db.prepare(`UPDATE feedback_delivery_jobs
    SET status='leased',lease_token=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=?
    WHERE id=? AND attempt_count<? AND (status IN ('pending','failed')
      OR (status='leased' AND lease_expires_at<=?))`)
    .bind(token, now + LEASE_MS, now, jobId, MAX_ATTEMPTS, now).run();
  return result.meta.changes === 1 ? token : null;
}

/** From here until a durable sent write, the outcome is ambiguous on process loss. */
export async function beginFeedbackSend(db: D1Database, jobId: string, token: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE feedback_delivery_jobs SET status='sending',updated_at=?
    WHERE id=? AND status='leased' AND lease_token=? AND lease_expires_at>?`)
    .bind(now, jobId, token, now).run();
  return result.meta.changes === 1;
}

export async function completeFeedbackSend(db: D1Database, jobId: string, token: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE feedback_delivery_jobs SET status='sent',lease_token=NULL,
    lease_expires_at=NULL,sent_at=?,updated_at=?
    WHERE id=? AND status='sending' AND lease_token=?`)
    .bind(now, now, jobId, token).run();
  return result.meta.changes === 1;
}

/** Only call when the transport proves no send was attempted. */
export async function rejectFeedbackBeforeSend(db: D1Database, jobId: string, token: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE feedback_delivery_jobs SET status='failed',lease_token=NULL,
    lease_expires_at=NULL,updated_at=? WHERE id=? AND status='sending' AND lease_token=?`)
    .bind(now, jobId, token).run();
  return result.meta.changes === 1;
}

export function decodeFeedbackJob(job: FeedbackDeliveryJob): CustomerFeedback {
  const value: unknown = JSON.parse(job.feedbackJson);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored feedback unavailable.');
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'email', 'phone', 'topic', 'subject', 'orderReference', 'message', 'pagePath']) {
    if (typeof record[key] !== 'string') throw new Error('Stored feedback unavailable.');
  }
  if (record.rating !== null && (typeof record.rating !== 'number' || !Number.isInteger(record.rating))) throw new Error('Stored feedback unavailable.');
  return value as CustomerFeedback;
}
