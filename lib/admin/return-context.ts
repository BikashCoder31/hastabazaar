const contextOrigin='https://return-context.invalid';
export const ADMIN_RETURN_TO_HEADER = 'x-hastabazaar-admin-return-to';

function localAdminTarget(value:unknown):string|null{
 if(typeof value!=='string'||value.length>4096||value!==value.trim()||Array.from(value).some(character=>{const code=character.charCodeAt(0);return character==='\\'||code<32||code===127;}))return null;
 try{
  const url=new URL(value,contextOrigin);
  if(!value.startsWith('/')||url.origin!==contextOrigin||!/^\/admin(?:\/|$)/.test(url.pathname)||/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(url.pathname))return null;
  return url.pathname+url.search+url.hash;
 }catch{return null;}
}

/** Navigation context contains no authority; every destination still authenticates its reader. */
export function safeAdminReturnTo(value:unknown,fallback='/admin'):string{
 return localAdminTarget(value)??localAdminTarget(fallback)??'/admin';
}

export function withAdminReturnTo(destination:string,returnTo:unknown):string{
 const local=localAdminTarget(destination);if(!local)throw new Error('A review destination must be a local admin route.');
 const url=new URL(local,contextOrigin);url.searchParams.set('returnTo',safeAdminReturnTo(returnTo));
 return url.pathname+url.search+url.hash;
}
