import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRecoveryCommand} from '../lib/payments/recovery-commands';

const body=(extra:Record<string,unknown>={})=>({sourceFormId:'system.recovery-finance',action:'receipt_reversal',requestId:'fictional-return-review',expectedRevision:'0',input:{reversalId:'fictional-reversal',reviewDigest:'a'.repeat(64),unallocatedPaisa:0,allocations:[],evidenceReference:'FICTIONAL-BANK-EVIDENCE',reason:'Review the exact actual bank return facts.',publicMessage:'The original payer return is being reconciled.',...extra}});
void test('protected reversal command accepts bounded explicit paid-loss and never-paid bank-return decisions',()=>{
 assert.doesNotThrow(()=>parseRecoveryCommand(body({completedReturns:[{receiptUseId:'fictional-use',packetId:'fictional-packet',amountPaisa:4000}],companyLossApproved:true}),'staff'));
 assert.doesNotThrow(()=>parseRecoveryCommand(body({reservedReturns:[{receiptUseId:'fictional-use',amountPaisa:4000,originalPayerReturnedConfirmed:true}]}),'staff'));
 assert.doesNotThrow(()=>parseRecoveryCommand(body(),'staff'));
});
void test('protected reversal command rejects ambiguous, duplicate, fractional or injected return decisions',()=>{
 const paid={receiptUseId:'fictional-use',packetId:'fictional-packet',amountPaisa:4000};
 for(const extra of [{completedReturns:[paid]},{companyLossApproved:true},{completedReturns:[paid,paid],companyLossApproved:true},{completedReturns:[{...paid,amountPaisa:0.5}],companyLossApproved:true},{completedReturns:[{...paid,paid:true}],companyLossApproved:true},{reservedReturns:[{receiptUseId:'fictional-use',amountPaisa:4000}]},{reservedReturns:[{receiptUseId:'fictional-use',amountPaisa:4000,originalPayerReturnedConfirmed:'yes'}]}])assert.throws(()=>parseRecoveryCommand(body(extra),'staff'));
 assert.throws(()=>parseRecoveryCommand(body({completedReturns:[paid],companyLossApproved:true}),'seller'));
});
