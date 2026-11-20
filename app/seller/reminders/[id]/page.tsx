import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {resolveReminderDestination} from '@/lib/operations/reminder-destination';
export const dynamic='force-dynamic';
export default async function ReminderPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireSellerCenterPage('/seller/reminders/'+encodeURIComponent(id));if(!actor)notFound();
 const destination=await resolveReminderDestination(requireDatabase(env as unknown as {DB?:D1Database}),actor.userId,id,'seller');
 if(!destination)notFound();redirect(destination);
}
