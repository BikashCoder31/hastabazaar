'use client';
import type {usePublicationCommand} from './use-publication-command';
/** Keep the original attempt in memory without displaying private controls to a changed actor. */
export function ProductAccessNotice({command,onRead}:{command:ReturnType<typeof usePublicationCommand>;onRead?:()=>Promise<unknown>}){
 async function check(){const current=command.capture();try{if(onRead)await onRead();if(!current())return false;if(command.pending)return command.checkOutcome();if(onRead&&!command.accessDenied)return true;window.location.reload();return false;}catch(error){if(current())command.setStatus(error instanceof Error?error.message:'Current Product access remains unavailable.');return false;}}
 return <ProductReadAccessNotice status={command.status} busy={command.busy} onCheck={check}/>;
}
export function ProductReadAccessNotice({status,busy,onCheck}:{status:string;busy:boolean;onCheck:()=>Promise<unknown>}){return <section className="space-y-3 rounded-xl border p-4"><h2 className="text-xl font-semibold">Current Product access is unavailable</h2><p>The original request remains retained. Recheck the intended account and current source before continuing. No new attempt has been started.</p><output className="block">{status}</output><button type="button" className="min-h-11 rounded-lg border px-4 py-2" disabled={busy} onClick={()=>void onCheck()}>Check current access and original outcome</button></section>;}

export function ProductOutcomeCheck({command}:{command:ReturnType<typeof usePublicationCommand>}){
 return command.pending?<button type="button" className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50" disabled={command.busy} onClick={()=>void command.checkOutcome()}>Check original saved outcome</button>:null;
}
