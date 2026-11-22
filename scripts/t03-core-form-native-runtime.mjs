import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {resolvePublishedForm} from '../lib/forms/runtime.ts';
import {validateSellerFormSubmission,digestFormRequest} from '../lib/forms/submission.ts';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog.ts';
import {getEditableSellerProfile,updateSellerProfile} from '../lib/db/repositories/seller-profile.ts';
import {saveRegistration} from '../lib/sellers/registration-store.ts';
import {listFormAnswersForSubject} from '../lib/db/repositories/form-answers.ts';
import {saveRiderPolicy,riderPolicy} from '../lib/riders/repository.ts';
import {isRiderPortalEnabled} from '../lib/riders/availability.ts';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const pause=ms=>new Promise(done=>setTimeout(done,ms));

/** Two real owned loopback connections. The seam pauses only AFTER native GET_LOCK succeeds. */
export async function verifyT03CoreFormRuntime(fixture){
 const control=fixture.connection,database=fixture.database;
 assert.match(database,/^fixture_[a-f0-9]{8}_t03f_[a-z0-9_]+$/);
 assert.equal((await control.query('SELECT DATABASE() AS name'))[0][0].name,database);
 const originalFactory=mysql.createPool,keys=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'],prior=keys.map(key=>process.env[key]);
 const authenticated=control.connection.config;
 /** @type {import('mysql2/promise').Pool | undefined} */
 let actualPool;
 let gate;const inFlight=[];
 const wrap=connection=>new Proxy(connection,{get(target,property){
  if(property==='execute')return async(sql,bindings)=>{
   const active=gate;
   if(active&&sql==='SELECT GET_LOCK(?,30) AS acquired'&&bindings?.[0]===active.key){
    if(active.owner===null){
     active.owner=target.threadId;
     const result=await target.execute(sql,bindings);
     assert.equal(Number(result[0][0].acquired),1);
     active.acquired.resolve();
     await active.release.promise;
     return result;
    }
    if(target.threadId!==active.owner){active.waiter=target.threadId;active.attempted.resolve();}
   }
   return target.execute(sql,bindings);
  };
  const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
 }});
 mysql.createPool=configuration=>{
  assert.equal(configuration.host,'127.0.0.1');assert.equal(configuration.port,fixture.port);
  assert.equal(configuration.database,database);assert.equal(configuration.password,'owned-t03-form-transport');
  assert.equal(configuration.jsonStrings,true);assert.equal(actualPool,undefined);
  // Credentials stay in memory, from this helper's already authenticated NEW fixture only.
  actualPool=originalFactory({...configuration,user:authenticated.user,password:authenticated.password,connectionLimit:4});
  return new Proxy(actualPool,{get(target,property){
   if(property==='getConnection')return async()=>wrap(await target.getConnection());
   const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
  }});
 };
 Object.entries({DB_HOST:'127.0.0.1',DB_PORT:String(fixture.port),DB_NAME:database,DB_USER:'owned-t03-form-transport',DB_PASSWORD:'owned-t03-form-transport'}).forEach(([key,value])=>process.env[key]=value);
 const lockKey=formId=>'form:'+createHash('sha256').update(database+'\0'+formId).digest('hex').slice(0,59);
 async function race(formId,first,second){
  const active={key:lockKey(formId),owner:null,waiter:null,acquired:deferred(),attempted:deferred(),release:deferred()};gate=active;
  let firstResult,secondResult;
  const firstPromise=Promise.resolve().then(first);inFlight.push(firstPromise);void firstPromise.catch(()=>{});
  try{
   await Promise.race([active.acquired.promise,firstPromise.then(()=>{throw Error('First transaction completed without the real form lock.');}),pause(10000).then(()=>{throw Error('First form lock deadline.');})]);
   assert.equal(Number((await control.execute('SELECT IS_USED_LOCK(?) AS owner',[active.key]))[0][0].owner),active.owner);
   const secondPromise=Promise.resolve().then(second);inFlight.push(secondPromise);void secondPromise.catch(()=>{});
   await Promise.race([active.attempted.promise,secondPromise.then(()=>{throw Error('Second transaction completed without contending for the form lock.');}),pause(10000).then(()=>{throw Error('Second form lock deadline.');})]);
   assert.notEqual(active.owner,active.waiter,'The race uses distinct physical Maria connections.');
   let observedWait=false;
   for(let attempt=0;attempt<100;attempt++){
    const rows=(await control.execute('SELECT STATE AS state FROM information_schema.PROCESSLIST WHERE ID=?',[active.waiter]))[0];
    if(/user lock/i.test(rows[0]?.state??'')){observedWait=true;break;}
    await pause(25);
   }
   assert.equal(observedWait,true,'The native server must report the second connection waiting for the real named lock.');
   active.release.resolve();[firstResult,secondResult]=await Promise.allSettled([firstPromise,secondPromise]);
   assert.equal((await control.execute('SELECT IS_USED_LOCK(?) AS owner',[active.key]))[0][0].owner,null,'Both transactions released the real form lock.');
   return{firstResult,secondResult,observedNativeWait:true,distinctConnections:true};
  }finally{active.release.resolve();await Promise.allSettled(inFlight);gate=undefined;}
 }
 try{
  const{env}=await import('../lib/runtime/node-bindings.ts'),db=env.DB,now=Date.now();
  assert.equal(db.dialect,'mariadb');
  console.log(JSON.stringify({stage:'actual-multi-connection-form-adapter-started'}));
  assert.equal(isRiderPortalEnabled(),false,'The native proof must not activate or stub the held rider program.');
  const originalFinancialRows=await Promise.all(['orders','order_items','seller_ledger_entries','payout_requests'].map(async table=>[table,(await control.query('SELECT * FROM '+table+' ORDER BY id'))[0]]));
  const checked=async formId=>{const config=await resolvePublishedForm(db,formId);return validateSellerFormSubmission(db,formId,config.version,[]);};
  const draft=async(formId,requestId)=>saveFormDraft(db,{formId,actorId:'t33legacy-reviewer',actorRole:'super_admin',expectedPublishedVersion:0,
   config:{formId,fields:[{id:'workshop_context',key:'workshop_context',label:'Private operational context',type:'short_text',required:true,status:'active',order:0}]},
   reason:'Publish a purposeful original ordinary-editor extension for an isolated local concurrency proof.',requestId,now});
  const publish=(formId,source,requestId)=>publishFormDraft(db,{formId,draftId:source.id,actorId:'t33legacy-reviewer',actorRole:'super_admin',expectedDraftRevision:source.revision,expectedPublishedVersion:0,
   reason:'First publication must serialize with original native core answer commits.',requestId,now:now+1});

  // Genuine native task command and derived UNION replay, without publishing a native-task editor.
  const policyBefore=await riderPolicy(db),policyForm=await checked('staff.rider-control-2');
  const policyCommand={actorId:'t33legacy-reviewer',version:Number(policyBefore.version),openBox:false,otpScope:policyBefore.otpScope==='off'?'prepaid_only':'off',now,requestId:'native-policy-core',form:{...policyForm,requestId:'native-policy-core'}};
  await saveRiderPolicy(db,policyCommand);const policyAfter=await riderPolicy(db);await saveRiderPolicy(db,policyCommand);
  assert.deepEqual(await riderPolicy(db),policyAfter);
  await assert.rejects(saveRiderPolicy(db,{...policyCommand,otpScope:policyCommand.otpScope==='off'?'prepaid_only':'off'}));
  await assert.rejects(saveRiderPolicy(db,{...policyCommand,actorId:'t33legacy-owner'}));
  await assert.rejects(saveRiderPolicy(db,{...policyCommand,form:{...policyCommand.form,versionId:'unrelated-version-one'}}));
  assert.equal(Number((await control.query("SELECT COUNT(*) AS n FROM form_config_versions WHERE form_id='staff.rider-control-2'"))[0][0].n),0);
  console.log(JSON.stringify({stage:'native-policy-core-command-and-union-replay-passed'}));

  const profile=await getEditableSellerProfile(db,'t33legacy-seller');assert.ok(profile);
  const core=await checked('seller.profile'),profileDraft=await draft('seller.profile','native-profile-draft');
  const original={sellerId:'t33legacy-seller',actorId:'t33legacy-owner',requestId:'native-profile-original',now,input:{...profile,locality:'First private native workshop'},form:{...core,requestId:'native-profile-original'}};
  const coreFirst=await race('seller.profile',()=>updateSellerProfile(db,original),()=>publish('seller.profile',profileDraft,'native-profile-publish'));
  console.log(JSON.stringify({stage:'native-core-first-race-completed',first:coreFirst.firstResult.status,second:coreFirst.secondResult.status}));
  assert.equal(coreFirst.firstResult.status,'fulfilled');assert.equal(coreFirst.secondResult.status,'fulfilled');
  await updateSellerProfile(db,original);
  await assert.rejects(updateSellerProfile(db,{...original,actorId:'t33legacy-buyer'}));
  await assert.rejects(updateSellerProfile(db,{...original,input:{...original.input,locality:'Changed original private intent'}}));
  await assert.rejects(validateSellerFormSubmission(db,'seller.profile',1,[]));
  const published=await validateSellerFormSubmission(db,'seller.profile',1,[{fieldId:'workshop_context',value:'Fictional retained native operational context'}]);
  assert.notEqual(published.versionId,core.versionId);
  await updateSellerProfile(db,{...original,requestId:'native-profile-published',input:{...original.input,locality:'Second private native workshop'},form:{...published,requestId:'native-profile-published'}});
  const history=await listFormAnswersForSubject(db,'seller','t33legacy-seller');
  assert.equal(history.filter(row=>row.formId==='seller.profile').length,2);
  assert.equal(history.find(row=>row.versionId===core.versionId)?.answers.answers.length,0);
  assert.equal(history.find(row=>row.versionId===published.versionId)?.answers.answers.length,1);

  // The account's verified email is an explicit original fictional fixture fact, never submitted form data.
  await control.query("INSERT INTO account_email_verifications(user_id,email,verified_at) SELECT id,lower(email),1 FROM users WHERE id='t33legacy-buyer'");
  const applicationCore=await checked('seller.application'),applicationDraft=await draft('seller.application','native-application-draft');
  const answers={legalName:['Fictional optional native applicant']},requestId='native-optional-intake';
  const digest=await digestFormRequest({answers,requestId,versionId:applicationCore.versionId});
  const publicationFirst=await race('seller.application',()=>publish('seller.application',applicationDraft,'native-application-publish'),()=>saveRegistration(db,{
   userId:'t33legacy-buyer',email:'legacy-buyer@local.hastabazaar.test',sellerId:'native-optional-seller',previous:null,answers,documents:{},newDocuments:[],now,requestId,digest,form:applicationCore}));
  console.log(JSON.stringify({stage:'native-publication-first-race-completed',first:publicationFirst.firstResult.status,second:publicationFirst.secondResult.status}));
  assert.equal(publicationFirst.firstResult.status,'fulfilled');assert.equal(publicationFirst.secondResult.status,'rejected');
  for(const[sql,bindings]of[
   ['SELECT COUNT(*) AS n FROM seller_profiles WHERE id=?',['native-optional-seller']],
   ['SELECT COUNT(*) AS n FROM seller_registration_intakes WHERE seller_id=?',['native-optional-seller']],
   ["SELECT COUNT(*) AS n FROM user_roles WHERE user_id=? AND role='seller'",['t33legacy-buyer']],
   ["SELECT COUNT(*) AS n FROM audit_logs WHERE request_id=?",[requestId]],
   ["SELECT COUNT(*) AS n FROM audit_logs WHERE action='form.core_answers' AND subject_id=?",['native-optional-seller']],
  ])assert.equal(Number((await control.execute(sql,bindings))[0][0].n),0,'Publication won: no domain write or receipt may escape rollback.');
  assert.equal(isRiderPortalEnabled(),false);
  for(const[table,rows]of originalFinancialRows)assert.deepEqual((await control.query('SELECT * FROM '+table+' ORDER BY id'))[0],rows,'Original money and order facts remained unchanged: '+table);
  return{actualNodeAdapter:true,actualMultiConnectionPool:true,nativePolicyCommandAndExactUnionReplay:true,actorDigestAndOriginNegatives:true,
   coreFirst:{observedNativeWait:coreFirst.observedNativeWait,distinctConnections:coreFirst.distinctConnections,coreSaved:true,publicationSaved:true,originalCoreReplayAfterPublication:true},
   publicationFirst:{observedNativeWait:publicationFirst.observedNativeWait,distinctConnections:publicationFirst.distinctConnections,obsoleteCoreRejected:true,domainAndReceiptRolledBack:true},
   retainedRequiredExtension:true,originalAndPublishedAnswerHistory:true,originalFinancialRowsUnchanged:true,noRiderEnablement:true,noSellerActivation:true};
 }finally{
  gate?.release.resolve();await Promise.allSettled(inFlight);if(actualPool)await actualPool.end();mysql.createPool=originalFactory;
  keys.forEach((key,index)=>prior[index]===undefined?delete process.env[key]:process.env[key]=prior[index]);
 }
}
