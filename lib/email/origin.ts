/** HTTP links are restricted to the approved loopback preview and an explicit capture transport. */
export function emailApplicationOrigin(origin:string,transport?:'provider'|'capture',isolatedCaptureOrigin?:string){
 const url=new URL(origin);
 const localCapture=transport==='capture'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.port==='3018';
 const isolatedCapture=transport==='capture'&&origin===isolatedCaptureOrigin&&origin===url.origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Boolean(url.port)&&url.port!=='3018';
 if((url.protocol!=='https:'&&!localCapture&&!isolatedCapture)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('A trusted HTTPS application origin or approved local capture origin is required.');
 return url;
}
