import { env } from 'cloudflare:workers';
import { Heart } from 'lucide-react';
import { AccountEmpty, AccountHeading } from '@/components/account/account-ui';
import { SavedProductGrid } from '@/components/account/saved-product-grid';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listWishlist } from '@/lib/db/repositories/customers';

export default async function WishlistPage() {
  const customer = await requireCustomerPage('/account/wishlist');
  const items = await listWishlist(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
  );
  return (
    <div>
      <AccountHeading
        eyebrow="Your account"
        title="Saved items"
        description="Find the items you saved. Prices and availability may change."
      />
      {items.length ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {items.length} saved {items.length === 1 ? 'piece' : 'pieces'}
          </p>
          <SavedProductGrid items={items} />
        </>
      ) : (
        <AccountEmpty
          icon={Heart}
          title="A place for your favourites."
          description="Tap the heart on a product to save it here for another day."
          href="/shop"
          action="Find something you love"
        />
      )}
    </div>
  );
}
