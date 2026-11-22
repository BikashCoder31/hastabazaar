import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {assistedRecoveryIntentFixture} from './helpers/assisted-recovery-intent-fixture';

const state={db:null as D1Database|null,key:'',sent:0};
(globalThis as typeof globalThis&{assistedNativeIntent:typeof state}).assistedNativeIntent=state;
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,'+encodeURIComponent('export const env={get DB(){return globalThis.assistedNativeIntent.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.assistedNativeIntent.key},SECURITY_POLICY:{async read(){return true},async mark(){}},APP_ORIGIN:"https://security-assistance.test",HASTABAZAAR_RUNTIME_ENV:"test",EMAIL:{configured:true,async send(){globalThis.assistedNativeIntent.sent++}}};'),shortCircuit:true};return next(specifier,context);}});

void test('actual fresh-MFA assisted route rejects displayed A intent under equally eligible B before issuance',async()=>{
 const f=await assistedRecoveryIntentFixture();state.db=f.db;state.key=f.key;state.sent=0;
 try{
  const{POST}=await import('../app/api/security/assisted-recovery/route');
  const body={targetId:'target-a',kind:'password',confirmedEmail:'target-a@local.hastabazaar.test',confirmedTarget:true,supportReference:'SUP-FICTIONAL-A',verificationMethod:'seller_onboarding',verificationReference:'SELLER-FICTIONAL-A',ownershipVerified:true};
  const request=(actor:string,intent:string|undefined)=>new Request('https://security-assistance.test/api/security/assisted-recovery',{method:'POST',headers:{origin:'https://security-assistance.test','content-type':'application/json',cookie:`hastabazaar_session=${f.token(actor)}`,...(intent===undefined?{}:{'X-Hastabazaar-Actor':intent})},body:JSON.stringify(body)});
  const denied=await POST(request('assist-b','assist-a'));assert.equal(denied.status,403);assert.equal(state.sent,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()?.n,0);
  const current=await POST(request('assist-b','assist-b'));assert.equal(current.status,200,await current.clone().text());assert.equal(state.sent,1);
  assert.equal(f.sqlite.prepare("SELECT actor_id FROM audit_logs WHERE subject_id='target-a'").get()?.actor_id,'assist-b');
  assert.equal(f.sqlite.prepare("SELECT password_version FROM user_credentials WHERE user_id='target-a'").get()?.password_version,1);
 }finally{state.db=null;state.key='';f.dispose();}
});
