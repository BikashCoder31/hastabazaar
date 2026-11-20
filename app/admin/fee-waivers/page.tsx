import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import { redirect,notFound } from 'next/navigation';
import Link from 'next/link';
import {formatPaisaExact} from '@/lib/marketplace/money-display';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {readCustomerWaiverHistory,WaiverHistoryError} from '@/lib/admin/customer-waiver-history';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getAuthorizedCustomerFeeWaiverState } from '@/lib/db/repositories/customer-fee-waivers';
import { getAuthorizedFeeWaiverState } from '@/lib/db/repositories/fee-waivers';
import { presentFeeWaiverState } from '@/lib/marketplace/fee-waiver-presentation';
import { FeeWaiverManager } from '@/components/admin/fee-waiver-manager';

export const dynamic = 'force-dynamic';
const campaignControlsObservedAt = () => Date.now();
export default async function FeeWaiversPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}) {
  const params=await searchParams??{},returnTo=safeAdminReturnTo(params.returnTo),cursor=params.historyCursor;if(Array.isArray(cursor))notFound();
  const actor = await requireStaffPage(
    '/admin/fee-waivers',
    'commercial_policy.manage',
  );
  if (actor.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const identity = { actorId: actor.id, authSubject: actor.authSubject };
  const [customerState, legacyHistory] = await Promise.all([
    getAuthorizedCustomerFeeWaiverState(db, identity),
    getAuthorizedFeeWaiverState(db, identity),
  ]);
  const initialState = { feeTarget: 'customer_service_fee' as const, ...presentFeeWaiverState(customerState, campaignControlsObservedAt()) };
  let history;try{history=await readCustomerWaiverHistory(db,{id:actor.id,authSubject:actor.authSubject},{cursor,limit:20});}catch(error){if(error instanceof WaiverHistoryError&&error.status===400)notFound();throw error;}
  const date=(at:number)=>new Intl.DateTimeFormat('en-NP',{timeZone:'Asia/Kathmandu',dateStyle:'medium',timeStyle:'short'}).format(at);
  return (
    <div className="grid min-w-0 gap-6">
      <Link href={returnTo} className="underline">Back to previous view</Link>
      <div>
        <AdminPageTitle><h1 className="section-title">Customer service fee waivers</h1></AdminPageTitle>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Automatically waive the whole positive customer service fee once per order
          during a published campaign. Overlapping campaigns do not stack. Seller
          commission and Managed Maker commercial terms still apply.
        </p>
      </div>
      <FeeWaiverManager actorId={actor.id} initialState={initialState} legacyHistory={legacyHistory} />
      <section id="customer-waiver-history" className="min-w-0 space-y-4"><h2 className="text-xl">Original customer waiver history and usage</h2><p>Immutable versions and original once-per-order fee snapshots. Current rates do not reprice past orders; waived amounts are not cash refunds or net profit. Cancellation/refund movements stay in the original order and Finance records. Each page contains at most 20 versions.</p>
      {history.rows.map(row=><article key={row.campaignId+':'+row.revision} className="min-w-0 rounded border p-4"><h3 className="font-medium break-words">{row.name} · version {row.revision} · {row.state}</h3><p>{date(row.startsAt)}–{date(row.endsAt)} Nepal time.</p><p className="break-all">Original source {row.campaignId}; decision by {row.actorId} at {date(row.recordedAt)} Nepal time.</p><p className="whitespace-pre-wrap break-words">Reason: {row.reason??'No matching original reason recorded.'}</p><p>{row.orders} original order snapshots · {formatPaisaExact(row.waivedPaisa)} waived for this exact version.</p><Link href={withAdminReturnTo('/admin/fee-waivers#fee-waiver-'+encodeURIComponent(row.campaignId),returnTo)} className="underline">Open campaign controls</Link></article>)}
      {!history.rows.length?<p>No versions on this history page.</p>:null}
      {history.nextCursor?<Link href={withAdminReturnTo('/admin/fee-waivers?'+new URLSearchParams({historyCursor:history.nextCursor})+'#customer-waiver-history',returnTo)} className="underline">Older original versions</Link>:null}
      {cursor?<Link href={withAdminReturnTo('/admin/fee-waivers#customer-waiver-history',returnTo)} className="ml-4 underline">Newest original versions</Link>:null}</section>
    </div>
  );
}
