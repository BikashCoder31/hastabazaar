import { AdminPageTitle } from '@/components/admin/page-help';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { env } from 'cloudflare:workers';
import { ReviewModerationActions } from '@/components/admin/review-moderation-actions';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listReviewsForModeration } from '@/lib/db/repositories/customers';
import { getReviewExtras } from '@/lib/db/repositories/review-extras';
import { ReviewPhotos } from '@/components/commerce/review-attachments';
import { AnswerDetails } from '@/components/forms/answer-details';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
export const dynamic = 'force-dynamic';
export default async function AdminReviewsPage() {
  const staff = await requireStaffPage('/admin/reviews', 'product.review');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const reviews = await listReviewsForModeration(db);
  const extras = await getReviewExtras(
    db,
    reviews.map((r) => r.id),
    true,
  );
  const answers = await Promise.all(reviews.map(async (review) =>
    (await Promise.all((await listFormAnswersForSubject(db, 'product_review', review.id))
      .filter((answer) => answer.formId === 'account.review')
      .map(async (answer) => await authorizeFormAnswerRead(db, staff, answer) ? answer : null)))
      .filter((answer) => answer !== null)));
  return (
    <div>
      <AdminPageTitle><h1 className="font-heading text-4xl">Product reviews</h1></AdminPageTitle>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Review customer text and every photo before publishing. Approve honest
        positive and negative experiences equally. Remove private information,
        abuse, spam or unrelated content; every decision is recorded.
      </p>
      <StaffFormHistoryLinks entries={[{kind:'review-moderation',label:'Review decision answers'},
        {kind:'reply-moderation',label:'Reply decision answers'}]} />
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {reviews.map((review, index) => {
          const reply = extras.replies.find((r) => r.reviewId === review.id);
          return (
            <article
              key={review.id}
              className="min-w-0 rounded-2xl border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold">{review.productName}</p>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
                  {review.status}
                </span>
              </div>
              <p className="mt-3 text-sm">
                {review.rating} / 5 · Verified purchase
              </p>
              {review.title ? (
                <h2 className="mt-3 font-semibold">{review.title}</h2>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {review.body}
              </p>
              {answers[index].map((answer) => <div key={answer.id} className="mt-4"><AnswerDetails answer={answer} /></div>)}
              <ReviewPhotos
                photos={extras.photos.filter((p) => p.reviewId === review.id)}
              />
              <p className="mt-3 text-xs">
                {review.customerName} · {review.orderNumber}
              </p>
              <ReviewModerationActions id={review.id} status={review.status} />
              {reply ? (
                <div className="mt-5 rounded-xl border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold">
                    Seller reply · {reply.sellerName}
                  </h3>
                  <p className="mt-2 text-xs capitalize">
                    {reply.status} · Version {reply.version}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                    {reply.body}
                  </p>
                  <ReviewModerationActions
                    id={review.id}
                    status={reply.status}
                    replyVersion={reply.version}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {!reviews.length ? (
        <p className="mt-6 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          No reviews are awaiting attention.
        </p>
      ) : null}
    </div>
  );
}
