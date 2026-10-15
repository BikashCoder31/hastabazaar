import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireCustomerPage} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {listFormAnswersForSubjectPage} from '@/lib/db/repositories/form-answers';
import {authorizeFormAnswerRead} from '@/lib/forms/access';
import {AnswerDetails} from '@/components/forms/answer-details';

export const dynamic='force-dynamic';
export default async function TransitionHistory({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{beforeAt?:string;beforeId?:string;auditAt?:string;auditId?:string}>}) {
  const {id}=await params;const customer=await requireCustomerPage(`/sell/application/transitions/${encodeURIComponent(id)}`);const db=requireDatabase(env as unknown as {DB?:D1Database});
  if(id.length>191||!await db.prepare(`SELECT 1 FROM seller_route_transition_applications t JOIN seller_profiles s ON s.id=t.seller_id WHERE t.id=? AND s.user_id=?`).bind(id,customer.userId).first())notFound();
  const query=await searchParams;
  function cursor(at?:string,key?:string){if(!at&&!key)return undefined;const createdAt=Number(at);if(!at||!key||!/^\d+$/.test(at)||!Number.isSafeInteger(createdAt)||key.length>191)notFound();return {createdAt,id:key};}
  const answerCursor=cursor(query?.beforeAt,query?.beforeId);const auditCursor=cursor(query?.auditAt,query?.auditId);
  const answers=await listFormAnswersForSubjectPage(db,{subjectType:'seller_route_transition',subjectId:id,formId:'seller.managed-transition-request',after:answerCursor});
  if((await Promise.all(answers.answers.map(answer=>authorizeFormAnswerRead(db,{id:customer.userId,role:'customer'},answer)))).some(allowed=>!allowed))notFound();
  const audits=await db.prepare(`SELECT id,created_at AS createdAt,next_json AS json FROM audit_logs WHERE subject_type='seller_route_transition'
    AND subject_id=? AND actor_id=? AND action IN ('seller.route_transition.requested','seller.route_transition.resubmitted')
    ${auditCursor?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 51`)
    .bind(id,customer.userId,...(auditCursor?[auditCursor.createdAt,auditCursor.createdAt,auditCursor.id]:[])).all<{id:string;createdAt:number;json:string}>();
  const base=`/sell/application/transitions/${encodeURIComponent(id)}`;
  const link=(kind:'answer'|'audit',next:{id:string;createdAt:number})=>{const values=new URLSearchParams();if(query?.beforeAt&&query.beforeId){values.set('beforeAt',query.beforeAt);values.set('beforeId',query.beforeId);}if(query?.auditAt&&query.auditId){values.set('auditAt',query.auditAt);values.set('auditId',query.auditId);}values.set(kind==='answer'?'beforeAt':'auditAt',String(next.createdAt));values.set(kind==='answer'?'beforeId':'auditId',next.id);return `${base}?${values}`;};
  return <main className="shell min-w-0 space-y-6 py-10"><Link href="/sell/application#registered-transition" className="section-link">Back to application progress</Link>
    <h1 className="section-title">Your registration request history</h1><p>Original accepted agreements and saved review answers. A later correction keeps earlier records.</p>
    <section className="space-y-4"><h2 className="font-heading text-2xl">Accepted agreements</h2><p className="text-sm text-muted-foreground">Up to 50 submissions per page.</p>
      {audits.results.slice(0,50).map(row=>{
        let terms:Record<string,unknown>|null=null;try{const parsed=JSON.parse(row.json);if(parsed.registeredTerms&&typeof parsed.registeredTerms==='object')terms=parsed.registeredTerms;}catch{/* Historical malformed evidence remains unavailable. */}
        return <article key={row.id} className="rounded-xl border p-4"><p>{new Date(row.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Kathmandu'})} Nepal time</p>
          {terms&&typeof terms.document==='string'?<details className="mt-2"><summary className="cursor-pointer font-medium">Recorded English seller agreement · {typeof terms.commissionBps==='number'?`${terms.commissionBps/100}% commission`:'See original terms'}</summary><p className="mt-2 break-all text-xs">{typeof terms.agreementVersion==='string'?terms.agreementVersion:''}</p><div className="mt-3 whitespace-pre-wrap text-sm">{terms.document}</div></details>:<p>The original agreement needs review.</p>}</article>;
      })}
      {!audits.results.length?<p>No accepted agreement history on this page.</p>:null}
      {audits.results.length>50?<Link className="section-link" href={link('audit',audits.results[49])}>Older accepted agreements</Link>:null}
    </section>
    <section className="space-y-4"><h2 className="font-heading text-2xl">Saved form answers</h2>{answers.answers.map(answer=><AnswerDetails key={answer.id} answer={answer}/>)}{!answers.answers.length?<p>No saved form answers on this page.</p>:null}{answers.nextCursor?<Link className="section-link" href={link('answer',answers.nextCursor)}>Older form answers</Link>:null}</section>
  </main>;
}
