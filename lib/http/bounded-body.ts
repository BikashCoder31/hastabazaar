export class BodyTooLargeError extends Error {
 constructor() { super('The request is too large.'); }
}
export async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
 if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError('Invalid body limit');
 if (Number(request.headers.get('content-length') ?? 0)>maximum) throw new BodyTooLargeError();
 const reader=request.body?.getReader();
 if(!reader) return new Uint8Array();
 const chunks: Uint8Array[]=[];let total=0;
 try {for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;
  if(total>maximum){await reader.cancel();throw new BodyTooLargeError();}chunks.push(value);
 }} finally {reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function readBoundedForm(request: Request, maximum: number): Promise<FormData> {
 return new Response(await readBoundedBody(request,maximum),{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
}

export function formText(form: FormData, key: string, fallback = ''): string {
 const value=form.get(key);return typeof value==='string'?value:fallback;
}
