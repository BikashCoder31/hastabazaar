'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { NotificationRow } from '@/lib/db/repositories/operations';
import type { NotificationAudience } from '@/lib/operations/notification-links';
import { NotificationList } from './notification-list';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {NOTIFICATION_READ_EVENT,NOTIFICATION_ACCESS_EVENT,CUSTOMER_ACCOUNT_ACCESS_EVENT,matchingNotificationScope,matchingCustomerAccountDenial,notificationAccessDenied} from '@/lib/operations/notification-client-events';

interface NotificationBellProps{workspace:NotificationAudience;accountId:string;}
export function NotificationBell(props:NotificationBellProps){return <ScopedNotificationBell key={JSON.stringify([props.accountId,props.workspace])} {...props}/>;}
function ScopedNotificationBell({ workspace, accountId }: NotificationBellProps) {
  const [open, setOpen] = useState(false), [filter, setFilter] = useState<'all'|'unread'>('all');
  const [snapshot, setSnapshot] = useState<{ accountId: string; items: NotificationRow[]; unreadCount: number } | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [accessDenied,setAccessDenied]=useState(false);
  const request = useRef<AbortController | null>(null), button = useRef<HTMLButtonElement>(null), container = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const refresh = useCallback(() => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    return fetch(`/api/notifications?audience=${workspace}&filter=${filter}`, { cache: 'no-store', signal: controller.signal,headers:{[ACTOR_INTENT_HEADER]:accountId} }).then(async response => {
      if([401,403].includes(response.status)){if(!controller.signal.aborted){setSnapshot(null);setAccessDenied(true);notificationAccessDenied({accountId,workspace});}return;}
      if (!response.ok) throw new Error('Notifications could not be loaded.');
      const data = await response.json() as { items: NotificationRow[]; unreadCount: number };
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0) throw new Error('Notifications could not be loaded.');
      if (!controller.signal.aborted) setSnapshot({ ...data, accountId });
    }).catch(() => { if (!controller.signal.aborted)setError('Notifications could not be loaded. Your work remains open.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [workspace, accountId, filter]);
  useEffect(() => {
    void refresh(); const reload = () => { if (document.visibilityState === 'visible') {setLoading(true);setError('');void refresh();} };
    const receive=(event:Event)=>{if(matchingNotificationScope(event,{accountId,workspace}))reload();};
    const deny=(event:Event)=>{if(matchingNotificationScope(event,{accountId,workspace})||matchingCustomerAccountDenial(event,{accountId,workspace})){request.current?.abort();setAccessDenied(true);setSnapshot(null);setError('');setLoading(false);}};
    window.addEventListener('focus', reload); window.addEventListener(NOTIFICATION_READ_EVENT, receive);window.addEventListener(NOTIFICATION_ACCESS_EVENT,deny);window.addEventListener(CUSTOMER_ACCOUNT_ACCESS_EVENT,deny);
    return () => { request.current?.abort(); window.removeEventListener('focus', reload); window.removeEventListener(NOTIFICATION_READ_EVENT,receive);window.removeEventListener(NOTIFICATION_ACCESS_EVENT,deny);window.removeEventListener(CUSTOMER_ACCOUNT_ACCESS_EVENT,deny); };
  }, [refresh,accountId,workspace]);
  useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&container.current?.contains(event.target as Node)){event.preventDefault();setOpen(false);button.current?.focus();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open]);
  const current = !accessDenied&&snapshot?.accountId === accountId ? snapshot : null;
  const count = current?.unreadCount;
  const close = () => { setOpen(false); button.current?.focus(); };
  return <div ref={container} className="relative">
    <button ref={button} type="button" className="header-action" aria-expanded={open} aria-controls={panelId}
      aria-label={count === undefined ? 'Notifications: loading or unavailable' : `Notifications: ${count} unread`}
      onClick={() => { if (!open) {setLoading(true);setError('');void refresh();} setOpen(value => !value); }}>
      <Bell aria-hidden="true" className="size-5" />{count ? <span>{count > 99 ? '99+' : count}</span> : null}
    </button>
    {open ? <section id={panelId} aria-label="Recent notifications" className="fixed inset-x-3 top-24 z-50 max-h-[75dvh] space-y-4 overflow-y-auto rounded-xl border bg-card p-4 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-96">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Notifications</h2><button type="button" className="underline" onClick={close}>Close</button></div>
      <div className="flex gap-4" aria-label="Notification filter">{(['all','unread'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} className="underline" onClick={() => {setLoading(true);setError('');setFilter(value);if(value===filter)void refresh();}}>{value === 'all' ? 'All' : 'Unread'}</button>)}</div>
      {loading ? <output className="block">Loading current notifications…</output> : null}
      {accessDenied?<div role="alert"><p>Your signed-in account changed or notification access changed.</p><button type="button" className="underline" onClick={()=>window.location.reload()}>Refresh workspace</button></div>:null}
      {error ? <div role="alert"><p>{error}</p><button type="button" className="underline" onClick={() => {setLoading(true);setError('');void refresh();}}>Retry</button></div> : null}
      {!accessDenied&&!loading && !error && current ? <NotificationList workspace={workspace} accountId={accountId} initial={current.items} /> : null}
      <Link className="section-link" href={workspace === 'staff' ? '/admin/notifications' : workspace === 'seller' ? '/seller/notifications' : '/account/notifications'}>View all notifications →</Link>
    </section> : null}
  </div>;
}
