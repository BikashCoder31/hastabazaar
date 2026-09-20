import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {RecordedProgressSection} from '@/components/admin/recorded-progress';
export const dynamic='force-dynamic';
export default async function StaffProgressPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const staff=await requireStaffPage('/admin/progress','audit_log.view');const params=await searchParams;const filters=Object.fromEntries(['from','to','action','actor','type'].map(key=>[key,typeof params[key]==='string'?params[key]:undefined]));
 return <div className="space-y-5"><h1 className="font-heading text-4xl">Recorded work progress</h1><p className="text-muted-foreground">Admins see only their own recorded actions for work they currently have permission to review. Current work queues remain in the operations overview.</p><RecordedProgressSection db={requireDatabase(env as unknown as {DB?:D1Database})} staff={staff} filters={filters} form/></div>;
}
