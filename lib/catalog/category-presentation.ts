const builtInCategoryImages: Record<string, { src: string; alt: string }> = {
  gifts: {
    src: '/homepage/category-gifts.webp',
    alt: 'Handmade crimson Lokta paper gift box',
  },
  'home-decor': {
    src: '/homepage/category-home-living.webp',
    alt: 'Hand-carved wooden table lamp',
  },
  'jewelry-accessories': {
    src: '/homepage/category-jewellery.webp',
    alt: 'Handmade silver and turquoise earrings',
  },
  'traditional-textiles': {
    src: '/homepage/category-textiles.webp',
    alt: 'Folded crimson and indigo Dhaka textile',
  },
  'art-paintings': {
    src: '/homepage/category-art-decor.webp',
    alt: 'Framed Nepali mountain landscape painting',
  },
  pottery: {
    src: '/homepage/category-pottery.webp',
    alt: 'Hand-thrown engraved terracotta vase',
  },
};

export function categoryImage(category: {
  slug: string;
  nameEn: string;
  imageId?: string | null;
}): { src: string; alt: string } | null {
  if (category.imageId)
    return {
      src: `/api/categories/image/${encodeURIComponent(category.imageId)}`,
      alt: `${category.nameEn} category`,
    };
  return builtInCategoryImages[category.slug] ?? null;
}
