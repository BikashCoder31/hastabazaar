'use client';
import {useRef,useState} from 'react';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSellerPrivateScope,SellerFormAccessChanged} from './use-seller-private-scope';
type Props={sellerId:string;ownerId:string;disabled:boolean;onUploaded:(media:{id:string;kind:string;name:string;status:string})=>void};
export function PublicProfileUpload(props:Props){return <OwnedPublicProfileUpload key={JSON.stringify([props.ownerId,props.sellerId])} {...props}/>;}
function OwnedPublicProfileUpload({sellerId,ownerId,disabled,onUploaded}:Props){
 const scope=useSellerPrivateScope(ownerId,sellerId);
 const pending=useRef<{body:FormData;name:string;kind:string}|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 async function send(){if(busy||!pending.current||!scope.isCurrent())return;const upload=pending.current;setBusy(true);setMessage('');
  try{const response=await fetch('/api/seller/public-profile/media',{method:'POST',headers:{[ACTOR_INTENT_HEADER]:ownerId},body:upload.body});if(!scope.isCurrent())return;if(response.status===401||response.status===403){scope.deny();return;}const result=await response.json() as {ok?:boolean;id?:string;error?:string};if(!scope.isCurrent())return;
   if(!response.ok){if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setUncertain(false);}throw new Error(result.error??'Upload could not be confirmed.');}
   if(result.ok!==true||!result.id)throw new Error('Upload result is incomplete. Retry the same upload.');
   onUploaded({id:result.id,kind:upload.kind,name:upload.name,status:'pending'});pending.current=null;setUncertain(false);setMessage('Private media uploaded and selected in your draft. Save the draft before submitting it for review.');
  }catch(error){if(!scope.isCurrent())return;setUncertain(!!pending.current);setMessage(error instanceof Error?error.message:'Keep your selected file and retry.');}finally{if(scope.isCurrent())setBusy(false);}}
 if(scope.accessDenied)return <SellerFormAccessChanged/>;
 return <form data-form-id="seller.public-profile-media" className="space-y-3 rounded-xl border p-4" onSubmit={event=>{event.preventDefault();if(disabled||busy||!scope.isCurrent())return;if(!pending.current){const body=new FormData(event.currentTarget),file=body.get('file'),kind=body.get('kind');if(!(file instanceof File)||!file.size){setMessage('Select one optional photo or video. Existing media is retained.');return;}body.set('sellerId',sellerId);body.set('ownerId',ownerId);body.set('requestId',crypto.randomUUID());pending.current={body,name:file.name,kind:typeof kind==='string'?kind:''};}void send();}}>
  <h3 className="font-semibold">Upload optional profile media</h3><p className="text-sm">Uploads remain private until the selected presentation is explicitly published. Use a JPEG, PNG or WebP photo, or an MP4 video up to 20 MB and 60 seconds. Existing files and decision history are retained.</p>
  <fieldset disabled={disabled||busy||uncertain} className="grid gap-3"><label className="text-sm">Media type<select name="kind" className="block w-full rounded-lg border p-3"><option value="profile_image">Profile photo</option><option value="maker_video">Maker video</option></select></label><label className="text-sm">Optional profile file<input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="block w-full rounded-lg border p-3"/></label><button className="rounded-lg border px-4 py-3">Upload private media</button></fieldset>
  {uncertain?<button type="button" disabled={busy||disabled} className="rounded-lg border px-4 py-3" onClick={()=>void send()}>Retry the same media upload</button>:null}<output aria-live="polite" className="block text-sm">{message}</output>
 </form>;
}
