import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {listSellerRecoveries} from '@/lib/payments/recovery-workspace';
export const dynamic='force-dynamic';
export default async function RecoveryListPage(){const actor=await requireSellerCenterPage('/seller/finance/recoveries'),rows=await listSellerRecoveries(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId);return <section className="space-y-5"><h1 className="font-heading text-3xl">Your recovery statements</h1><p>Review original adjustments, actual repayments and agreed next steps.</p>{rows.map(row=><article key={row.id} className="rounded-lg border p-4"><Link href={'/seller/finance/recoveries/'+encodeURIComponent(row.id)} className="underline">Open {row.model} statement</Link><p>{row.state.replaceAll('_',' ')}</p></article>)}{!rows.length?<p>You have no recovery statements.</p>:null}</section>;}
