/** Stable public field identities. Editorial labels never change privacy, type or meaning. */
const definitions=[
 ['identity','Identity and maker',[['nameEn','Product name'],['nameNe','Product name in Nepali'],['descriptionEn','Description'],['descriptionNe','Description in Nepali'],['brand','Brand or Unbranded'],['producer','Actual maker or producer'],['model','Model or precise item identifier'],['condition','Condition'],['sellerSku','Your stock code']]],
 ['contents','What one purchase contains',[['unitContents','Contents of one purchase'],['packQuantity','Pieces in one sales unit'],['size','Size labels'],['sizeGuide','Size guide or measurements with units'],['fitDependent','Does fit determine this item’s size?']]],
 ['materials','Materials and origin',[['materials','Materials'],['countryOfOrigin','Country of origin'],['originStory','Product or craft story']]],
 ['specifications','Specifications and compatibility',[['specifications','Distinguishing specifications'],['dimensions','Dimensions with units'],['colour','Colour'],['variations','Other descriptive options'],['compatibility','Compatibility'],['power','Power, plug or battery information'],['activeDevice','Is this an active electronic device?']]],
 ['care','Care and safe use',[['careInstructions','Care instructions'],['safetyInformation','Safe-use information']]],
 ['warranty','Warranty and aftercare',[['warrantyOffered','Is a warranty offered?'],['warrantyProvider','Who provides the warranty?'],['warrantyDuration','Warranty duration'],['warrantyTerms','How to claim the warranty'],['returnEligible','Seller-stated return eligibility'],['returnConditions','Additional return information']]],
 ['preparation','Preparation and applicable dates',[['madeToOrder','Made to order'],['preparationDays','Preparation days'],['manufacturedAt','Manufacture date'],['expiresAt','Expiry date']]],
 ['presentation','Photos and discovery',[['coverImage','Product photos'],['occasionIds','Gift occasions']]],
 ['offer','Price and draft availability',[['price','Selling price (NPR)'],['compareAtPrice','Original price (NPR)'],['inventoryQuantity','Draft available quantity']]],
] as const;
export type ProductDetailKey=typeof definitions[number][2][number][0];
export type ProductDetailAnswers=Partial<Record<ProductDetailKey,string|readonly string[]>>;
export type DetailGroupId=typeof definitions[number][0];
export const productDetailGroups=definitions.map(([id,label,fields])=>({id,label,fields:fields.map(([key,label])=>({key,label,intakeRequired:false as const}))}));
export const productDetailKeys=new Set<string>(productDetailGroups.flatMap(group=>group.fields.map(field=>field.key)));
export interface CategoryRule {field:ProductDetailKey;reason:string;when?:{field:ProductDetailKey;equals:string};}
export interface CategoryContract {recommendedGroups:readonly DetailGroupId[];publicationRules:readonly CategoryRule[];orderingRules:readonly CategoryRule[];eligibilityRequirements:readonly string[];labels:Partial<Record<ProductDetailKey,string>>;}
export interface CategoryDetailModel {categoryId:string|null;name:string|null;parentId:string|null;status:'unknown'|'unmapped'|'disabled'|'available';versionId:string|null;revision:number|null;contract:CategoryContract|null;groups:{id:DetailGroupId;label:string;recommended:boolean;fields:{key:ProductDetailKey;label:string;intakeRequired:false}[]}[];}
export type ReadinessIssue={field:string;reason:string;code:'missing'|'invalid'|'outside_scope'|'policy'|'eligibility'};
export const detailText=(answers:ProductDetailAnswers,key:ProductDetailKey)=>{const value=answers[key];return typeof value==='string'?value.trim():Array.isArray(value)?value.join(', ').trim():'';};
/** Guidance on supplied facts only; this is neither approval nor proof of stock or media ownership. */
export function evaluateCategoryReadiness(model:CategoryDetailModel,answers:ProductDetailAnswers,confirmedEligibility:readonly string[]=[]){
 const publication:ReadinessIssue[]=[],ordering:ReadinessIssue[]=[];
 const add=(rows:ReadinessIssue[],field:string,reason:string,code:ReadinessIssue['code']='missing')=>{if(!rows.some(row=>row.field===field&&row.code===code))rows.push({field,reason,code});};
 if(model.status!=='available')add(publication,'categoryId',model.status==='disabled'?'This category is not enabled for new offers. Request an eligible mapping.':'A reviewed category contract is needed; keep this draft and request category help.','policy');
 for(const [field,reason] of [['nameEn','Identify the actual product.'],['descriptionEn','Describe what the customer receives.'],['coverImage','Provide at least one accurate usable cover.'],['unitContents','Identify what one purchase contains.']] as const)if(!detailText(answers,field))add(publication,field,reason);
 const condition=detailText(answers,'condition');if(!condition)add(publication,'condition','Establish that these are unused new goods.');else if(condition!=='new')add(publication,'condition','Used, renewed, refurbished, open-box and display/demo goods are outside this version.','outside_scope');
 const description=[detailText(answers,'nameEn'),detailText(answers,'descriptionEn')].join(' ');
 if(/\b(refurbished|renewed|open[- ]box|second[- ]hand|pre[- ]owned|(?:display|demo) units?|used(?!\s+(?:for|to|with|in|as)\b))\b/i.test(description))add(publication,'condition','The supplied description raises a condition concern. Resolve the actual condition before publication.','outside_scope');
 const price=detailText(answers,'price'),[rupees,decimal='']=price.split('.'),paisa=Number(rupees+decimal.padEnd(2,'0'));if(!/^\d+(?:\.\d{1,2})?$/.test(price)||!Number.isSafeInteger(paisa)||paisa<=0)add(publication,'price','Provide a valid positive price for the actual offer.',price?'invalid':'missing');
 const pack=detailText(answers,'packQuantity');if(!/^\d+$/.test(pack)||!Number.isSafeInteger(Number(pack))||Number(pack)<1)add(publication,'packQuantity','State the actual positive whole number of pieces in one sales unit.',pack?'invalid':'missing');
 const warranty=detailText(answers,'warrantyOffered');if(warranty&&!['yes','no'].includes(warranty))add(publication,'warrantyOffered','Use an explicit Yes or No when declaring a warranty.','invalid');
 if(warranty==='yes')for(const field of ['warrantyProvider','warrantyDuration','warrantyTerms'] as const)if(!detailText(answers,field))add(publication,field,'An offered warranty needs its actual provider, duration and claim terms.');
 for(const [rules,rows]of [[model.contract?.publicationRules,publication],[model.contract?.orderingRules,ordering]] as const)for(const rule of rules??[]){
  if(rule.when){const condition=detailText(answers,rule.when.field);if(!condition){add(rows,rule.when.field,'Clarify this fact so the applicable category requirement can be assessed.');continue;}if(['fitDependent','activeDevice','warrantyOffered','madeToOrder'].includes(rule.when.field)&&!['yes','no'].includes(condition)){add(rows,rule.when.field,'Clarify this fact as Yes or No before deciding which requirement applies.','invalid');continue;}if(condition!==rule.when.equals)continue;}
  if(!detailText(answers,rule.field))add(rows,rule.field,rule.reason);
 }
 for(const requirement of model.contract?.eligibilityRequirements??[])if(!confirmedEligibility.includes(requirement))add(publication,'eligibility:'+requirement,'Current seller/category evidence needs its authorized review.','eligibility');
 const stock=detailText(answers,'inventoryQuantity');if(!/^\d+$/.test(stock)||!Number.isSafeInteger(Number(stock)))add(ordering,'inventoryQuantity','Establish the actual stock or supported capacity before ordering.',stock?'invalid':'missing');
 return {intakeAllowed:true as const,publication,ordering,publicationReady:publication.length===0,orderingFactsReady:publication.length===0&&ordering.length===0,notice:'These are factual readiness checks, not approval, verified media, confirmed stock or commercial activation.'};
}
