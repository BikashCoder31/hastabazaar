import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
export default async function ProfileCorrectionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;await requireStaffPage(`/admin/seller-profile-corrections/${id}`,'seller.application.review');
 const row=await requireDatabase(env as unknown as {DB?:D1Database}).prepare('SELECT seller_id AS sellerId FROM seller_public_profile_corrections WHERE id=?').bind(id).first<{sellerId:string}>();
 if(!row)notFound();redirect(`/admin/sellers/${encodeURIComponent(row.sellerId)}#public-profile`);
}
