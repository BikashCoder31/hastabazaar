import { createHash,randomBytes,randomInt } from 'node:crypto';
import { passwordRecord } from '../auth/hosted-session';
import { SecurityStateError } from './crypto';
import { initializeForStaff,liveActorGuards,newSecuritySession,SecurityRequestError,securityBindings,securityResponse,text,type SecurityActor } from './request';
import type { SecurityStore } from './store';

interface BootstrapRecord{schema:1;userId:string;email:string;tokenHash:string;codeHash:string;attempts:number;expiresAt:number;}
const cookieName='hastabazaar_security_bootstrap';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function validate(value:unknown):BootstrapRecord{
 const v=value as BootstrapRecord;
 if(!v||v.schema!==1||typeof v.userId!=='string'||typeof v.email!=='string'||!/^([a-f0-9]{64})$/.test(v.tokenHash)||!/^([a-f0-9]{64})$/.test(v.codeHash)||!Number.isSafeInteger(v.attempts)||v.attempts<0||v.attempts>5||!Number.isSafeInteger(v.expiresAt))throw new SecurityStateError();
 return v;
}
function cookie(token:string,clear=false){return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:600}${securityBindings().APP_ORIGIN?.startsWith('https:')?'; Secure':''}`;}
export async function handleBootstrap(request:Request,db:D1Database,actor:SecurityActor,store:SecurityStore,data:Record<string,unknown>){
 const exists=await db.prepare('SELECT 1 FROM user_credentials WHERE user_id=?').bind(actor.id).first();
 if(exists)throw new SecurityRequestError('This account already has a password. Use the existing password; it has not been replaced.',409);
 await initializeForStaff(store,actor);
 const account=await store.readAccount(actor.id);
 if(account?.value.status==='active')throw new SecurityRequestError('An enrolled account needs the existing secure recovery procedure.',409);
 const key=`auth-private:bootstrap:${encodeURIComponent(actor.id)}`,now=Date.now();
 if(data.action==='request'){
   const token=Buffer.from(randomBytes(32)).toString('base64url'),code=String(randomInt(0,1000000)).padStart(6,'0');
   const record:BootstrapRecord={schema:1,userId:actor.id,email:actor.email,tokenHash:digest(token),codeHash:digest(`${token}\n${actor.id}\n${code}`),attempts:0,expiresAt:now+600000};
   const previous=await store.readRecord(key,actor.id,validate);
   await store.checkedBatch([...liveActorGuards(db,actor,undefined,true),...(previous?store.replaceRecord(previous,record,now):store.insertRecord(key,actor.id,record,now))]);
   if(actor.localSimulation)return securityResponse({localSimulation:true,code,message:'Simulated local mailbox code. This is not live email delivery.'},200,cookie(token));
   const mail=securityBindings().EMAIL;
   if(!mail?.configured)throw new SecurityRequestError('Mailbox verification is not configured. Your account and password have not changed.',503);
   await mail.send({to:actor.email,subject:'Confirm your Hastabazaar security setup',text:`Your security setup code is ${code}. It expires in 10 minutes. Do not share it.`});
   return securityResponse({localSimulation:false,message:'Check your existing account mailbox.'},200,cookie(token));
 }
 if(data.action!=='complete')throw new SecurityRequestError('Choose a valid security setup action.',422);
 const password=text(data,'password'),confirmation=text(data,'confirmation'),code=text(data,'code',6);
 if(password.length<12 || password!==confirmation)throw new SecurityRequestError('Use matching passwords with at least 12 characters.',422);
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'';
 const snapshot=await store.readRecord(key,actor.id,validate);
 if(!snapshot || snapshot.value.userId!==actor.id || snapshot.value.email!==actor.email || now>=snapshot.value.expiresAt || snapshot.value.attempts>=5 || digest(token)!==snapshot.value.tokenHash)throw new SecurityRequestError('The mailbox check is missing, expired or belongs to another browser. Request a new code.',422);
 if(!/^\d{6}$/.test(code) || digest(`${token}\n${actor.id}\n${code}`)!==snapshot.value.codeHash){await store.checkedBatch(store.replaceRecord(snapshot,{...snapshot.value,attempts:snapshot.value.attempts+1},now));throw new SecurityRequestError('The mailbox code is incorrect. Request a new code if needed.',422);}
 const credential=await passwordRecord(password);
 const session=newSecuritySession(db,actor,credential.hash,now);
 await store.checkedBatch([...liveActorGuards(db,actor,undefined,true),...store.deleteRecord(snapshot),
   db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES (?,?,?,1,?,?)').bind(actor.id,credential.hash,credential.salt,now,now),
   db.prepare('INSERT OR IGNORE INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?)').bind(actor.id,actor.email.toLowerCase(),now),
   ...session.statements]);
 return securityResponse({ok:true,message:'Your first password is set. Continue to authenticator setup.'},200,[session.cookie,cookie('',true)]);
}
