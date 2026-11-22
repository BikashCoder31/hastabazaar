// Administrative names, not a courier coverage guarantee. Source and aliases:
// docs/architecture/section-three-customer-journey-2026-09-13.md
export const DISTRICTS_BY_PROVINCE = {
 Koshi: ['Bhojpur','Dhankuta','Ilam','Jhapa','Khotang','Morang','Okhaldhunga','Panchthar','Sankhuwasabha','Solukhumbu','Sunsari','Taplejung','Terhathum','Udayapur'],
 Madhesh: ['Bara','Dhanusha','Mahottari','Parsa','Rautahat','Saptari','Sarlahi','Siraha'],
 Bagmati: ['Bhaktapur','Chitwan','Dhading','Dolakha','Kathmandu','Kavrepalanchok','Lalitpur','Makwanpur','Nuwakot','Ramechhap','Rasuwa','Sindhuli','Sindhupalchok'],
 Gandaki: ['Baglung','Gorkha','Kaski','Lamjung','Manang','Mustang','Myagdi','Nawalparasi East','Parbat','Syangja','Tanahun'],
 Lumbini: ['Arghakhanchi','Banke','Bardiya','Dang','Gulmi','Kapilvastu','Nawalparasi West','Palpa','Pyuthan','Rolpa','Rukum East','Rupandehi'],
 Karnali: ['Dailekh','Dolpa','Humla','Jajarkot','Jumla','Kalikot','Mugu','Rukum West','Salyan','Surkhet'],
 Sudurpashchim: ['Achham','Baitadi','Bajhang','Bajura','Dadeldhura','Darchula','Doti','Kailali','Kanchanpur'],
} as const;
export type NepalProvince = keyof typeof DISTRICTS_BY_PROVINCE;
export const NEPAL_PROVINCES = Object.keys(DISTRICTS_BY_PROVINCE) as NepalProvince[];
const key = (value: string) => value.trim().toLowerCase().replace(/[()]/g,'').replace(/\s+/g,' ');
const aliases: Record<string,string> = {dhanusa:'Dhanusha',chitawan:'Chitwan',kapilbastu:'Kapilvastu',tanahu:'Tanahun',kavre:'Kavrepalanchok',kavrepalanchowk:'Kavrepalanchok',sindhupalchowk:'Sindhupalchok',tehrathum:'Terhathum',nawalpur:'Nawalparasi East',parasi:'Nawalparasi West','eastern rukum':'Rukum East','western rukum':'Rukum West','nawalparasi east of bardaghat susta':'Nawalparasi East','nawalparasi west of bardaghat susta':'Nawalparasi West'};
export function normalizeProvince(value:string):NepalProvince|undefined {
 return NEPAL_PROVINCES.find(p=>key(p)===key(value));
}
export function normalizeDistrict(value:string):string|undefined {
 const wanted=Object.hasOwn(aliases,key(value))?aliases[key(value)]:value;
 return Object.values(DISTRICTS_BY_PROVINCE).flat().find(d=>key(d)===key(wanted));
}
export function districtBelongsToProvince(district:string,province:string):boolean {
 const p=normalizeProvince(province),d=normalizeDistrict(district);
 return !!p && !!d && (DISTRICTS_BY_PROVINCE[p] as readonly string[]).includes(d);
}
export const wardNumberError = 'Enter a ward number from 1 to 99.';
export function validWard(value:string|undefined):boolean {return !value || (/^\d{1,2}$/.test(value) && Number(value)>=1 && Number(value)<=99);}
