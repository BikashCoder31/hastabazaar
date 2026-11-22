/** Task clocks need a time; ordinary date-only financial history remains unchanged. */
export function sellerTaskTimestamp(value:number){return new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(new Date(value))+' Nepal time';}
