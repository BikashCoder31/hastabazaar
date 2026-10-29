import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SellerRegistrationIntakeForm } from '@/components/seller/seller-registration-intake-form';
import { SellerRegistrationVideo } from '@/components/seller/seller-registration-video';
import { requireSellerTermsPage } from '@/lib/auth/seller-commercial-access';
import { requireDatabase } from '@/lib/db/d1';
import { loadSellerApplicationTerms } from '@/lib/sellers/application-terms';
export const dynamic='force-dynamic';
export const metadata={title:'Seller registration',robots:{index:false,follow:false}};
export default async function SellerRegistrationPage() {
  const {identity,userId}=await requireSellerTermsPage('/sell/apply');
  const database=requireDatabase(env as unknown as {DB?: D1Database});
  const clock=await database.prepare("SELECT unixepoch('now') * 1000 AS now").first<{now:number}>();
  const now=Number(clock?.now ?? 0);
  const {managed,registered}=await loadSellerApplicationTerms(database,now);
  return <div className="min-h-screen bg-background text-foreground">
    <SiteHeader />
    <main id="main-content" className="shell py-12">
      <Link href="/sell" className="text-sm font-semibold text-primary">← Sell with us</Link>
      <h1 className="mt-4 font-heading text-4xl">Seller registration</h1>
      <p className="my-6 max-w-2xl text-muted-foreground">Submit the details you have now. Add missing information and prepare product listings from your dashboard while your application awaits review.</p>
      <div className="mb-6 max-w-3xl"><SellerRegistrationVideo /></div>
      <SellerRegistrationIntakeForm accountId={userId} accountEmail={identity.email} managedTerms={managed.status==='ready'?managed.terms:undefined} registeredTerms={registered.status==='ready'?{percent:registered.terms.percent,context:registered.terms.context}:undefined} />
    </main><SiteFooter compact />
  </div>;
}
