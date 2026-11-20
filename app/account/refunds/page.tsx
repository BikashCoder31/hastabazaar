import {env} from 'cloudflare:workers';
import {requireCustomerPage} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {getCustomerRefundWorkspace} from '@/lib/payments/refund-workspace';
import {RefundDestinationForm} from '@/components/commerce/refund-destination-form';
export const dynamic='force-dynamic';

const currency = new Intl.NumberFormat('en-NP', {style:'currency', currency:'NPR'});
const money = (paisa:number) => currency.format(paisa/100);
const time = (at:number) => new Date(at).toLocaleString('en-NP', {timeZone:'Asia/Kathmandu'});

export default async function CustomerRefundsPage() {
  const actor = await requireCustomerPage('/account/refunds');
  const db = requireDatabase(env as unknown as {DB?:D1Database});
  const rows = await getCustomerRefundWorkspace(db, actor.userId);

  return <section className="mx-auto max-w-4xl space-y-6 px-5 py-8">
    <h1 className="font-heading text-4xl">Your refunds</h1>
    {rows.length ? rows.map(row => {
      const progress = row.currentProgress ?? row.paymentProgress;
      const delay = row.paymentProgress?.delay;
      const canProvideDestination = row.cashPaisa>0 && (row.state==='open'||row.state==='blocked');
      return <article id={'refund-'+row.id} key={row.id} className="space-y-4 rounded-xl border p-5">
        <h2 className="text-xl">{row.orderNumber??'Return of identified payer money'} · {progress?.label??'Refund update'}</h2>
        {progress ? <p>{progress.message}</p> : null}
        <p>{row.currentProgress?'Original authorized cash':'Cash refund'}: {money(row.cashPaisa)}. Wallet credit in this refund: {money(row.walletPaisa)}.
          {row.alreadyRestoredWalletPaisa>0 ? ` Cancellation already restored ${money(row.alreadyRestoredWalletPaisa)} in wallet credit.` : ''}
        </p>
        {row.bankSatisfiedPaisa>0 ? <p>Originally authorized cash: {money(row.originalCashPaisa)}. The bank already returned {money(row.bankSatisfiedPaisa)} directly to you. The cash refund above is the separate transfer handled by Finance.</p> : null}
        {row.state!=='completed'&&row.bindingDueAt!==null ? <p>Applicable original refund due date: {time(row.bindingDueAt)}</p> : null}
        {row.state!=='completed'&&row.initiationDueAt!==null ? <p>Original refund initiation target: {time(row.initiationDueAt)}</p> : null}
        {delay ? <p>{delay.reason} Next update by {time(delay.nextUpdateAt)}.</p> : null}
        {canProvideDestination ? <RefundDestinationForm row={row} actorId={actor.userId}/> : null}
        <ol className="space-y-2">{row.events.map(event => <li key={event.id}>{time(event.createdAt)} · {event.message}</li>)}</ol>
      </article>;
    }) : <p>No authorized refund has been handed to Finance for your account yet. Your original order and case retain any ongoing entitlement review.</p>}
  </section>;
}
