'use client';
import Link from 'next/link';
import type {AccountCommandReference} from '@/lib/account/command-outcome-contract';
type Recovery={pending:AccountCommandReference|null;busy:boolean;canRetry:boolean;message:string;invalidReference?:boolean;retry:()=>unknown;checkOutcome:()=>unknown};
const actionNames={'profile.update':'profile change','address.create':'new address','address.update':'address change','address.delete':'address removal','privacy.request':'privacy request','review.submit':'review submission'}as const;
export function AccountCommandRecovery({command}:{command:Recovery}) {
 if(!command.pending)return command.message?<div className="space-y-2"><output className="block text-sm">{command.message}</output>{command.invalidReference?<Link href="/help" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Open Help &amp; support</Link>:null}</div>:null;
 return <section className="space-y-3 rounded-xl border bg-secondary/40 p-4" aria-label="Original account action">
  <p className="text-sm font-semibold">Original {actionNames[command.pending.action]}</p>
  <output className="block text-sm">{command.message||'The original action is unconfirmed. Check its saved result before starting another attempt.'}</output>
  <p className="text-xs text-muted-foreground">Request reference: <code className="break-all">{command.pending.requestId}</code></p>
  <div className="flex flex-wrap gap-3">
   <button type="button" disabled={command.busy} onClick={()=>void command.checkOutcome()} className="min-h-11 rounded-lg border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-50">Check saved result</button>
   {command.canRetry?<button type="button" disabled={command.busy} onClick={()=>void command.retry()} className="min-h-11 rounded-lg border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-50">Retry original request</button>:null}
  </div>
 </section>;
}
