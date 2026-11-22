import { AdminPageTitle } from '@/components/admin/page-help';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';
import {DeliveryRateSettings} from '@/components/admin/delivery-rate-settings';
export const dynamic='force-dynamic';
export default async function DeliveryRatesPage(){
 const staff=await requireStaffPage('/admin/delivery-rates');if(staff.role!=='super_admin')return <p>Only the Super Admin can manage delivery rates.</p>;
 const db=requireDatabase(env as unknown as {DB?:D1Database});const rates=await getDeliveryRates(db);
 const history=await db.prepare('SELECT id,reason,created_at AS createdAt FROM delivery_rate_versions ORDER BY created_at DESC LIMIT 20').all<{id:string;reason:string;createdAt:number}>();
 return <div className="space-y-6"><AdminPageTitle><h1 className="font-heading text-3xl">Delivery rates</h1></AdminPageTitle><p>The first distinct store uses the destination base rate. Every additional distinct store adds 50% of that base; products from the same store share its contribution. Saved changes apply to future orders. Existing order totals and seller settlements remain unchanged. District overrides take precedence over the zone rate.</p><DeliveryRateSettings key={rates.version} rates={rates}/><section className="space-y-3"><h2 className="font-heading text-xl">Rate history</h2>{history.results.map(v=><p key={v.id} className="rounded border p-3">{v.createdAt?new Date(v.createdAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'}):'Initial tariff'} · {v.reason}</p>)}</section></div>;
}
