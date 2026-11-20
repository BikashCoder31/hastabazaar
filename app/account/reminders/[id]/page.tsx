import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireCustomerPage} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {resolveReminderDestination} from '@/lib/operations/reminder-destination';
export const dynamic='force-dynamic';
export default async function ReminderPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireCustomerPage('/account/reminders/'+encodeURIComponent(id));
 const destination=await resolveReminderDestination(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,id,'customer');
 if(!destination)notFound();redirect(destination);
}
