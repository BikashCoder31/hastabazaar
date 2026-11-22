import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
export default async function PaymentExceptionPage({params}:{params:Promise<{id:string}>}){const {id}=await params,returnTo='/admin/payments/exceptions/'+encodeURIComponent(id);await requireStaffPage(returnTo);const row=await requireDatabase(env as unknown as {DB?:D1Database}).prepare('SELECT kind,order_id AS orderId FROM manual_payment_exceptions WHERE id=?').bind(id).first<{kind:string;orderId:string|null}>();await requireStaffPage(returnTo,row?.kind==='fulfillment_release'?'order.manage':'payment.receipt.verify');if(!row)notFound();redirect(row.kind==='fulfillment_release'&&row.orderId?'/admin/payments/orders/'+encodeURIComponent(row.orderId):'/admin/payments?view=incoming#'+encodeURIComponent(id));}
