/** Server-to-server credentials are accepted only in the Authorization header. */
export async function authorizedEmailJob(request:Request,secret:string|undefined):Promise<boolean>{
 const header=request.headers.get('authorization');
 if(!secret||secret.length<32||secret.length>512||!header?.startsWith('Bearer '))return false;
 const supplied=header.slice(7);if(!supplied||supplied.length>512)return false;
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [expected,actual]=await Promise.all([digest(secret),digest(supplied)]);
 let difference=0;for(let index=0;index<expected.length;index++)difference|=expected[index]^actual[index];
 return difference===0;
}
