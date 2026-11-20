import {paymentFileRead} from '@/lib/payments/payment-http';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return paymentFileRead(request,(await context.params).id,'finance');}
