import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {protectedChangeWorkspace} from '@/lib/sellers/protected-change-workspace';
import {ProtectedChangeError} from '@/lib/sellers/protected-change-policy';
import {ProtectedChangeReviewWorkspace} from '@/components/admin/protected-change-review-workspace';
export const dynamic='force-dynamic';
export default async function StaffProtectedChangePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,staff=await requireStaffPage(`/admin/seller-protected-changes/${id}`,'seller.application.review');if(staff.role!=='super_admin')redirect('/staff-access-denied');
 const workspace=await protectedChangeWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),id,staff.id,'staff').catch(error=>{if(error instanceof ProtectedChangeError&&error.status===404)notFound();throw error;});
 return <ProtectedChangeReviewWorkspace workspace={workspace} actorId={staff.id}/>;
}
