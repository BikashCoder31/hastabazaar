import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import {readSellerWorkspaceTasks,type SellerWorkspaceTasks} from '@/lib/seller/workspace-tasks';
import {SellerWorkspaceTaskList} from '@/components/seller/workspace-task-list';

export const dynamic = 'force-dynamic';
export default async function SellerRequestsPage({searchParams}:{searchParams?:Promise<{cursor?:string;view?:string}>}) {
  const viewer = await requireSellerCenterPage('/seller/requests');
  const query=await searchParams;let model:SellerWorkspaceTasks|null=null, unavailable = false;
  try { model = await readSellerWorkspaceTasks(requireDatabase(env as unknown as { DB?: D1Database }), viewer.userId,{limit:20,cursor:query?.cursor,view:query?.view==='active'?'active':'all'}); }
  catch { unavailable = true; }
  return <div className="space-y-7"><header><p className="eyebrow">Seller Center</p><h1 className="section-title">Requests &amp; help</h1></header>
    <nav className="flex gap-5" aria-label="Request views"><Link href="/seller/requests?view=active" className="section-link text-[#A8232E] underline">Current work</Link><Link href="/seller/requests?view=all" className="section-link text-[#A8232E] underline">All records</Link></nav>
    <SellerWorkspaceTaskList model={model} unavailable={unavailable} />
    <nav className="flex flex-wrap gap-5" aria-label="Request resources">
      <Link className="section-link text-[#A8232E] underline" href="/seller/notifications">Notification inbox</Link>
      {viewer.sellerId ? <Link className="section-link text-[#A8232E] underline" href="/sell/application" prefetch={false}>Application and agreement history</Link> : null}
      <Link className="section-link text-[#A8232E] underline" href="/help#seller-guide">Written seller guide and contact</Link>
    </nav>
  </div>;
}
