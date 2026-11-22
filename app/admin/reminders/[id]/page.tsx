import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {resolveReminderDestination} from '@/lib/operations/reminder-destination';
export const dynamic='force-dynamic';
export default async function ReminderPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireStaffPage('/admin/reminders/'+encodeURIComponent(id),'account.self.manage');
 const destination=await resolveReminderDestination(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id,'staff');
 if(!destination)notFound();redirect(destination);
}
