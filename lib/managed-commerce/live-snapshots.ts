import type {ManagedCommercialTerms} from './snapshots';
import {calculateManagedEligibleBasePaisa,calculateManagedSaleLinkedAmounts} from '../managed-makers/settlement';

/** Server-read activation proof. The order transaction must also include its retained native guards. */
export interface ManagedLiveOrderProof {
 sellerId:string;activationDecisionId:string;clearanceId:string;financialScopeId:string;
 issuerModel:'company_commercial_invoice_v1';issuerScopeDigest:string;companyScopeDigest:string;
 acceptedManagedDetailId:string;
}
export function buildLiveSaleLinkedCommercialSnapshot(input:ManagedCommercialTerms,proof:ManagedLiveOrderProof){
 if(input.commercialModel!=='managed_sale_linked_percentage_v1'||proof.sellerId!==input.sellerId||proof.acceptedManagedDetailId!==input.acceptedManagedDetailId||proof.issuerModel!=='company_commercial_invoice_v1')throw new Error('The original live sale-linked terms and issuer proof must match.');
 for(const value of [proof.activationDecisionId,proof.clearanceId,proof.financialScopeId,proof.acceptedManagedDetailId,input.legalSellerReference,input.invoiceIssuerReference,input.payoutBeneficiaryReference,input.agreementVersion])if(typeof value!=='string'||value.trim().length<3||value.length>191)throw new Error('Exact original live financial provenance is required.');
 if(!/^[a-f0-9]{64}$/.test(proof.issuerScopeDigest)||!/^[a-f0-9]{64}$/.test(proof.companyScopeDigest))throw new Error('Exact original issuer and company scope are required.');
 const eligibleBasePaisa=calculateManagedEligibleBasePaisa(input);
 return Object.freeze({...input,...calculateManagedSaleLinkedAmounts({eligibleBasePaisa,platformRetentionBps:input.platformRetentionBps}),commercialModel:'managed_sale_linked_percentage_v1' as const,participationRoute:'managed_maker' as const,recordKind:'live' as const,simulationLabel:null,agreedSupplierAmountPaisa:null,acceptedManagedDetailId:proof.acceptedManagedDetailId,makerName:input.makerName??null,storeName:input.storeName??null,legalSellerName:input.legalSellerName??null,liveProof:Object.freeze({...proof})});
}
