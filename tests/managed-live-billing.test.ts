import test from 'node:test';
import assert from 'node:assert/strict';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {recordManagedLiveFinancialScope,readManagedLiveFinancialReadiness} from '../lib/managed-commerce/live-billing';
import {companyDetails} from '../lib/content/company-details';
import {getEffectiveBusinessSetting} from '../lib/db/repositories/business-settings';
import {digestFormRequest} from '../lib/forms/submission';

void test('actual invoice readiness requires explicit audited model and independent actual series, never PAN inference',async()=>{
 const f=await incentiveReportDatabase();try{
 f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");
 const company=await getEffectiveBusinessSetting(f.db,'managed_maker_company_account',100);
 const scope={companyEntityReference:company.value.entityReference,companyScopeDigest:await digestFormRequest({company:{...companyDetails},entityReference:company.value.entityReference})};
 assert.equal((await readManagedLiveFinancialReadiness(f.db,{sellerId:'maker',...scope},100)).ready,false);
 const input={...scope,issuerModel:'company_commercial_invoice_v1' as const,issuer:{legalName:companyDetails.legalName,taxMode:'PAN',taxRegistrationNumber:companyDetails.pan,address:companyDetails.registeredOffice,phone:'9800000000'},seriesPrefix:'FIC-2083',seriesVersion:'series-v1',openingNumber:101,evidenceReference:'FICTIONAL-EXPLICIT-COMMERCIAL-INVOICE-CLEARANCE',reason:'Independently inspect the declared actual commercial invoice model and opening sequence.'};
 const ctx={actorId:'reviewer',requestId:'fictional-financial-scope',expectedRevision:null,now:100};
 const result=await recordManagedLiveFinancialScope(f.db,ctx,input);
 assert.deepEqual(await recordManagedLiveFinancialScope(f.db,ctx,input),result);
 const ready=await readManagedLiveFinancialReadiness(f.db,{sellerId:'maker',...scope,financialScopeId:result.id},100);
 assert.equal(ready.ready,true);assert.equal(ready.issuerModel,'company_commercial_invoice_v1');assert.equal(ready.financialScopeId,result.id);
 assert.equal((await readManagedLiveFinancialReadiness(f.db,{sellerId:'maker',...scope,companyScopeDigest:'c'.repeat(64)},100)).ready,false);
 await assert.rejects(()=>recordManagedLiveFinancialScope(f.db,{...ctx,requestId:'unsupported-tax-invoice'},{...input,issuerModel:'tax_invoice' as never}));
 await assert.rejects(()=>recordManagedLiveFinancialScope(f.db,{...ctx,requestId:'substituted-company'},{...input,issuer:{...input.issuer,legalName:'Different Company'}}),/actual company/);
 await assert.rejects(()=>recordManagedLiveFinancialScope(f.db,{...ctx,requestId:'duplicate-actual-series'},input));
 }finally{f.dispose();}
});
