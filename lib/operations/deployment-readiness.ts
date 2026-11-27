import {inspectReadiness} from './readiness';
import {inspectVariantPricingReadiness} from '../products/variant-pricing';
import {inspectHostedSecurityReadiness} from '../security/hosted-policy';
import type {SecurityPolicyBindings} from '../security/runtime-policy';

type SecurityCheck=(bindings:SecurityPolicyBindings,database:D1Database)=>Promise<{ready:boolean;reasonCodes:string[]}>;

/** Deployment acceptance includes account security. Liveness stays independent. */
export async function inspectDeploymentReadiness(database:D1Database,bindings:SecurityPolicyBindings,securityCheck:SecurityCheck=inspectHostedSecurityReadiness){
 const schema=await inspectReadiness(database);
 if(!schema.ready || (database as D1Database & {dialect?:string}).dialect!=='mariadb')return schema;
 const pricing=await inspectVariantPricingReadiness(database);
 if(!pricing.ready)return pricing;
 try{
  const security=await securityCheck(bindings,database);
  if(!security.ready)return {ready:false,missing:security.reasonCodes.length?security.reasonCodes.map(code=>'security:'+code):['security:SECURITY_STATE_UNAVAILABLE']};
  return schema;
 }catch{return {ready:false,missing:['security:SECURITY_STATE_UNAVAILABLE']};}
}
