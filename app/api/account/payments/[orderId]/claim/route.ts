import {customerPaymentClaim} from '@/lib/payments/payment-http';
export async function POST(request:Request,context:{params:Promise<{orderId:string}>}){return customerPaymentClaim(request,(await context.params).orderId);}

export const GET=POST;
