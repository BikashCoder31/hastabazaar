import {resolvePublishedForm} from '@/lib/forms/runtime';
import {fieldDisplay} from '@/components/forms/configured-fields';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {SupportedCaseIntake} from '@/components/admin/supported-case-intake';
export const dynamic='force-dynamic';
export default async function SupportedCaseIntakePage({searchParams}:{searchParams:Promise<{order?:string}>}){
 const staff=await requireStaffPage('/admin/cases/intake','support.manage'),{order}=await searchParams,db=requireDatabase(env as unknown as {DB?:D1Database});
 const lookup=await resolvePublishedForm(db,'staff.case-intake-order'),display=fieldDisplay(lookup,'order');
 const found=order?await db.prepare('SELECT id,order_number AS orderNumber FROM orders WHERE order_number=?').bind(order).first<{id:string;orderNumber:string}>():null;
 const items=found?(await db.prepare('SELECT id,product_name_snapshot AS name,quantity,fulfillment_status AS status FROM order_items WHERE order_id=? ORDER BY created_at,id').bind(found.id).all<{id:string;name:string;quantity:number;status:string}>()).results:[];
 return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-3xl font-semibold">Record a supported customer request</h1><p>Retain the first email or help-channel receipt and its source evidence. A later staff entry does not replace the original request time.</p><form data-form-id="staff.case-intake-order" method="get" className="flex gap-3"><label>{display?.label&&display.label!=='order'?display.label:'Original order number'}<input name="order" required defaultValue={order??''} className="block rounded border p-2"/></label><button className="rounded border p-2">Find order</button></form>{found?<SupportedCaseIntake actorId={staff.id} orderNumber={found.orderNumber} items={items}/>:order?<p>The original order was not found.</p>:null}</main>;
}
