export type FeaturedProduct = {
  slug: string;
  name: string;
  price: string;
  pricePaisa?: number;
  compareAtPricePaisa?: number | null;
  category: string;
  categorySlug?: string;
  image: string;
  imageAlt: string;
  tradingName?: string;
  label?: 'Offer' | 'New' | 'Popular' | 'Featured';
};
