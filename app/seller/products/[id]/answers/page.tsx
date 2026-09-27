import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';

function cursor(at?: string, id?: string) {
  const timestamp = at ? Number(at) : NaN;
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && id && id.length <= 191
    ? { createdAt: timestamp, id } : undefined;
}

export default async function SellerProductAnswerHistoryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ submissionAt?: string; submissionId?: string; inventoryAt?: string; inventoryId?: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/products/${id}/answers`);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const owned = await db.prepare('SELECT name_en AS nameEn FROM products WHERE id=? AND seller_id=? LIMIT 1')
    .bind(id, seller.sellerId).first<{ nameEn: string }>();
  if (!owned) notFound();
  const query = await searchParams;
  const [submission, inventory] = await Promise.all([
    listFormAnswersForSubjectPage(db, { subjectType: 'product', subjectId: id,
      formId: 'seller.product-submission', after: cursor(query?.submissionAt, query?.submissionId) }),
    listFormAnswersForSubjectPage(db, { subjectType: 'product', subjectId: id,
      formId: 'seller.inventory', after: cursor(query?.inventoryAt, query?.inventoryId) }),
  ]);
  const actor = { id: seller.userId, role: 'seller' as const };
  const allowed = await Promise.all([...submission.answers, ...inventory.answers]
    .map((answer) => authorizeFormAnswerRead(db, actor, answer)));
  if (allowed.some((value) => !value)) notFound();
  const nextLink = (kind: 'submission' | 'inventory', next: { createdAt: number; id: string } | null) => {
    if (!next) return null;
    const link = new URLSearchParams();
    link.set(`${kind}At`, String(next.createdAt));
    link.set(`${kind}Id`, next.id);
    const other = kind === 'submission' ? 'inventory' : 'submission';
    const otherAt = kind === 'submission' ? query?.inventoryAt : query?.submissionAt;
    const otherId = kind === 'submission' ? query?.inventoryId : query?.submissionId;
    if (otherAt && otherId) { link.set(`${other}At`, otherAt); link.set(`${other}Id`, otherId); }
    return `/seller/products/${encodeURIComponent(id)}/answers?${link.toString()}`;
  };
  return <main className="space-y-8">
    <header><p className="eyebrow">Seller records</p>
      <h1 className="mt-2 font-heading text-4xl">Answer history for {owned.nameEn}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Saved answers retain their original labels and values, including archived fields.</p>
      <Link className="section-link mt-3 inline-block" href="/seller/products">Back to products</Link>
    </header>
    <section aria-label="Product submission answer history" className="space-y-4">
      <h2 className="font-heading text-2xl">Product submissions</h2>
      {submission.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!submission.answers.length ? <p>No saved submissions yet.</p> : null}
      {submission.nextCursor ? <Link className="section-link" href={nextLink('submission', submission.nextCursor)!}>Next 50 submissions</Link> : null}
    </section>
    <section aria-label="Inventory answer history" className="space-y-4">
      <h2 className="font-heading text-2xl">Inventory updates</h2>
      {inventory.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!inventory.answers.length ? <p>No saved inventory updates yet.</p> : null}
      {inventory.nextCursor ? <Link className="section-link" href={nextLink('inventory', inventory.nextCursor)!}>Next 50 updates</Link> : null}
    </section>
  </main>;
}
