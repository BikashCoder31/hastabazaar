import Link from 'next/link';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
import {NextReviewTask} from './next-review-task';

export function ReviewBackLink({returnTo,fallback='/admin',actorId}:{returnTo:unknown;fallback?:string;actorId?:string}){
 const context=safeAdminReturnTo(returnTo,fallback);
 return <div className="flex flex-wrap items-center gap-4"><Link href={context} scroll={false} className="section-link inline-flex min-h-11 items-center">Back to results</Link>{actorId&&new URL(context,'http://localhost').hash.startsWith('#review-task-')?<NextReviewTask actorId={actorId} returnTo={context}/>:null}</div>;
}
