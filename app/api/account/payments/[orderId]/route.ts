import {customerPaymentRead} from '@/lib/payments/payment-http';
export async function GET(request:Request,context:{params:Promise<{orderId:string}>}){return customerPaymentRead(request,(await context.params).orderId);}
