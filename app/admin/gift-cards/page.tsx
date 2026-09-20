import {formatPaisaExact} from '@/lib/marketplace/money-display';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listGiftCards } from '@/lib/db/repositories/gift-cards';
import { GiftCardForm } from '@/components/commerce/gift-card-form';
export const dynamic = 'force-dynamic';
export default async function GiftCardsPage() {
  await requireStaffPage('/admin/gift-cards', 'admin.invite');
  const cards = await listGiftCards(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <div className="space-y-6">
      <h1 className="section-title">Gift cards</h1>
      <GiftCardForm issue />
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
