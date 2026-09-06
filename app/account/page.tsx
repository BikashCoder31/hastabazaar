import { ProfileForm } from '@/components/account/profile-form';
import { requireCustomerPage } from '@/lib/auth/customer';

export default async function AccountPage() {
  const customer = await requireCustomerPage('/account');
  return (
    <div>
      <p className="eyebrow">Customer account</p>
      <h1 className="mt-2 font-heading text-4xl">Your profile</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Manage the contact details used for future Hastabazaar orders. The
        interface is currently English-only.
      </p>
      <section className="mt-8 rounded-2xl border bg-card p-6">
        <div>
          <h2 className="font-heading text-2xl">Account details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {customer.email}
          </p>
        </div>
        <ProfileForm
          displayName={customer.displayName}
          phone={customer.phone}
        />
      </section>
    </div>
  );
}
