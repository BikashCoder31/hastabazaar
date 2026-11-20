/** Internal SQL aliases only. Original use and paid facts remain immutable. */
export function actualManualReceiptUseSql(alias:string){return `COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=${alias}.id),0)`;}
