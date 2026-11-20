import { RegistrationGuide } from '@/components/seller/registration-guide';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { requireAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { loadSellerApplicationTerms } from '@/lib/sellers/application-terms';
export const dynamic='force-dynamic';
export const metadata={title:'Seller registration',robots:{index:false,follow:false}};
export default async function SellerRegistrationPage() {
  const identity=await requireAuthenticatedUser('/sell/apply');
  const database=requireDatabase(env as unknown as {DB?: D1Database});
  const owner=await getSellerCenterAccess(database,identity.userId);
  if (!owner) redirect('/sell');
  if (owner.sellerId) redirect('/seller/registration');
  const clock=await database.prepare("SELECT unixepoch('now') * 1000 AS now").first<{now:number}>();
  const now=Number(clock?.now ?? 0);
  const {managed,registered}=await loadSellerApplicationTerms(database,now);
  return <div className="min-h-screen bg-background text-foreground">
    <SiteHeader />
    <main id="main-content" className="shell py-12">
      <Link href="/sell" className="text-sm font-semibold text-primary">← Sell with us</Link>
      <h1 className="mt-4 font-heading text-4xl">Seller registration</h1>
      <p className="my-6 max-w-2xl text-muted-foreground">Submit the details you have now. Add missing information and prepare product listings from your dashboard while your application awaits review.</p>
      <div className="mb-6 max-w-3xl"><RegistrationGuide /></div>
      <SellerRegistrationIntakeForm accountId={owner.userId} accountEmail={identity.email} managedTerms={managed.status==='ready'?managed.terms:undefined} registeredTerms={registered.status==='ready'?{percent:registered.terms.percent,context:registered.terms.context}:undefined} />
    </main><SiteFooter compact />
  </div>;
}
