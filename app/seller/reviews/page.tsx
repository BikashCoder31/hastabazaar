import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getReviewExtras } from '@/lib/db/repositories/review-extras';
import { ReviewReplyForm } from '@/components/seller/review-reply-form';
export const dynamic = 'force-dynamic';
export default async function SellerReviews() {
  const seller = await requireSellerPage('/seller/reviews');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const reviews = await db
    .prepare(
      `SELECT r.id,r.rating,r.title,r.body,p.name_en AS productName,p.slug FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE p.seller_id=? AND r.status='published' ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(seller.sellerId)
    .all<{
      id: string;
      rating: number;
      title: string | null;
      body: string;
      productName: string;
      slug: string;
    }>();
  const extras = await getReviewExtras(
    db,
    reviews.results.map((r) => r.id),
    true,
  );
  return (
    <div>
      <p className="eyebrow">Listen to your customers</p>
      <h1 className="mt-3 font-heading text-4xl">Customer reviews</h1>
      <p className="mt-3 text-muted-foreground">
        Respond to verified purchases of your products. Customers’ ratings and
        words stay their own.
      </p>
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        {reviews.results.map((r) => {
          const reply = extras.replies.find((x) => x.reviewId === r.id);
          return (
            <article
              key={r.id}
              className="min-w-0 rounded-2xl border bg-card p-5"
            >
              <Link
                className="font-semibold underline underline-offset-4"
                href={`/products/${encodeURIComponent(r.slug)}#reviews`}
              >
                {r.productName}
              </Link>
              <p className="mt-3 text-sm">{r.rating} / 5 · Verified purchase</p>
              {r.title ? (
                <h2 className="mt-3 font-semibold">{r.title}</h2>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {r.body}
              </p>
              <ReviewReplyForm
                key={`${r.id}-${reply?.version ?? 0}`}
                reviewId={r.id}
                version={reply?.version ?? 0}
                initialBody={reply?.body ?? ''}
                status={reply?.status}
              />
            </article>
          );
        })}
      </div>
      {!reviews.results.length ? (
        <p className="mt-8 rounded-2xl border border-dashed p-8 text-muted-foreground">
          Published reviews of your products will appear here.
        </p>
      ) : null}
    </div>
  );
}
