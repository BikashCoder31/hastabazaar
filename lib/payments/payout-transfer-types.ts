export class PayoutTransferError extends Error {constructor(message:string,readonly status=409){super(message);}}
export type PayoutModel='registered'|'managed'|'fixed';
export interface PayoutSource {model:PayoutModel;id:string;sellerId:string;ownerId:string;status:string;amountPaisa:number;beneficiaryVersionId:string;identityRevision:number;bankRevision:number;snapshot:string;guards:D1PreparedStatement[];}

