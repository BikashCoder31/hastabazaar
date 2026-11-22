/** Query equivalence only: fictional isolated rows, never application/native finance writes. */
export const paidScopeTables:Record<string,{columns:string[];types:string[]}>= {
 payouts:{columns:['id','seller_id','status','amount_paisa'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','VARCHAR(32)','BIGINT']},
 managed_payouts:{columns:['id','seller_id','status','amount_paisa'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','VARCHAR(32)','BIGINT']},
 payout_entries:{columns:['payout_id','ledger_entry_id','released_at'],types:['VARCHAR(191)','VARCHAR(191)','BIGINT']},
 managed_payout_entries:{columns:['payout_id','settlement_entry_id'],types:['VARCHAR(191)','VARCHAR(191)']},
 seller_ledger_entries:{columns:['id','seller_id','order_item_id','amount_paisa'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','VARCHAR(191)','BIGINT']},
 managed_settlement_entries:{columns:['id','entitlement_id','amount_paisa'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','BIGINT']},
 managed_payout_allocations:{columns:['id','payout_id','entitlement_id','amount_paisa','disposition'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','VARCHAR(191)','BIGINT','VARCHAR(32)']},
 payout_transfer_packets:{columns:['id','registered_payout_id','managed_payout_id','payout_model','seller_id','state','amount_paisa','transaction_identity_hash','account_version_id'],types:['VARCHAR(191) PRIMARY KEY','VARCHAR(191)','VARCHAR(191)','VARCHAR(32)','VARCHAR(191)','VARCHAR(32)','BIGINT','VARCHAR(191)','VARCHAR(191)']},
 company_outgoing_bank_identities:{columns:['packet_kind','packet_id','amount_paisa','identity_hash','account_version_id'],types:['VARCHAR(32)','VARCHAR(191)','BIGINT','VARCHAR(191)','VARCHAR(191)']},
 requested:{columns:['scope_id','seller_id'],types:['VARCHAR(191)','VARCHAR(191)']},
};
export const paidScopeSchema=Object.entries(paidScopeTables).map(([name,{columns,types}])=>`CREATE TABLE ${name}(${columns.map((column,index)=>column+' '+types[index]).join(',')})`);
type Value=string|number|null;
export function paidScopeRows(){
 const rows:Record<string,Value[][]>=Object.fromEntries(Object.keys(paidScopeTables).map(table=>[table,[]]));
 function add(model:'registered'|'managed',id:string,components:[string,number][],options:{seller?:string;status?:string;released?:boolean;proof?:'missing'|'hash'|'amount'|'account'|'state';native?:[string,number,string][]}={}){
  const seller=options.seller??'seller-a',amount=1000,packet='packet-'+id;
  rows[model==='registered'?'payouts':'managed_payouts'].push([id,seller,options.status??'paid',amount]);
  for(const [index,[scope,value]] of components.entries()){const entry=id+'-entry-'+index;if(model==='registered'){rows.seller_ledger_entries.push([entry,seller,scope,value]);rows.payout_entries.push([id,entry,options.released?1:null]);}else{rows.managed_settlement_entries.push([entry,scope,value]);rows.managed_payout_entries.push([id,entry]);}}
  for(const [index,[scope,value,state]] of (options.native??[]).entries())rows.managed_payout_allocations.push([id+'-native-'+index,id,scope,value,state]);
  const paid=options.proof==='amount'?amount+1:amount;
  rows.payout_transfer_packets.push([packet,model==='registered'?id:null,model==='managed'?id:null,model,seller,options.proof==='state'?'processing':'paid',paid,'identity-'+id,'account-original']);
  if(options.proof!=='missing')rows.company_outgoing_bank_identities.push(['payout',packet,paid,options.proof==='hash'?'incorrect-identity':'identity-'+id,options.proof==='account'?'account-unrelated':'account-original']);
 }
 add('registered','reg-positive',[['scope-main',100],['scope-main',-30],['scope-main',20],['scope-other',410]]);
 add('registered','reg-negative',[['scope-main',20],['scope-main',-30],['scope-other',110]]);
 add('registered','reg-zero',[['scope-main',25],['scope-main',-25],['scope-other',100]]);
 add('registered','reg-second',[['scope-main',50],['scope-main',-10],['scope-other',60]]);
 add('registered','reg-released',[['scope-main',100]],{released:true});
 add('registered','reg-unpaid',[['scope-main',900]],{status:'processing'});
 add('registered','reg-other-seller',[['scope-main',65]],{seller:'seller-b'});
 add('managed','man-native',[['scope-main',999],['scope-other',900]],{native:[['scope-main',80,'paid'],['scope-other',220,'paid']]});
 add('managed','man-legacy-positive',[['scope-main',70],['scope-main',-20],['scope-other',50]]);
 add('managed','man-legacy-negative',[['scope-main',10],['scope-main',-20],['scope-other',110]]);
 add('managed','man-legacy-zero',[['scope-main',20],['scope-main',-20],['scope-other',100]]);
 add('managed','man-mixed',[['scope-main',500],['scope-other',75],['scope-other',-25]],{native:[['scope-main',35,'paid']]});
 add('managed','man-pending-native',[['scope-main',60],['scope-main',-10]],{native:[['scope-main',40,'reserved']]});
 add('managed','man-unpaid',[['scope-main',900]],{status:'processing',native:[['scope-main',900,'paid']]});
 add('managed','man-other-seller',[['scope-main',45]],{seller:'seller-b'});
 for(const model of ['registered','managed'] as const)for(const proof of ['missing','hash','amount','account','state'] as const)add(model,model+'-'+proof,[['scope-main',700]],{proof});
 rows.requested.push(['scope-main','seller-a'],['scope-other','seller-a'],['scope-main','seller-b'],['scope-empty','seller-a']);
 return rows;
}
export const paidScopeExpected=[{scopeId:'scope-empty',sellerId:'seller-a',registeredPaisa:0,managedPaisa:0},{scopeId:'scope-main',sellerId:'seller-a',registeredPaisa:130,managedPaisa:215},{scopeId:'scope-main',sellerId:'seller-b',registeredPaisa:65,managedPaisa:45},{scopeId:'scope-other',sellerId:'seller-a',registeredPaisa:680,managedPaisa:530}];
