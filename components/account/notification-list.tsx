'use client';
import Link from 'next/link';
import { notificationDestination, type NotificationAudience } from '@/lib/operations/notification-links';
import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {HttpResponseError} from '@/lib/http/client-request';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {NOTIFICATION_READ_EVENT,NOTIFICATION_ACCESS_EVENT,CUSTOMER_ACCOUNT_ACCESS_EVENT,matchingNotificationScope,matchingCustomerAccountDenial,notificationAccessDenied} from '@/lib/operations/notification-client-events';
import type { NotificationRow } from '@/lib/db/repositories/operations';

interface NotificationListProps{initial:readonly NotificationRow[];workspace:NotificationAudience;accountId:string;}
export function NotificationList(props:NotificationListProps){return <ScopedNotificationList key={JSON.stringify([props.accountId,props.workspace,props.initial.map(item=>item.id)])} {...props}/>;}
function ScopedNotificationList({
  initial,
  workspace,
  accountId,
}: NotificationListProps) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [accessDenied,setAccessDenied]=useState(false),mounted=useRef(true),inFlight=useRef(false);
  useEffect(() => {
    mounted.current=true;
    const receive = (event: Event) => {
      const id = matchingNotificationScope(event,{accountId,workspace})?.id;
      if (typeof id === 'string') setReadIds(current => new Set([...current, id]));
    };
    const deny=(event:Event)=>{if(matchingNotificationScope(event,{accountId,workspace})||matchingCustomerAccountDenial(event,{accountId,workspace})){setAccessDenied(true);setError('');}};
    window.addEventListener(NOTIFICATION_READ_EVENT, receive);window.addEventListener(NOTIFICATION_ACCESS_EVENT,deny);window.addEventListener(CUSTOMER_ACCOUNT_ACCESS_EVENT,deny);
    return () => {mounted.current=false;window.removeEventListener(NOTIFICATION_READ_EVENT,receive);window.removeEventListener(NOTIFICATION_ACCESS_EVENT,deny);window.removeEventListener(CUSTOMER_ACCOUNT_ACCESS_EVENT,deny);};
  }, [accountId,workspace]);
  async function markRead(id: string) {
    if (inFlight.current||accessDenied) return;
    inFlight.current=true;
    setError('');
    setBusy(id);
    try {
      const response=await fetch((workspace==='staff'?'/api/admin/notifications/':'/api/notifications/')+encodeURIComponent(id)+'/read',{method:'POST',headers:{[ACTOR_INTENT_HEADER]:accountId}});
      const result=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;
      if(!response.ok)throw new HttpResponseError(result?.error??'Notification could not be updated.',response.status);
      if(result?.ok!==true)throw new Error('Notification update was not confirmed. Retry this same notification.');
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { id,accountId,workspace } }));
      if(!mounted.current)return;
      setReadIds((current) => new Set([...current, id]));
    } catch (reason) {
      if(!mounted.current)return;
      if(reason instanceof HttpResponseError&&[401,403].includes(reason.status)){notificationAccessDenied({accountId,workspace});return;}
      setError(
        reason instanceof Error
          ? reason.message
          : 'Notification could not be updated.',
      );
    } finally {
      if(mounted.current){inFlight.current=false;setBusy(null);}
    }
  }
  if(accessDenied)return <div role="alert" className="rounded-xl border p-4"><p>Your signed-in account changed or notification access changed.</p><button type="button" className="mt-2 underline" onClick={()=>window.location.reload()}>Refresh workspace</button></div>;
  if (initial.length === 0)
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <Bell className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 font-heading text-2xl">You’re all caught up.</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Your updates will appear here when there’s something new.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {initial.filter(item => item.channel === 'in_app' && item.audienceRole === workspace).map((item) => {
        const href = notificationDestination(workspace, item.audienceRole, item.relatedType, item.relatedId, {orderNumber:item.orderNumber,productStatus:item.productStatus,requiredPermission:item.requiredPermission});
        const read = Boolean(item.readAt) || readIds.has(item.id);
        return (
          <article
            key={item.id}
            className={
              'rounded-2xl border bg-card p-5 sm:p-6 ' +
              (read ? '' : 'border-primary/35')
            }
          >
            <div className="flex items-start gap-3">
              <span
                className={
                  'flex size-10 shrink-0 items-center justify-center rounded-xl ' +
                  (read
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-secondary text-primary')
                }
              >
                <Bell className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{item.subjectEn}</h2>
                  {href ? <Link className="mt-3 inline-block underline underline-offset-4" href={href} onClick={() => { if (!read) void markRead(item.id); }}>Open related {item.relatedType === 'order' && workspace === 'customer' ? 'orders' : 'record'}</Link> : null}
                {!read && item.channel === 'in_app' ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
                      Unread
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-muted-foreground">
                  {item.bodyEn}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}
                  {item.channel !== 'in_app'
                    ? ' · ' + item.channel.toUpperCase() + ' · ' + item.status
                    : ''}
                </p>
                {!read && item.channel === 'in_app' ? (
                  <Button
                    variant="outline"
                    className="mt-4 min-h-10 rounded-full"
                    disabled={busy !== null}
                    onClick={() => void markRead(item.id)}
                  >
                    <Check />
                    {busy === item.id ? 'Updating…' : 'Mark as read'}
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
