import {resolveRuntimeEnvironment,type RuntimeEnvironmentKind} from '../staging/environment';
export interface DatabaseHealthScope{environment:RuntimeEnvironmentKind;releaseId:string;}
export interface DatabaseHealthBindings{HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string;HASTABAZAAR_RELEASE_ID?:string;NODE_ENV?:string;}
const contexts=new WeakMap<D1Database,DatabaseHealthScope>();
/** Server bindings only. No request-body or form-answer input is accepted here. */
export function captureDatabaseHealthScope(db:D1Database,bindings:DatabaseHealthBindings){
 const keys=['HASTABAZAAR_RUNTIME_ENV','APP_ORIGIN','HASTABAZAAR_RELEASE_ID'] as const;
 if(!keys.some(key=>bindings[key]!==undefined))return;
 try{
  if(bindings.HASTABAZAAR_RELEASE_ID!==undefined&&!/^[-a-zA-Z0-9_.:]{1,160}$/.test(bindings.HASTABAZAAR_RELEASE_ID))throw new Error('The form health release metadata is invalid.');
  const environment=bindings.HASTABAZAAR_RUNTIME_ENV?resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,appOrigin:bindings.APP_ORIGIN,nodeEnvironment:bindings.NODE_ENV??process.env.NODE_ENV}).kind:null;
  if(!environment||!bindings.APP_ORIGIN||!bindings.HASTABAZAAR_RELEASE_ID){contexts.delete(db);return;}
  contexts.set(db,Object.freeze({environment,releaseId:bindings.HASTABAZAAR_RELEASE_ID}));
 }catch(error){contexts.delete(db);throw error;}
}
export function readDatabaseHealthScope(db:D1Database):DatabaseHealthScope|null{return contexts.get(db)??null;}
