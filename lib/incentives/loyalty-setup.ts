import type {LoyaltyTerms} from './types';
import {moneyInput,nepalDateTimeInput,parseNepalDateTime,nprToPaisa} from './presentation';
import {loyaltyLiability,validateLoyaltyTerms,validateWeeklyPoints} from './loyalty-policy';
export interface LoyaltySetupFields {
  enabled:boolean;rewardMode:'fixed'|'weekly';weeklyPoints:readonly string[];graceEnabled:boolean;dailyPoints:string;
  pointsPerBlock:string;creditPaisaPerBlock:string;startsAt:string;endsAt:string;dailyBudgetPoints:string;lifetimeBudgetPoints:string;
}
export interface LoyaltySetupAssessment {ready:boolean;terms:LoyaltyTerms|null;issues:Record<string,string>}
export const approvedWeeklyPoints=Object.freeze([5,7,9,10,11,13,15]);
export function loyaltyEditorValues(terms:LoyaltyTerms,preferWeekly=false):LoyaltySetupFields {
  const initial=preferWeekly&&!terms.enabled&&terms.startsAt===null&&terms.endsAt===null&&terms.dailyBudgetPoints===null&&terms.lifetimeBudgetPoints===null;
  return {enabled:terms.enabled,rewardMode:terms.weeklyPoints!==undefined||initial?'weekly':'fixed',weeklyPoints:terms.weeklyPoints?.map(String)??approvedWeeklyPoints.map(String),
    graceEnabled:initial?false:terms.graceEnabled??false,dailyPoints:String(terms.dailyPoints),pointsPerBlock:String(terms.pointsPerBlock),creditPaisaPerBlock:moneyInput(terms.creditPaisaPerBlock),
    startsAt:terms.startsAt===null?'':nepalDateTimeInput(terms.startsAt),endsAt:terms.endsAt===null?'':nepalDateTimeInput(terms.endsAt),
    dailyBudgetPoints:terms.dailyBudgetPoints===null?'':String(terms.dailyBudgetPoints),lifetimeBudgetPoints:terms.lifetimeBudgetPoints===null?'':String(terms.lifetimeBudgetPoints)};
}
export function loyaltyPositiveInput(raw:string,label:string) {
  if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error(`Enter a finite safe positive integer for ${label}.`);
  return Number(raw);
}
export function loyaltyWeeklyInput(values:readonly FormDataEntryValue[]) {
  if(values.length!==7)throw new Error('Enter exactly seven weekly point awards.');
  const schedule=values.map((raw,index)=>{if(typeof raw!=='string')throw new Error(`Enter Day ${index+1} points.`);return loyaltyPositiveInput(raw,`Day ${index+1} points`);});
  try{return validateWeeklyPoints(schedule);}catch{throw new Error('Weekly point awards must strictly increase each day and have a safe total.');}
}
function readDate(raw:string,original:number|null) {return original!==null&&raw===nepalDateTimeInput(original)?original:parseNepalDateTime(raw);}
export function assessLoyaltySetup(values:LoyaltySetupFields,original:LoyaltyTerms):LoyaltySetupAssessment {
  const issues:Record<string,string>={};
  function number(field:keyof LoyaltySetupFields,label:string) {try{return loyaltyPositiveInput(String(values[field]),label);}catch(cause){issues[field]=cause instanceof Error?cause.message:`Enter ${label}.`;return null;}}
  const pointsPerBlock=number('pointsPerBlock','points per block');let creditPaisaPerBlock:number|null=null;
  try{creditPaisaPerBlock=nprToPaisa(values.creditPaisaPerBlock,'credit per block in NPR');if(creditPaisaPerBlock<1)throw new Error('Enter a positive credit per block in NPR.');}catch(cause){issues.creditPaisaPerBlock=cause instanceof Error?cause.message:'Enter a valid credit per block in NPR.';}
  if(typeof values.enabled!=='boolean'||typeof values.graceEnabled!=='boolean')issues.enabled='Choose whether earning and grace should be enabled.';
  if(!['fixed','weekly'].includes(values.rewardMode))issues.rewardMode='Choose a fixed or repeating seven-day schedule.';
  let weeklyPoints:readonly number[]|undefined;
  if(values.rewardMode==='weekly') {
    if(values.weeklyPoints.length!==7)issues.weeklyPoints='Enter exactly seven weekly point awards.';
    values.weeklyPoints.forEach((raw,index)=>{try{loyaltyPositiveInput(raw,`Day ${index+1} points`);}catch(cause){issues[`weeklyPoints.${index}`]=cause instanceof Error?cause.message:'Enter positive whole points.';}});
    if(!Object.keys(issues).some(key=>key.startsWith('weeklyPoints')))try{weeklyPoints=loyaltyWeeklyInput(values.weeklyPoints);}catch(cause){issues.weeklyPoints=cause instanceof Error?cause.message:'Use increasing weekly awards.';}
  }
  const dailyPoints=values.rewardMode==='weekly'?weeklyPoints?.[0]??null:number('dailyPoints','daily points');
  let startsAt:number|null=null,endsAt:number|null=null;
  for(const [field,label] of [['startsAt','start'],['endsAt','end']] as const) {
    try {if(!values[field])throw new Error(`Choose the earning ${label} date and time in Nepal time.`);const parsed=readDate(values[field],original[field]);if(field==='startsAt')startsAt=parsed;else endsAt=parsed;}
    catch(cause){issues[field]=cause instanceof Error?cause.message:`Choose a valid ${label} date in Nepal time.`;}
  }
  if(startsAt!==null&&endsAt!==null&&endsAt<=startsAt)issues.endsAt='The earning end must be after the start.';
  const dailyBudgetPoints=number('dailyBudgetPoints','daily points limit'),lifetimeBudgetPoints=number('lifetimeBudgetPoints','total points limit');
  const largest=weeklyPoints?.[6]??dailyPoints;
  if(largest!==null&&largest!==undefined)for(const [field,limit] of [['dailyBudgetPoints',dailyBudgetPoints],['lifetimeBudgetPoints',lifetimeBudgetPoints]] as const)
    if(limit!==null&&limit<largest)issues[field]=`This shared points limit must cover at least ${largest} points, the largest daily award.`;
  if(lifetimeBudgetPoints!==null&&pointsPerBlock!==null&&creditPaisaPerBlock!==null)try{loyaltyLiability(lifetimeBudgetPoints,pointsPerBlock,creditPaisaPerBlock);}catch{issues.lifetimeBudgetPoints='Lifetime budget exposure exceeds the supported integer range. Reduce the total point limit.';}
  if(Object.keys(issues).length)return {ready:false,terms:null,issues};
  const terms:LoyaltyTerms={enabled:values.enabled,dailyPoints:dailyPoints!,...(weeklyPoints?{weeklyPoints,graceEnabled:values.graceEnabled}:{}),
    ...(values.rewardMode==='fixed'&&original.weeklyPoints===undefined&&original.graceEnabled!==undefined?{graceEnabled:false}:{}),pointsPerBlock:pointsPerBlock!,creditPaisaPerBlock:creditPaisaPerBlock!,
    startsAt,endsAt,dailyBudgetPoints,lifetimeBudgetPoints};
  try{validateLoyaltyTerms(terms);}catch{return {ready:false,terms:null,issues:{form:'Review finite dates, shared limits and point awards before saving.'}};}
  return {ready:true,terms,issues:{}};
}
/** Preserve exact original timestamps while parsing the existing form boundary. */
export function readTerms(data:FormData,original:LoyaltyTerms):LoyaltyTerms {
  const text=(name:string)=>{const value=data.get(name);return typeof value==='string'?value:'';};
  const mode=text('rewardMode')||(original.weeklyPoints===undefined?'fixed':'weekly');
  const values:LoyaltySetupFields={enabled:data.get('enabled')==='on',rewardMode:mode as 'fixed'|'weekly',weeklyPoints:data.getAll('weeklyPoints').map(value=>typeof value==='string'?value:''),graceEnabled:data.get('graceEnabled')==='on',
    dailyPoints:text('dailyPoints'),pointsPerBlock:text('pointsPerBlock'),creditPaisaPerBlock:text('creditPaisaPerBlock'),startsAt:text('startsAt'),endsAt:text('endsAt'),dailyBudgetPoints:text('dailyBudgetPoints'),lifetimeBudgetPoints:text('lifetimeBudgetPoints')};
  const result=assessLoyaltySetup(values,original);if(!result.terms)throw new Error(Object.values(result.issues)[0]??'Review the loyalty setup fields.');return result.terms;
}
