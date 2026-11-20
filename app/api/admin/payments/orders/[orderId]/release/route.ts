import {claimReleaseHttp} from '@/lib/payments/claim-release-http';
export async function POST(request:Request,context:{params:Promise<{orderId:string}>}){return claimReleaseHttp(request,(await context.params).orderId,'release');}
export const GET=POST;
