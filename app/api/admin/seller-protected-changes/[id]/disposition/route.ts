import {env} from 'cloudflare:workers';
import {protectedAdminGET,protectedAdminPOST,validateProtectedReview} from '@/lib/sellers/protected-admin-api';
import {resolveRuntimeEnvironment} from '@/lib/staging/environment';
import {disposeProtectedHolds,revalidateCurrentBankAfterIdentity} from '@/lib/sellers/protected-change-disposition';
import {retireProtectedPayout} from '@/lib/sellers/protected-payout-disposition';
import {classifyIdentityEvidenceOnly,type ProtectedCapability} from '@/lib/sellers/protected-change-policy';
export const GET=protectedAdminGET('disposition');
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return protectedAdminPOST(request,context,'disposition',async(db,body,contextInput)=>{
 validateProtectedReview(!Object.keys(body).some(key=>!['action','version','identityRevision','bankRevision','currentEvidenceValidConfirmed','bankOwnershipConfirmed','factsUnchanged','ownershipBasis','capabilities','model','payoutId','notExecutedConfirmed','evidenceReference','reason','commandId'].includes(key))&&['release_holds','retain_holds','revalidate_bank','evidence_only','retire_packet'].includes(String(body.action))&&[body.version,body.identityRevision,body.bankRevision].every(Number.isSafeInteger)&&typeof body.evidenceReference==='string'&&body.evidenceReference.trim().length>=4&&body.evidenceReference.trim().length<=191&&typeof body.reason==='string'&&body.reason.trim().length>=(body.action==='evidence_only'?8:10)&&body.reason.trim().length<=1000);
    const bindings=env as unknown as {HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string};
    const input={...contextInput,expectedVersion:body.version as number,expectedIdentityRevision:body.identityRevision as number,expectedBankRevision:body.bankRevision as number,
      evidenceReference:body.evidenceReference as string,reason:body.reason as string};
    if(body.action==='release_holds'||body.action==='retain_holds'){
      validateProtectedReview(Array.isArray(body.capabilities)&&body.capabilities.every(value=>['new_orders','payouts'].includes(String(value))));
      await disposeProtectedHolds(db,{...input,release:body.action==='release_holds',capabilities:body.capabilities as ProtectedCapability[],currentEvidenceValidConfirmed:body.currentEvidenceValidConfirmed===true,bankOwnershipConfirmed:body.bankOwnershipConfirmed===true});
    }else if(body.action==='revalidate_bank'){
      validateProtectedReview(['same_person','same_legal_entity'].includes(String(body.ownershipBasis)));
      await revalidateCurrentBankAfterIdentity(db,{...input,ownershipConfirmed:body.bankOwnershipConfirmed===true,ownershipBasis:body.ownershipBasis as 'same_person'|'same_legal_entity'});
    }else if(body.action==='evidence_only')await classifyIdentityEvidenceOnly(db,{...input,currentEvidenceValid:body.currentEvidenceValidConfirmed===true,factsUnchanged:body.factsUnchanged===true});
    else{
      validateProtectedReview(['registered','managed','fixed'].includes(String(body.model))&&typeof body.payoutId==='string');
      await retireProtectedPayout(db,{...input,model:body.model as 'registered'|'managed'|'fixed',payoutId:body.payoutId as string,notExecutedConfirmed:body.notExecutedConfirmed===true,
        environment:resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN})});
    }
});}
