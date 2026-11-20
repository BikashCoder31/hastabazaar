import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireCustomerPage} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {getCustomerManualPayment,ManualPaymentError} from '@/lib/payments/manual-receipts';
import {ManualPaymentClaim} from '@/components/commerce/manual-payment-claim';
export const dynamic='force-dynamic';
export default async function PaymentPage({params}:{params:Promise<{orderId:string}>}){const {orderId}=await params,viewer=await requireCustomerPage('/account/payments/'+encodeURIComponent(orderId));let payment;try{payment=await getCustomerManualPayment(requireDatabase(env as unknown as {DB?:D1Database}),viewer.userId,orderId);}catch(error){if(error instanceof ManualPaymentError&&[403,404].includes(error.status))notFound();throw error;}if(!payment)notFound();return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8"><Link className="section-link" href={'/orders/'+encodeURIComponent(payment.orderNumber)}>← Order details</Link><ManualPaymentClaim payment={payment} actorId={viewer.userId}/></main>;}
