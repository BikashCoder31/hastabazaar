import {protectedAdminGET,protectedAdminPOST,validateProtectedReview} from '@/lib/sellers/protected-admin-api';
import {verifyProtectedIdentityChange} from '@/lib/sellers/protected-identity-change';
export const GET=protectedAdminGET('verify-identity');
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return protectedAdminPOST(request,context,'verify-identity',async(db,body,input)=>{
 validateProtectedReview(!Object.keys(body).some(key=>!['version','identityRevision','bankRevision','sameLegalPersonConfirmed','evidenceReference','reason','commandId'].includes(key))&&[body.version,body.identityRevision,body.bankRevision].every(Number.isSafeInteger)&&body.sameLegalPersonConfirmed===true&&typeof body.evidenceReference==='string'&&body.evidenceReference.trim().length>=4&&body.evidenceReference.trim().length<=191&&typeof body.reason==='string'&&body.reason.trim().length>=10&&body.reason.trim().length<=1000);
 return verifyProtectedIdentityChange(db,{...input,expectedVersion:body.version as number,expectedIdentityRevision:body.identityRevision as number,expectedBankRevision:body.bankRevision as number,sameLegalPersonConfirmed:true,evidenceReference:body.evidenceReference as string,reason:body.reason as string});
});}
