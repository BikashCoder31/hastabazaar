import {claimReleaseHttp} from '@/lib/payments/claim-release-http';
import {customerPaymentUpload} from '@/lib/payments/payment-http';
export async function POST(request:Request,context:{params:Promise<{orderId:string}>}){return customerPaymentUpload(request,(await context.params).orderId);}

export async function GET(request:Request,context:{params:Promise<{orderId:string}>}){return claimReleaseHttp(request,(await context.params).orderId,'upload');}
