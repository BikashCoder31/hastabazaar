export type GiftCardCommandMode='issue'|'redeem';
export interface GiftCardCommandOutcome{requestId:string;status:'recorded'|'unconfirmed';record?:{id:string;amountPaisa:number}}
export const validGiftRequest=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);
