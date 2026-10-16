import { env } from 'cloudflare:workers';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';
import { decodeFeedbackJob, isFeedbackDeliveryExhausted, listSupportFeedbackDeliveryJobs,
  type FeedbackDeliveryJob } from '@/lib/db/repositories/feedback-submissions';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';

function parseCursor(value: string | undefined): { createdAt: number; id: string } | undefined {
  if (!value || value.length > 230) return undefined;
  const match = /^(\d{1,16}):([a-f0-9-]{36})$/.exec(value);
  if (!match) return undefined;
  const createdAt = Number(match[1]);
  return Number.isSafeInteger(createdAt) ? { createdAt, id: match[2] } : undefined;
}

function deliveryLabel(job: FeedbackDeliveryJob): string {
  if (job.status === 'sent') return 'Mail handoff confirmed';
  if (job.status === 'sending') return 'Delivery uncertain: message may have been sent';
  if (isFeedbackDeliveryExhausted(job, Date.now())) return 'Not sent: delivery attempts exhausted';
  if (job.status === 'failed') return 'Not sent: retryable under the same request ID';
  if (job.status === 'leased') return 'Delivery attempt in progress; outcome may change';
  return 'Pending: delivery not yet confirmed';
}

function sourceLabel(formId: string): string {
  if (formId === 'public.contact') return 'Contact page';
  if (formId === 'public.feedback') return 'Feedback page';
  return 'Footer feedback';
}

function createdTime(createdAt: number): string | null {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > 8_640_000_000_000_000) return null;
  return new Date(createdAt).toISOString();
}

export default async function AdminFeedbackPage({ searchParams }: {
  searchParams: Promise<{ before?: string }>;
}) {
  const staff = await requireStaffPage('/admin/feedback', 'support.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const page = await listSupportFeedbackDeliveryJobs(db, parseCursor(params.before));
  const entries = (await Promise.all(page.jobs.map(async (job) => {
    const answers = await listFormAnswersForSubject(db, 'feedback_submission', job.id);
    const answer = answers.find((item) => item.formId === job.formId && item.requestId === job.requestId);
    if (!answer || !(await authorizeFormAnswerRead(db, staff, answer))) return null;
    return { job, answer, feedback: decodeFeedbackJob(job) };
  }))).filter((entry) => entry !== null);

  return <div className="space-y-6">
    <div>
      <p className="eyebrow">Support intake</p>
      <h1 className="section-title">Contact and feedback submissions</h1>
      <p className="mt-2 text-sm text-muted-foreground">All saved feedback jobs appear here, including work still pending or retryable. Status is a snapshot and can change during a delivery attempt. Custom answers stay in this restricted view and are not included in outbound email.</p>
      <p className="mt-2 text-sm text-muted-foreground">For uncertain delivery, check the support mailbox and transport records using the request ID, source, time and message details. Do not resend or mark sent without independent evidence. Ask the customer to start a new message only after explaining that a duplicate may result.</p>
    </div>
    {entries.length ? entries.map(({ job, answer, feedback }) => <article key={job.id} className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">{feedback.topic}</h2>
      <p className="text-sm font-semibold">{deliveryLabel(job)}</p>
      <p className="break-all text-xs text-muted-foreground">Reference: {job.id} · Request ID: {job.requestId} · Attempts: {job.attemptCount}</p>
      <p className="break-words text-xs text-muted-foreground">Source: {sourceLabel(job.formId)} ({job.formId}) · Page: {feedback.pagePath} · Created: {createdTime(job.createdAt) ?? 'Time unavailable'}</p>
      <p className="text-sm text-muted-foreground">{feedback.name} · {feedback.email}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm">{feedback.message}</p>
      <div className="mt-4"><AnswerDetails answer={answer} /></div>
    </article>) : <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No authorized feedback submissions to review.</p>}
    {page.nextCursor ? <a className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
      href={`/admin/feedback?before=${encodeURIComponent(`${page.nextCursor.createdAt}:${page.nextCursor.id}`)}`}>Older submissions</a> : null}
  </div>;
}
