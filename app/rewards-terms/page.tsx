import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { LegalPolicyPage } from '@/components/layout/legal-policy-page';
import { publicLegalPolicies } from '@/lib/content/legal-policies';
import { requireDatabase } from '@/lib/db/d1';
import { getPublishedLoyaltyTerms } from '@/lib/db/repositories/loyalty';
import { formatPaisaExact } from '@/lib/marketplace/money-display';

export const dynamic = 'force-dynamic';
export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/rewards-terms' },
  title: publicLegalPolicies['rewards-terms'].title,
  description: publicLegalPolicies['rewards-terms'].description,
};

const availability = {
  review_required:'New earning is paused while reward rules are reviewed',
  active: 'Available', paused: 'Paused', disabled: 'Disabled',
  scheduled: 'Not yet started', expired: 'Earning period ended', exhausted: 'Rewards currently unavailable',
};
const date = (value: number) => new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu',
}).format(value);

// Read the request clock in the server data loader, outside component rendering.
function readPublishedTerms() {
  return getPublishedLoyaltyTerms(
    requireDatabase(env as unknown as { DB?: D1Database }), Date.now(),
  );
}

export default async function Page() {
  const terms = await readPublishedTerms();
  return <LegalPolicyPage policyKey="rewards-terms" currentDetails={
    <section id="current-rewards" className="scroll-mt-48 rounded-2xl border bg-secondary/30 p-5 sm:p-6">
      <h2 className="font-heading text-2xl">{terms.revision === 0 ? 'Rewards are not active yet' : 'Current published rewards'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{terms.revision === 0 ? 'No reward rules have been published yet. The starting settings below are not an active earning offer.' : `Revision ${terms.revision} · ${availability[terms.status]}`} · Nepal time</p>
      {terms.weeklyPoints ? <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {terms.weeklyPoints.map((points, index) => <li key={index} className="rounded-xl border bg-card p-3">
          <span className="block text-sm text-muted-foreground">Day {index + 1}</span>
          <strong className="mt-1 block">{points} points</strong>
        </li>)}
      </ol> : <p className="mt-4">{terms.dailyPoints} points per daily check-in.</p>}
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Grace</dt><dd className="mt-1">{!terms.weeklyPoints ? 'Not applicable to fixed daily rewards' : terms.graceEnabled ? 'On · one missed day per cycle' : 'Off · a missed day resets to Day 1'}</dd></div>
        <div><dt className="font-semibold">Conversion</dt><dd className="mt-1">{terms.pointsPerBlock} points = {formatPaisaExact(terms.creditPaisaPerBlock)} shopping credit</dd></div>
        <div><dt className="font-semibold">Earning starts</dt><dd className="mt-1">{terms.startsAt === null ? 'No start date set' : date(terms.startsAt)}</dd></div>
        <div><dt className="font-semibold">Earning ends</dt><dd className="mt-1">{terms.endsAt === null ? 'No end date set' : date(terms.endsAt)}</dd></div>
      </dl>
      <Link href="/account/rewards" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Open my rewards</Link>
    </section>
  } />;
}
