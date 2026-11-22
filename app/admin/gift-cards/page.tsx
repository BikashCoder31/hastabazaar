import { AdminPageTitle } from '@/components/admin/page-help';
import {formatPaisaExact} from '@/lib/marketplace/money-display';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listGiftCards } from '@/lib/db/repositories/gift-cards';
import { GiftCardForm } from '@/components/commerce/gift-card-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import Link from 'next/link';
import {readGiftCardViewScope,assertGiftCardViewScope} from '@/lib/gift-cards/view-scope';
export const dynamic = 'force-dynamic';
export default async function GiftCardsPage({ searchParams }: {
  searchParams?: Promise<{ giftId?: string; beforeAt?: string; beforeId?: string;
    historyAt?: string; historyId?: string }>;
} = {}) {
  const staff = await requireStaffPage('/admin/gift-cards', 'admin.invite');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const scope=await readGiftCardViewScope(db,staff.id,'staff');
  const cards = await listGiftCards(db);
  const query = await searchParams;
  const selectedRecord=query?.giftId&&/^[a-zA-Z0-9_-]{1,160}$/.test(query.giftId)?cards.find(card=>card.id===query.giftId)??await db.prepare('SELECT id,amount_paisa amountPaisa,issued_at issuedAt,redeemed_at redeemedAt FROM gift_cards WHERE id=?').bind(query.giftId).first<{id:string;amountPaisa:number;issuedAt:number;redeemedAt:number|null}>():null;
  const beforeAt = query?.beforeAt ? Number(query.beforeAt) : NaN;
  const before = Number.isSafeInteger(beforeAt) && beforeAt >= 0 &&
    query?.beforeId && query.beforeId.length <= 191 ? { at: beforeAt, id: query.beforeId } : null;
  const issueRows = await db.prepare(`SELECT id,amount_paisa AS amountPaisa,issued_at AS issuedAt
    FROM gift_cards WHERE issued_by=? AND
      (? IS NULL OR issued_at<? OR (issued_at=? AND id<?))
    ORDER BY issued_at DESC,id DESC LIMIT 51`)
    .bind(staff.id, before?.at ?? null, before?.at ?? 0, before?.at ?? 0,
      before?.id ?? '').all<{ id: string; amountPaisa: number; issuedAt: number }>();
  const issues = issueRows.results.slice(0, 50);
  const nextIssue = issueRows.results.length > 50 ? issues.at(-1) : null;
  const selectedGift = query?.giftId && query.giftId.length <= 191
    ? issues.find((gift) => gift.id === query.giftId) ?? await db.prepare(`SELECT id,
      amount_paisa AS amountPaisa,issued_at AS issuedAt FROM gift_cards
      WHERE id=? AND issued_by=? LIMIT 1`)
      .bind(query.giftId, staff.id).first<{ id: string; amountPaisa: number; issuedAt: number }>()
    : null;
  const historyAt = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(historyAt) && historyAt >= 0 &&
    query?.historyId && query.historyId.length <= 191
    ? { createdAt: historyAt, id: query.historyId } : undefined;
  const history = selectedGift ? await listFormAnswersForSubjectPage(db, {
    subjectType: 'gift_card_issue', subjectId: selectedGift.id,
    formId: 'commerce.gift-card-issue', after,
  }) : null;
  if (history) {
    const allowed = await Promise.all(history.answers.map((answer) =>
      authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer)));
    if (allowed.some((value) => !value)) throw new Error('Gift card answer authority changed.');
  }
  await assertGiftCardViewScope(db,scope,selectedGift?{id:selectedGift.id,owner:'issued_by'}:undefined);
  return (
    <div className="space-y-6">
      <AdminPageTitle><h1 className="section-title">Gift cards</h1></AdminPageTitle>
      <GiftCardForm actorId={staff.id} issue />
      {selectedRecord?<section id={'gift-record-'+selectedRecord.id} className="rounded-3xl border bg-card p-6"><h2 className="font-heading text-2xl">Original gift card record</h2><p className="mt-3 break-all">{selectedRecord.id}</p><p>{formatPaisaExact(selectedRecord.amountPaisa)} · {selectedRecord.redeemedAt?'Redemption recorded':'No redemption recorded'}</p><p className="text-sm text-muted-foreground">Issued {new Date(selectedRecord.issuedAt).toLocaleDateString('en-NP')}. Secret codes and the redeeming customer are not available from this record.</p></section>:query?.giftId?<output className="block">The requested gift card record is unavailable.</output>:null}
      <section className="space-y-4 rounded-3xl border bg-card p-6" aria-label="Your gift card issuance answers">
        <h2 className="font-heading text-2xl">Your issuance answer history</h2>
        {issues.length ? <ul className="space-y-2">{issues.map((gift) => <li key={gift.id}>
          <Link className="section-link underline" href={`/admin/gift-cards?giftId=${encodeURIComponent(gift.id)}`}>
            Issued {new Date(gift.issuedAt).toLocaleDateString('en-NP')} · {formatPaisaExact(gift.amountPaisa)}
          </Link>
        </li>)}</ul> : <p>No issued gift cards.</p>}
        {nextIssue ? <Link className="section-link underline" href={
          `/admin/gift-cards?beforeAt=${nextIssue.issuedAt}&beforeId=${encodeURIComponent(nextIssue.id)}`
        }>Next 50 issued cards</Link> : null}
        {selectedGift ? <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Issued card answers</h3>
          {history?.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
            : <p>No saved answers for this issuance.</p>}
          {history?.nextCursor ? <Link className="section-link underline" href={
            `/admin/gift-cards?giftId=${encodeURIComponent(selectedGift.id)}&historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`
          }>Next 50 answers</Link> : null}
        </div> : null}
      </section>
      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-2xl">Issued gift cards</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Latest 100 records. Redemption codes are never available from this
          history.
        </p>
        <ul className="mt-4 divide-y">
          {cards.map((card) => (
            <li key={card.id} className="py-4">
              <p className="font-semibold">
                {formatPaisaExact(card.amountPaisa)}{' '}
                · {card.redeemedAt ? 'Redeemed' : 'Available'}
              </p>
              <p className="break-all text-sm text-muted-foreground">
                {card.id}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
