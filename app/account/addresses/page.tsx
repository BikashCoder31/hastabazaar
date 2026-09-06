import { env } from 'cloudflare:workers';

import { AddressManager } from '@/components/account/address-manager';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses } from '@/lib/db/repositories/customers';

export default async function AddressesPage() {
  const customer = await requireCustomerPage('/account/addresses');
  const addresses = await listCustomerAddresses(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId);
  return <AddressManager addresses={addresses} />;
}
