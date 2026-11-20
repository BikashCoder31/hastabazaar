import type {ConfiguredField,PublishedFormConfig} from '../forms/types';
import {FORM_REGISTRY} from '../forms/registry';
const canonical=(value:string)=>value.replace(/[^a-z0-9]/gi,'').toLowerCase();
/** Native commercial controls and owner-only pricing inputs are never ordinary custom questions. */
export function productIntakeCustomFields(config:PublishedFormConfig):ConfiguredField[]{
 const baseKeys=new Set(FORM_REGISTRY['seller.product-submission'].baseFields.map(field=>canonical(field.key)));
 return config.fields.filter(field=>field.status==='active'&&!baseKeys.has(canonical(field.key))&&
  ![field.id,field.key,field.label].some(value=>/\b(cost|profit|margin)\b/i.test(value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' '))))
  .map(field=>({...field,required:false}));
}
