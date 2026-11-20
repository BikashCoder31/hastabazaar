import {positiveOriginalPaidSql} from '../lib/payments/recovery-partial-paid-source';
export function retainedOriginalSourcePoolView(source:string){
 const views=[...source.matchAll(/CREATE VIEW seller_recovery_original_source_pools AS [\s\S]+?;/g)];
 if(views.length!==1)throw new Error('Review the one retained original-source-pool view before Maria translation.');
 return views[0][0];
}
export function retained0138OriginalSourcePoolView(source:string){
 const view=retainedOriginalSourcePoolView(source);
 if(/recovery_receipt_reversal/i.test(view))throw new Error('Keep0138 original accounting independent of later0139 receipt reversal rules.');
 return view;
}
/** The retained SQLite view supplies all historical rules; replace only the proven dialect defect. */
export function mariaOriginalSourcePoolView(source:string){
 let view=retainedOriginalSourcePoolView(source).replaceAll('\r\n','\n');
 for(const model of ['registered','managed'] as const){
  const original=positiveOriginalPaidSql(model,'native_source.scopeId','native_source.sellerId');
  if(view.split(original).length!==2)throw new Error('Review the exact '+model+' positive-paid fragment before Maria translation.');
  view=view.replace(original,positiveOriginalPaidSql(model,'native_source.scopeId','native_source.sellerId','mariadb'));
 }
 return view;
}
export function patchMariaOriginalSourcePoolView(sqliteSource:string,mariaSource:string){
 return mariaSource.replace(retainedOriginalSourcePoolView(mariaSource),mariaOriginalSourcePoolView(sqliteSource));
}
