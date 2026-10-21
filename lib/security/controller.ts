import { hostedSessionHash } from '../auth/hosted-session';
import { safeRelativeReturnPath } from '../http/safe-return';
import { MfaService } from './mfa';
import { proofIsCurrent } from './model';
import { securityStore,staffSessionIsVerified } from './session';
import { handleBootstrap } from './bootstrap';
import {markSecurityInitialized} from './runtime-policy';
import { freshPassword,initializeForStaff,liveActorGuards,newSecuritySession,requiredStore,securityActor,securityBindings,securityFailure,securityMutation,SecurityRequestError,securityResponse,text } from './request';

export async function securityStatus(request:Request){
 try{
  const {db,actor,key,initialized}=await securityActor(request),store=await securityStore(db,key,initialized),manifest=store?await store.readManifest():null;
  const registrationRequired=Boolean(manifest&&!manifest.value.userIds.includes(actor.id));
  const account=store&&!registrationRequired?await store.readAccount(actor.id):null;
  const credential=await db.prepare('SELECT 1 FROM user_credentials WHERE user_id=?').bind(actor.id).first();
  const proof=store&&actor.sessionHash&&account?.value.status==='active'?await store.readProof(actor.sessionHash,actor.id):null;
  const verified=Boolean(proof && account && proofIsCurrent(proof.value,account.value,Date.now()) && Date.now()-proof.value.verifiedAt<=5*60000);
  return securityResponse({user:{displayName:actor.displayName,email:actor.email,role:actor.role},status:account?.value.status==='active'?(verified?'active':'verify'):account?.value.setup?'setup':'pending',needsPassword:!credential,canManage:account?.value.status!=='active'||verified,sessionVerified:verified,localSimulation:actor.localSimulation,session:{absoluteHours:8,idleMinutes:30},recoveryRemaining:account?.value.recovery?.hashes.length??0,keyConfigured:Boolean(key),registrationRequired});
 }catch(error){return securityFailure(error);}
}
export async function handleSecurityAction(request:Request,action:'bootstrap'|'setup'|'confirm'|'verify'|'recovery'){
 try{
  const {db,actor,key,initialized,data}=await securityMutation(request,action),store=requiredStore(db,key,initialized);
  if(action==='bootstrap')return await handleBootstrap(request,db,actor,store,data);
  const credential=await freshPassword(db,actor,text(data,'password'));
  await initializeForStaff(store,actor);
  const service=new MfaService(store),now=Date.now();
  if(action==='setup'){
    const account=await store.readAccount(actor.id);
    let setup:{setupId:string;secret:string;expiresAt:number};
    let cookie:string|undefined;
    if(account?.value.status==='active' && actor.sessionHash && await service.hasFreshProof({userId:actor.id,sessionHash:actor.sessionHash,now})){
      setup=await service.beginSetup({userId:actor.id,sessionHash:actor.sessionHash,now,linkedStatements:liveActorGuards(db,actor,credential.hash)});
    }else{
      const session=newSecuritySession(db,actor,credential.hash,now);
      setup=account?.value.status==='active'
        ? await service.beginVerifiedReplacement({userId:actor.id,sessionHash:actor.sessionHash??session.hash,targetSessionHash:session.hash,passwordVerifiedAt:now,code:text(data,'code',80),recovery:data.recovery===true,now,linkedStatements:session.statements})
        : await service.beginSetup({userId:actor.id,sessionHash:session.hash,now,linkedStatements:session.statements});
      cookie=session.cookie;
    }
    const otpAuthUrl=`otpauth://totp/${encodeURIComponent('HastaBazaar:'+actor.email)}?secret=${setup.secret}&issuer=HastaBazaar&algorithm=SHA1&digits=6&period=30`;
    return securityResponse({setupId:setup.setupId,manualKey:setup.secret,otpAuthUrl},200,cookie);
  }
  if(!actor.sessionHash && action==='confirm')throw new SecurityRequestError('Sign in again before confirming this setup.',401);
  if(action==='confirm'){
    const setupId=text(data,'setupId',100);
    if(data.acknowledge===true){
      const session=newSecuritySession(db,actor,credential.hash,now,true);
      await markSecurityInitialized(securityBindings());
      await service.activateSetup({userId:actor.id,sessionHash:actor.sessionHash!,targetSessionHash:session.hash,setupId,recoverySaved:true,passwordVerifiedAt:now,now,linkedStatements:session.statements});
      return securityResponse({ok:true,status:'active'},200,session.cookie);
    }
    const result=await service.confirmSetup({userId:actor.id,sessionHash:actor.sessionHash!,setupId,code:text(data,'code',6),now,linkedStatements:liveActorGuards(db,actor,credential.hash)});
    return securityResponse({setupId:result.setupId,recoveryCodes:result.codes});
  }
  if(action==='recovery' && actor.sessionHash && await service.hasFreshProof({userId:actor.id,sessionHash:actor.sessionHash,now})){
    const result=await service.rotateRecovery({userId:actor.id,sessionHash:actor.sessionHash,passwordVerifiedAt:now,now,linkedStatements:liveActorGuards(db,actor,credential.hash)});
    return securityResponse({recoveryCodes:result.codes,recoveryRemaining:result.codes.length});
  }
  const session=newSecuritySession(db,actor,credential.hash,now);
  const options={userId:actor.id,sessionHash:actor.sessionHash??session.hash,targetSessionHash:session.hash,passwordVerifiedAt:now,code:text(data,'code',80),now,linkedStatements:session.statements};
  if(action==='recovery'){
    const result=await service.replaceRecovery({...options,recovery:data.recovery===true});
    return securityResponse({recoveryCodes:result.codes,recoveryRemaining:result.codes.length},200,session.cookie);
  }
  if(data.recovery===true)await service.verifyRecovery(options);else await service.verifyTotp(options);
  const destination=safeRelativeReturnPath(text(data,'returnTo',2000)||'/admin');
  return securityResponse({ok:true,returnTo:destination},200,session.cookie);
 }catch(error){return securityFailure(error);}
}

export async function securityActivity(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new SecurityRequestError('Cross-site requests are not allowed.');
  const {db,actor,key,initialized}=await securityActor(request);
  if(!actor.raw || !actor.sessionHash)return securityResponse({ok:true,setupPending:true});
  const now=Date.now();
  if(!await staffSessionIsVerified(db,actor.raw,hostedSessionHash(request.headers)!,key,now,true,initialized))throw new SecurityRequestError('Your Admin session ended. Sign in again.',401,'SESSION_EXPIRED');
  await db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE token_hash=? AND last_seen_at<? AND expires_at>?').bind(now,actor.sessionHash,now,now).run();
  return securityResponse({ok:true,expiresAt:actor.raw.expiresAt});
 }catch(error){return securityFailure(error);}
}
