import {protectedAdminGET,protectedAdminPOST,validateProtectedReview} from '@/lib/sellers/protected-admin-api';
import {reviewProtectedChangePermission} from '@/lib/sellers/protected-change-requests';
export const GET=protectedAdminGET('permission');
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return protectedAdminPOST(request,context,'permission',async(db,body,input)=>{
 validateProtectedReview(!Object.keys(body).some(key=>!['decision','reason','version','identityRevision','bankRevision','commandId'].includes(key))&&['permit','clarify','reject'].includes(String(body.decision))&&typeof body.reason==='string'&&body.reason.trim().length>=10&&body.reason.trim().length<=1000&&[body.version,body.identityRevision,body.bankRevision].every(Number.isSafeInteger));
 return reviewProtectedChangePermission(db,{...input,decision:body.decision as 'permit'|'clarify'|'reject',reason:body.reason as string,expectedVersion:body.version as number,expectedIdentityRevision:body.identityRevision as number,expectedBankRevision:body.bankRevision as number});
});}
