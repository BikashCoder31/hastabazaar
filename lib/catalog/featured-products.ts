export type FeaturedProduct = {
  slug: string;
  name: string;
  price: string;
  category: string;
  image: string;
  imageAlt: string;
};

export const featuredProducts: FeaturedProduct[] = [
  {
    slug: 'handmade-macrame-crossbody-bag',
    name: 'Handmade Macramé Crossbody Bag',
    price: '999',
    category: 'Accessories',
    image: '/catalog/macrame-crossbody.jpg',
    imageAlt: 'Cream handmade macramé crossbody bag',
  },
  {
    slug: 'macrame-wall-hanging-shelf',
    name: 'Macramé Wall Hanging Shelf',
    price: '799',
    category: 'Home décor',
    image: '/catalog/macrame-shelf.jpg',
    imageAlt: 'Macramé wall hanging shelf with a wooden base',
  },
  {
    slug: 'embroidered-mirror-work-clutch',
    name: 'Embroidered Mirror-work Clutch',
    price: '799',
    category: 'Textiles',
    image: '/catalog/embroidered-clutch.jpg',
    imageAlt: 'Colourful embroidered clutch with mirror work',
  },
  {
    slug: 'handwoven-straw-tote',
    name: 'Handwoven Straw Tote',
    price: '2,499',
    category: 'Bags',
    image: '/catalog/straw-tote.jpg',
    imageAlt: 'Natural handwoven straw tote bag',
  },
];
