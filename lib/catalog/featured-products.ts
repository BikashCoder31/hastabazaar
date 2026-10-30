import type { PublicSellingIdentity } from '../products/selling-identity';
export type FeaturedProduct = Partial<PublicSellingIdentity> & {
  slug: string;
  name: string;
  price: string;
  pricePaisa?: number;
  purchasable?: boolean;
  compareAtPricePaisa?: number | null;
  category: string;
  categorySlug?: string;
  image: string;
  imageAlt: string;
  tradingName?: string;
  label?: 'Offer' | 'New' | 'Popular' | 'Featured';
};
