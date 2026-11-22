export const accountCommandActions=['profile.update','address.create','address.update','address.delete','privacy.request','review.submit']as const;
export type AccountCommandAction=typeof accountCommandActions[number];
export interface AccountCommandReference{action:AccountCommandAction;sourceId:string;requestId:string;relatedId?:string}
export interface AccountCommandOutcome{requestId:string;status:'recorded'|'unconfirmed'}
