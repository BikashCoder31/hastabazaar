export interface DeliveryLocation {latitude:number;longitude:number;accuracy?:number}
export function parseLocation(value:unknown):DeliveryLocation|undefined {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object')throw new Error('Select a valid location.');
 const p=value as Record<string,unknown>;
 if(typeof p.latitude!=='number'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)throw new Error('Select a valid location.');
 if(p.accuracy!==undefined&&(typeof p.accuracy!=='number'||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>100000))throw new Error('Invalid location accuracy.');
 return {latitude:p.latitude,longitude:p.longitude,...(p.accuracy!==undefined?{accuracy:p.accuracy as number}:{})};
}
export function safeCourierUrl(value:string):string {
 if(!value.trim())return '';
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.endsWith('.local')||value.length>500)throw new Error('Use a public HTTPS courier tracking link without login details.');
 return u.href;
}
