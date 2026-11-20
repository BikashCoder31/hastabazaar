/** In-memory bytes only. No runtime bindings, auth hooks, paths, provider or network. */
export function isolatedMediaBucket(){
 const objects=new Map<string,Uint8Array>(),puts:string[]=[],gets:string[]=[],deletes:string[]=[];
 const bucket={async put(key:string,body:BodyInit){puts.push(key);const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,bytes);return{key,size:bytes.length,etag:'isolated-media',httpEtag:'"isolated-media"',uploaded:new Date(),version:'isolated'};},async get(key:string){gets.push(key);const bytes=objects.get(key);return bytes?{key,size:bytes.length,body:new Response(new Uint8Array(bytes)).body!,etag:'isolated-media',httpEtag:'"isolated-media"',uploaded:new Date()}:null;},async delete(key:string){deletes.push(key);objects.delete(key);}}as unknown as R2Bucket;
 return{objects,puts,gets,deletes,bucket};
}
