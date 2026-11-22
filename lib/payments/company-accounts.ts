import {companyDetails} from '../content/company-details';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {payableOrderTotalSql} from '../db/repositories/platform-service-fee';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';

export class CompanyAccountError extends Error {constructor(message:string,readonly status=409){super(message);}}
class CompanyAccountAuthorizationError extends CompanyAccountError {constructor(message:string){super(message,403);}}
export interface CompanyAccountDetails {holder:string;bank:string;branch:string;accountNumber:string;currency:'NPR';purpose:'receiving'|'payment_source'|'both';}
type Version={id:string;accountId:string;number:number;revision:number;status:'draft'|'awaiting_verification'|'verified'|'inactive';detailsJson:string;evidenceReference:string;conflictsJson:string;createdBy:string;createdAt:number;verifiedBy:string|null;verifiedAt:number|null;verificationReference:string|null};
const columns='v.id,v.account_id AS accountId,v.number,v.revision,v.status,v.details_json AS detailsJson,v.evidence_reference AS evidenceReference,v.conflicts_json AS conflictsJson,v.created_by AS createdBy,v.created_at AS createdAt,v.verified_by AS verifiedBy,v.verified_at AS verifiedAt,v.verification_reference AS verificationReference';
const safeText=(value:unknown,min:number,max:number,label:string)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\p{Cc}<>]/u.test(value))throw new CompanyAccountError(`Enter a valid ${label}.`,400);return value.trim();};
const reasonText=(value:unknown)=>safeText(value,10,1000,'reason');
const reference=(value:unknown)=>safeText(value,8,500,'restricted evidence reference');
const normalized=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
export function parseCompanyAccountDetails(raw:CompanyAccountDetails):CompanyAccountDetails{
 if(!raw||typeof raw!=='object'||Object.keys(raw).some(key=>!['holder','bank','branch','accountNumber','currency','purpose'].includes(key))||raw.currency!=='NPR'||!['receiving','payment_source','both'].includes(raw.purpose))throw new CompanyAccountError('Choose NPR and the intended company account purpose.',400);
 const details={holder:safeText(raw.holder,3,160,'account holder'),bank:safeText(raw.bank,3,160,'bank'),branch:safeText(raw.branch,2,160,'branch'),accountNumber:safeText(raw.accountNumber,4,40,'account number'),currency:raw.currency,purpose:raw.purpose};
 if(!/^[A-Za-z0-9 -]+$/.test(details.accountNumber))throw new CompanyAccountError('Use the account number shown by the bank.',400);
 return details;
}
function guard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
async function currentVersion(db:D1Database,id:string){const row=await db.prepare(`SELECT ${columns} FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id AND a.latest_version_id=v.id WHERE v.id=?`).bind(id).first<Version>();if(!row)throw new CompanyAccountError('This account version is no longer current. Refresh its retained history.');return row;}
function versionGuard(db:D1Database,row:Version,context:CommandContext){if(context.expectedRevision!==String(row.revision))throw new CompanyAccountError('The account version changed. Refresh before deciding.');return guard(db,'EXISTS(SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=? AND v.revision=? AND v.status=? AND a.latest_version_id=v.id)',[row.id,row.revision,row.status]);}
function noConflict(row:Version,actorId:string){if((JSON.parse(row.conflictsJson) as string[]).includes(actorId))throw new CompanyAccountError('An eligible Super Admin without this recorded personal conflict must decide.',403);}
function event(db:D1Database,context:CommandContext,id:string,accountId:string,versionId:string,action:string,reason:string){return db.prepare('INSERT INTO company_payment_account_events(id,account_id,version_id,actor_id,action,reason,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,accountId,versionId,context.actorId,action,reason,context.now);}
function head(db:D1Database,context:CommandContext,accountId:string,eventId:string){return db.prepare('UPDATE company_payment_accounts SET revision=revision+1,last_event_id=?,updated_at=? WHERE id=?').bind(eventId,context.now,accountId);}
async function notice(db:D1Database,context:CommandContext,accountId:string,eventId:string,status:string){return operationalBusinessNotificationStatements(db,{kind:'company.account',sourceId:accountId,eventId,actorId:context.actorId,now:context.now,status});}
async function staffCommand(db:D1Database,context:CommandContext,action:string,subjectId:string,payload:unknown){
 const authority=await staffMutationGuard(db,context.actorId,'business_settings.manage',CompanyAccountAuthorizationError,'super_admin');
 const source={action:'company.account.'+action,subjectType:'company_payment_account',subjectId},receipt=await commandReceipt(db,context,source,payload);
 return {authority,receipt,async commit(statements:D1PreparedStatement[],result:unknown){if(receipt.replayed)return receipt.result;try{await db.batch([...authority.statements,...statements,receipt.insert(result)]);return result;}catch(error){const retry=await commandReceipt(db,context,source,payload);if(retry.replayed)return retry.result;throw new CompanyAccountError(/constraint|company_account_.*(?:conflict|immutable)/i.test(String(error))?'The current account, authority or receiving selection changed. Keep your entries and refresh the record.':'The saved account outcome could not be confirmed. Retry this exact request before starting another.',/constraint|company_account_.*(?:conflict|immutable)/i.test(String(error))?409:503);}}};
}
export async function saveCompanyAccountDraft(db:D1Database,context:CommandContext,input:{accountId:string|null;basedOnVersionId:string|null;details:CompanyAccountDetails;evidenceReference:string;conflictUserIds:string[];reason:string}){
 const details=parseCompanyAccountDetails(input.details),evidenceReference=reference(input.evidenceReference),reason=reasonText(input.reason);
 if(!Array.isArray(input.conflictUserIds)||input.conflictUserIds.length>20||input.conflictUserIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw new CompanyAccountError('Select valid recorded reviewer conflicts.',400);
 const conflicts=[...new Set(input.conflictUserIds)].sort(),payload={...input,details,evidenceReference,conflictUserIds:conflicts,reason};
 const command=await staffCommand(db,context,'draft_saved',input.accountId??'new',payload);if(command.receipt.replayed)return command.receipt.result as {accountId:string;versionId:string};
 let previous:Version|null=null,accountRevision=0;
 if(input.accountId){
  const account=await db.prepare('SELECT revision,latest_version_id AS latest FROM company_payment_accounts WHERE id=?').bind(input.accountId).first<{revision:number;latest:string}>();
  if(!account||context.expectedRevision!==String(account.revision)||account.latest!==input.basedOnVersionId)throw new CompanyAccountError('The account draft base changed. Open its current version before editing.');
  previous=await currentVersion(db,account.latest);accountRevision=account.revision;
  if((JSON.parse(previous.conflictsJson) as string[]).some(id=>!conflicts.includes(id)))throw new CompanyAccountError('A recorded personal conflict cannot be silently removed from a replacement.');
 }else if(context.expectedRevision!==null||input.basedOnVersionId!==null)throw new CompanyAccountError('New accounts require a fresh draft command.',400);
 const accountId=input.accountId??crypto.randomUUID(),versionId=crypto.randomUUID(),eventId=crypto.randomUUID();
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([normalized(details.bank),normalized(details.accountNumber),details.currency]))),identityHash=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 const statements:D1PreparedStatement[]=[...(previous?guard(db,'EXISTS(SELECT 1 FROM company_payment_accounts WHERE id=? AND revision=? AND latest_version_id=?)',[accountId,accountRevision,previous.id]):[db.prepare('INSERT INTO company_payment_accounts(id,last_event_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?)').bind(accountId,eventId,context.actorId,context.now,context.now)]),
  ...guard(db,`(SELECT COUNT(*) FROM users WHERE id IN (${conflicts.map(()=>'?').join(',')||'NULL'}))=?`,[...conflicts,conflicts.length]),
  db.prepare('INSERT OR IGNORE INTO company_payment_account_identities(identity_hash,account_id) VALUES(?,?)').bind(identityHash,accountId),
  ...guard(db,'EXISTS(SELECT 1 FROM company_payment_account_identities WHERE identity_hash=? AND account_id=?)',[identityHash,accountId]),
  db.prepare('INSERT INTO company_payment_account_versions(id,account_id,number,supersedes_id,identity_hash,details_json,evidence_reference,conflicts_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(versionId,accountId,(previous?.number??0)+1,previous?.id??null,identityHash,JSON.stringify(details),evidenceReference,JSON.stringify(conflicts),context.actorId,context.now),
  db.prepare('UPDATE company_payment_account_current SET version_id=NULL,revision=revision+1,updated_by=?,updated_at=? WHERE version_id IN (SELECT id FROM company_payment_account_versions WHERE account_id=?)').bind(context.actorId,context.now,accountId),
  db.prepare('UPDATE company_payment_accounts SET latest_version_id=?,revision=revision+1,last_event_id=?,updated_at=? WHERE id=?').bind(versionId,eventId,context.now,accountId),
  event(db,context,eventId,accountId,versionId,'draft_saved',reason),...await notice(db,context,accountId,eventId,'draft_saved')];
 return await command.commit(statements,{accountId,versionId}) as {accountId:string;versionId:string};
}
export async function submitCompanyAccountForReview(db:D1Database,context:CommandContext,input:{versionId:string;reason:string}){
 const reason=reasonText(input.reason),command=await staffCommand(db,context,'submitted',input.versionId,{...input,reason});if(command.receipt.replayed)return;
 const row=await currentVersion(db,input.versionId);if(row.status!=='draft')throw new CompanyAccountError('Only the current draft can be submitted.');const eventId=crypto.randomUUID();
 await command.commit([...versionGuard(db,row,context),db.prepare("UPDATE company_payment_account_versions SET status='awaiting_verification',submitted_at=?,revision=revision+1 WHERE id=?").bind(context.now,row.id),head(db,context,row.accountId,eventId),event(db,context,eventId,row.accountId,row.id,'submitted',reason),...await notice(db,context,row.accountId,eventId,'awaiting_verification')],{versionId:row.id,revision:row.revision+1});
}
export async function verifyCompanyAccount(db:D1Database,context:CommandContext,input:{versionId:string;ownershipConfirmed:boolean;currencyConfirmed:boolean;verificationReference:string;reason:string}){
 const reason=reasonText(input.reason),verificationReference=reference(input.verificationReference);
 if(input.ownershipConfirmed!==true||input.currencyConfirmed!==true)throw new CompanyAccountError('Confirm actual company ownership and NPR receiving currency from the evidence.',400);
 const command=await staffCommand(db,context,'verified',input.versionId,{...input,reason,verificationReference});if(command.receipt.replayed)return;
 const row=await currentVersion(db,input.versionId);noConflict(row,context.actorId);
 if(row.status!=='awaiting_verification'||normalized((JSON.parse(row.detailsJson) as CompanyAccountDetails).holder)!==normalized(companyDetails.legalName))throw new CompanyAccountError('The submitted evidence must establish the canonical company as account holder.');
 const eventId=crypto.randomUUID();await command.commit([...versionGuard(db,row,context),db.prepare("UPDATE company_payment_account_versions SET status='verified',revision=revision+1,verified_by=?,verified_at=?,verification_reference=? WHERE id=?").bind(context.actorId,context.now,verificationReference,row.id),head(db,context,row.accountId,eventId),event(db,context,eventId,row.accountId,row.id,'verified',reason),...await notice(db,context,row.accountId,eventId,'verified')],{versionId:row.id,revision:row.revision+1});
}
export async function publishCompanyReceivingAccount(db:D1Database,context:CommandContext,input:{versionId:string;expectedReceivingRevision:number;reason:string}){
 const reason=reasonText(input.reason);if(!Number.isSafeInteger(input.expectedReceivingRevision)||input.expectedReceivingRevision<0)throw new CompanyAccountError('Refresh the current receiving-account selection.',400);
 const command=await staffCommand(db,context,'receiving_enabled',input.versionId,{...input,reason});if(command.receipt.replayed)return;
 const row=await currentVersion(db,input.versionId);noConflict(row,context.actorId);const details=JSON.parse(row.detailsJson) as CompanyAccountDetails;
 if(row.status!=='verified'||!['receiving','both'].includes(details.purpose))throw new CompanyAccountError('Only a verified current receiving account can be enabled.');
 const eventId=crypto.randomUUID();await command.commit([...versionGuard(db,row,context),...guard(db,"EXISTS(SELECT 1 FROM company_payment_account_current WHERE currency='NPR' AND revision=?)",[input.expectedReceivingRevision]),
  db.prepare('UPDATE company_payment_account_versions SET revision=revision+1 WHERE id=?').bind(row.id),
  db.prepare("UPDATE company_payment_account_current SET version_id=?,revision=revision+1,updated_by=?,updated_at=? WHERE currency='NPR'").bind(row.id,context.actorId,context.now),head(db,context,row.accountId,eventId),event(db,context,eventId,row.accountId,row.id,'receiving_enabled',reason),...await notice(db,context,row.accountId,eventId,'receiving_enabled')],{versionId:row.id,revision:row.revision+1});
}
export async function retireCompanyAccount(db:D1Database,context:CommandContext,input:{versionId:string;reason:string}){
 const reason=reasonText(input.reason),command=await staffCommand(db,context,'retired',input.versionId,{...input,reason});if(command.receipt.replayed)return;
 const row=await currentVersion(db,input.versionId);noConflict(row,context.actorId);if(row.status==='inactive')throw new CompanyAccountError('This account version is already inactive.');const eventId=crypto.randomUUID();
 await command.commit([...versionGuard(db,row,context),db.prepare('UPDATE company_payment_account_current SET version_id=NULL,revision=revision+1,updated_by=?,updated_at=? WHERE version_id=?').bind(context.actorId,context.now,row.id),db.prepare("UPDATE company_payment_account_versions SET status='inactive',revision=revision+1 WHERE id=?").bind(row.id),head(db,context,row.accountId,eventId),event(db,context,eventId,row.accountId,row.id,'retired',reason),...await notice(db,context,row.accountId,eventId,'retired')],{versionId:row.id,revision:row.revision+1});
}
export async function getCompanyAccountWorkspace(db:D1Database,actorId:string,now=Date.now()){
 const authority=await staffMutationGuard(db,actorId,'business_settings.view',CompanyAccountAuthorizationError,'super_admin');
 const [accounts,versions,receiving,events,reviewers]=await Promise.all([
  db.prepare('SELECT id,revision,latest_version_id AS latestVersionId FROM company_payment_accounts ORDER BY created_at DESC,id').all<{id:string;revision:number;latestVersionId:string}>(),
  db.prepare(`SELECT ${columns} FROM company_payment_account_versions v ORDER BY v.number DESC`).all<Version>(),
  db.prepare("SELECT version_id AS versionId,revision FROM company_payment_account_current WHERE currency='NPR'").first<{versionId:string|null;revision:number}>(),
  db.prepare('SELECT account_id AS accountId,version_id AS versionId,actor_id AS actorId,action,reason,created_at AS createdAt FROM company_payment_account_events ORDER BY created_at,id').all<{accountId:string;versionId:string;actorId:string;action:string;reason:string;createdAt:number}>(),
  db.prepare("SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY u.display_name,u.id").all<{id:string;name:string}>()
 ]);if(!receiving)throw new CompanyAccountError('Company receiving-account state is unavailable.',503);
 if(accounts.results.some(account=>!versions.results.some(version=>version.id===account.latestVersionId&&version.accountId===account.id)))throw new CompanyAccountError('A company account history is incomplete. Receiving readiness cannot be assumed.',503);
 if(receiving.versionId&&!versions.results.some(version=>version.id===receiving.versionId&&version.status==='verified'&&accounts.results.some(account=>account.id===version.accountId&&account.latestVersionId===version.id)))throw new CompanyAccountError('The selected receiving account needs reconciliation.',503);
 await db.batch([...authority.statements,db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,?,'company.account.evidence_viewed','company_payment_account','workspace',?)").bind(crypto.randomUUID(),actorId,now)]);
 return {receiving,reviewers:reviewers.results,accounts:accounts.results.map(account=>({...account,versions:versions.results.filter(version=>version.accountId===account.id).map(({detailsJson,conflictsJson,...version})=>({...version,details:JSON.parse(detailsJson) as CompanyAccountDetails,conflictUserIds:JSON.parse(conflictsJson) as string[]})),events:events.results.filter(event=>event.accountId===account.id)}))};
}
export type CompanyPaymentInstruction={orderId:string;accountVersionId:string;account:Pick<CompanyAccountDetails,'holder'|'bank'|'branch'|'accountNumber'|'currency'>;amountPaisa:number;reference:string;issuedAt:number;deadlineAt:number;calendarVersion:string};
/** Published receiving details only. Callers enforce access to their original order or recovery. */
export async function getVerifiedCompanyReceivingAccount(db:D1Database,now=Date.now()) {
 const row=await db.prepare(`SELECT v.id,v.details_json AS detailsJson FROM company_payment_account_current c
  JOIN company_payment_account_versions v ON v.id=c.version_id JOIN company_payment_accounts a ON a.id=v.account_id
  WHERE c.currency='NPR' AND v.status='verified' AND v.verified_at<=? AND a.latest_version_id=v.id`).bind(now).first<{id:string;detailsJson:string}>();
 if(!row)return null;
 const details=JSON.parse(row.detailsJson) as CompanyAccountDetails;
 if(details.currency!=='NPR'||!['receiving','both'].includes(details.purpose))return null;
 return {accountVersionId:row.id,account:{holder:details.holder,bank:details.bank,branch:details.branch,accountNumber:details.accountNumber,currency:details.currency},checkedAt:now};
}
/** Internal new-order producer; append after the order INSERT in its reservation transaction. */
export async function prepareNewCompanyPaymentInstruction(db:D1Database,context:CommandContext,order:{id:string;number:string;amountPaisa:number}){
 if(!Number.isSafeInteger(order.amountPaisa)||order.amountPaisa<=0)throw new CompanyAccountError('Review the exact positive payable amount before issuing instructions.');
 const row=await db.prepare(`SELECT ${columns},c.revision AS selectionRevision FROM company_payment_account_current c JOIN company_payment_account_versions v ON v.id=c.version_id JOIN company_payment_accounts a ON a.id=v.account_id WHERE c.currency='NPR' AND v.status='verified' AND v.verified_at<=? AND a.latest_version_id=v.id`).bind(context.now).first<Version&{selectionRevision:number}>();
 if(!row)throw new CompanyAccountError('No verified company receiving account is enabled. Manual bank transfer remains unavailable.');
 const details=JSON.parse(row.detailsJson) as CompanyAccountDetails;
 if(!['receiving','both'].includes(details.purpose))throw new CompanyAccountError('This account is not approved for receiving customer payments.');
 const snapshot:CompanyPaymentInstruction={orderId:order.id,accountVersionId:row.id,account:{holder:details.holder,bank:details.bank,branch:details.branch,accountNumber:details.accountNumber,currency:details.currency},amountPaisa:order.amountPaisa,reference:order.number,issuedAt:context.now,deadlineAt:context.now+86_400_000,calendarVersion:CONTINUOUS_CALENDAR_VERSION};
 return {snapshot,statements:[...guard(db,"EXISTS(SELECT 1 FROM company_payment_account_current c JOIN company_payment_account_versions v ON v.id=c.version_id JOIN company_payment_accounts a ON a.id=v.account_id WHERE c.currency='NPR' AND c.version_id=? AND c.revision=? AND v.status='verified' AND v.revision=? AND a.latest_version_id=v.id)",[row.id,row.selectionRevision,row.revision]),
  ...guard(db,`EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=? AND payment_mode='prepaid' AND payment_status='unpaid' AND status='placed' AND (${payableOrderTotalSql()})=?)`,[order.id,context.actorId,order.amountPaisa]),
  db.prepare('INSERT INTO company_payment_instructions(order_id,account_version_id,snapshot_json,amount_paisa,currency,payment_reference,issued_at,deadline_at,calendar_version,issued_by,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(order.id,row.id,JSON.stringify(snapshot),order.amountPaisa,'NPR',order.number,context.now,snapshot.deadlineAt,snapshot.calendarVersion,context.actorId,context.requestId)]};
}
const ownerSql="EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=? AND u.id=? AND u.status='active')";
async function requireInstructionOwner(db:D1Database,orderId:string,actorId:string){if(!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(orderId,actorId).first())throw new CompanyAccountError('Current access to this order is required.',403);}
async function savedInstruction(db:D1Database,orderId:string){const row=await db.prepare('SELECT snapshot_json AS json FROM company_payment_instructions WHERE order_id=?').bind(orderId).first<{json:string}>();if(!row)throw new CompanyAccountError('Payment instructions are not available.',404);return JSON.parse(row.json) as CompanyPaymentInstruction;}
/** Internal order producer. T20 must compose instruction/reservation creation in the checkout commit; this exposes no payment method or transfer endpoint. */
export async function issueCompanyPaymentInstructions(db:D1Database,context:CommandContext,input:{orderId:string}):Promise<CompanyPaymentInstruction>{
 await requireInstructionOwner(db,input.orderId,context.actorId);
 const source={action:'company.payment.instructions_issued',subjectType:'order',subjectId:input.orderId},receipt=await commandReceipt(db,context,source,input);
 if(receipt.replayed)return savedInstruction(db,input.orderId);
 const order=await db.prepare(`SELECT order_number AS number,updated_at AS updatedAt,${payableOrderTotalSql()} AS amount FROM orders WHERE id=? AND payment_mode='prepaid' AND payment_status='unpaid' AND status='placed'`).bind(input.orderId).first<{number:string;updatedAt:number;amount:number}>();
 if(!order||context.expectedRevision!==String(order.updatedAt)||!Number.isSafeInteger(order.amount)||order.amount<=0)throw new CompanyAccountError('The current unpaid prepaid order must be reviewed before issuing instructions.');
 const row=await db.prepare(`SELECT ${columns},c.revision AS selectionRevision FROM company_payment_account_current c JOIN company_payment_account_versions v ON v.id=c.version_id JOIN company_payment_accounts a ON a.id=v.account_id WHERE c.currency='NPR' AND v.status='verified' AND v.verified_at<=? AND a.latest_version_id=v.id`).bind(context.now).first<Version&{selectionRevision:number}>();
 if(!row)throw new CompanyAccountError('No verified company receiving account is enabled. Manual bank instructions remain unavailable.');
 const details=JSON.parse(row.detailsJson) as CompanyAccountDetails;
 const snapshot:CompanyPaymentInstruction={orderId:input.orderId,accountVersionId:row.id,account:{holder:details.holder,bank:details.bank,branch:details.branch,accountNumber:details.accountNumber,currency:details.currency},amountPaisa:order.amount,reference:order.number,issuedAt:context.now,deadlineAt:context.now+86400000,calendarVersion:CONTINUOUS_CALENDAR_VERSION};
 try{await db.batch([...guard(db,ownerSql,[input.orderId,context.actorId]),...guard(db,`EXISTS(SELECT 1 FROM orders WHERE id=? AND updated_at=? AND payment_mode='prepaid' AND payment_status='unpaid' AND status='placed' AND (${payableOrderTotalSql()})=?)`,[input.orderId,order.updatedAt,order.amount]),
  ...guard(db,"EXISTS(SELECT 1 FROM company_payment_account_current c JOIN company_payment_account_versions v ON v.id=c.version_id JOIN company_payment_accounts a ON a.id=v.account_id WHERE c.currency='NPR' AND c.version_id=? AND c.revision=? AND v.status='verified' AND v.revision=? AND a.latest_version_id=v.id)",[row.id,row.selectionRevision,row.revision]),
  db.prepare('INSERT INTO company_payment_instructions(order_id,account_version_id,snapshot_json,amount_paisa,currency,payment_reference,issued_at,deadline_at,calendar_version,issued_by,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(input.orderId,row.id,JSON.stringify(snapshot),order.amount,'NPR',order.number,context.now,snapshot.deadlineAt,snapshot.calendarVersion,context.actorId,context.requestId),receipt.insert({orderId:input.orderId})]);}
 catch{const retry=await commandReceipt(db,context,source,input);if(retry.replayed)return savedInstruction(db,input.orderId);throw new CompanyAccountError('Instructions could not be committed against the current order and bank version. Refresh the saved outcome.');}
 return snapshot;
}
export async function getCompanyPaymentInstruction(db:D1Database,orderId:string,actorId:string){
 await requireInstructionOwner(db,orderId,actorId);const snapshot=await savedInstruction(db,orderId);
 const state=await db.prepare('SELECT v.status,a.latest_version_id AS latest FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=?').bind(snapshot.accountVersionId).first<{status:string;latest:string}>();
 await requireInstructionOwner(db,orderId,actorId);
 return {...snapshot,requiresAccountReview:!state||state.status!=='verified'||state.latest!==snapshot.accountVersionId};
}
