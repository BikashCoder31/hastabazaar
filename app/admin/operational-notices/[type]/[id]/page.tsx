import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireDatabase} from '@/lib/db/d1';
import {requireStaffPage} from '@/lib/auth/staff';
import {resolveGovernanceNoticeDestination} from '@/lib/operations/governance-notice-destination';
export const dynamic='force-dynamic';
export default async function OperationalNoticePage({params}:{params:Promise<{type:string;id:string}>}){
 const {type,id}=await params;
 const actor=await requireStaffPage('/admin/operational-notices/'+encodeURIComponent(type)+'/'+encodeURIComponent(id),'account.self.manage');
 const destination=await resolveGovernanceNoticeDestination(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,type,id);
 if(!destination)notFound();
 redirect(destination);
}
