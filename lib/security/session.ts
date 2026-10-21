import type { HostedSessionIdentity } from '../auth/hosted-session';
import { SecurityStateError } from './crypto';
import { privilegedSessionExpired, proofIsCurrent } from './model';
import { hasPrivateSecurityState, SecurityStore } from './store';

/** Missing configuration is legacy only when no protected records exist. */
export async function securityStore(database:D1Database,key:string|undefined,initialized=false):Promise<SecurityStore|null>{
  if(key)return new SecurityStore(database,key,initialized);
  if(initialized)throw new SecurityStateError();
  if(await hasPrivateSecurityState(database))throw new SecurityStateError('The existing security key is unavailable. Recover the matching key; MFA has not been disabled.');
  return null;
}

export async function staffAccountSecurity(database:D1Database,userId:string,key?:string,initialized=false){
  const store=await securityStore(database,key,initialized);
  return store ? store.readAccount(userId) : null;
}

export async function legacyStaffSetupAllowed(database:D1Database,userId:string,key?:string,initialized=false){
  const store=await securityStore(database,key,initialized);if(!store)return true;
  const manifest=await store.readManifest();if(!manifest)return true;
  const account=await store.readAccount(userId);
  return account?.value.status==='pending' && manifest.value.legacyUserIds.includes(userId);
}

export async function staffSessionIsVerified(database:D1Database,row:HostedSessionIdentity,sessionHash:string,key:string|undefined,now:number,activity=false,initialized=false):Promise<boolean>{
  const store=await securityStore(database,key,initialized);
  const account=store ? await store.readAccount(row.accountId) : null;
  if(!account || account.value.status==='pending')return await legacyStaffSetupAllowed(database,row.accountId,key,initialized) && !privilegedSessionExpired(row.createdAt,row.lastSeenAt,now);
  const proof=await store!.readProof(sessionHash,row.accountId);
  if(!proof || !proofIsCurrent(proof.value,account.value,now))return false;
  if(activity && now-proof.value.lastActivityAt>=60_000){
    try{await store!.checkedBatch(store!.proofUpsert(proof,{...proof.value,lastActivityAt:now},now));}
    catch{
      // Parallel user requests may have advanced the same proof. Re-read rather
      // than accepting a stale value or turning a routine race into a bypass.
      const currentAccount=await store!.readAccount(row.accountId);
      const current=await store!.readProof(sessionHash,row.accountId);
      if(!currentAccount || !current || !proofIsCurrent(current.value,currentAccount.value,now))return false;
    }
  }
  return true;
}

export function interactiveNavigation(headers:Headers):boolean{
  return headers.get('sec-fetch-user')==='?1' || headers.get('sec-fetch-dest')==='document';
}
