import { companyPublicContacts } from '../content/company-details';
import { orderHelpTopics } from '../content/help-topics';
import { additionalSupportTopics } from './additional-topics';
export { supportQuestionGroups } from './additional-topics';

export type SupportTopic = {
  id: string;
  title: string;
  body: string;
  points?: readonly string[];
  keywords: readonly string[];
  links: readonly { label: string; href: string }[];
};

const orderKeywords: Record<string, string[]> = {
  shipping: [
    'shipping',
    'delivery',
    'deliver',
    'courier',
    'postage',
    'डेलिभरी',
    'ढुवानी',
  ],
  tracking: [
    'track',
    'tracking',
    'where is my order',
    'order status',
    'my order',
    'ट्र्याक',
    'अर्डर कहाँ',
    'order kaha cha',
    'order kata cha',
  ],
  returns: [
    'return',
    'returns',
    'refund',
    'refunds',
    'exchange',
    'broken',
    'damaged',
    'defective',
    'wrong item',
    'फिर्ता',
    'बिग्रिएको',
  ],
  complaints: ['complaint', 'complaints', 'grievance', 'गुनासो'],
};

// Short assistant guidance; the linked policies and secure receipt carry full details.
const orderPoints: Record<string, readonly string[]> = {
  shipping: [
    'Review delivery charges and the estimated delivery period at checkout.',
    'An estimate does not confirm coverage. Delivery is available only to the address accepted for your order.',
    'Items from different sellers may arrive separately, with one order total and receipt.',
  ],
  tracking: [
    'Enter your order number and checkout email on Track an order. No sign-in needed.',
    'For full details, cancellations or returns, open your secure receipt or sign in to My orders.',
  ],
  returns: [
    'After delivery, open your secure receipt and choose the affected item.',
    'Eligibility follows the policy saved with your order. Add your reason, preferred resolution, quantity and supporting photos.',
    'Approved cash-on-delivery refunds go through a verified manual process.',
  ],
  complaints: [
    'Open your secure receipt to raise a complaint about an item or the whole order.',
    'Our team can investigate, request details and record a resolution while limiting what customer information a seller sees.',
  ],
};

export const supportTopics: readonly SupportTopic[] = [
  ...orderHelpTopics.map((topic) => ({
    ...topic,
    points: orderPoints[topic.id],
    keywords: orderKeywords[topic.id],
    links:
      topic.id === 'tracking'
        ? [
            { label: 'Track an order', href: '/track' },
            { label: 'My orders', href: '/account/orders' },
          ]
        : topic.id === 'complaints'
          ? [
              { label: 'My orders', href: '/account/orders' },
              { label: 'Contact support', href: '/contact-us' },
            ]
          : [
              {
                label: `Read the ${topic.id === 'shipping' ? 'shipping' : 'return'} policy`,
                href: `/${topic.id}`,
              },
            ],
  })),
  {
    id: 'payments',
    title: 'Payment options',
    body: 'Cash on delivery is available. Use the payment options shown at checkout and review the full total before confirming. Do not send payment PINs, passwords or verification codes in chat.',
    keywords: [
      'payment',
      'payments',
      'pay',
      'cod',
      'cash on delivery',
      'esewa',
      'khalti',
      'भुक्तानी',
      'पैसा',
    ],
    links: [{ label: 'Shopping terms', href: '/terms' }],
  },
  {
    id: 'custom',
    title: 'Materials & custom orders',
    body: 'Have a colour, size or design in mind? Share the product link and your idea with our team before ordering. Check the listing for materials and dimensions; we’ll need to confirm what’s possible and how long it takes.',
    keywords: [
      'custom',
      'customise',
      'customize',
      'customisation',
      'customization',
      'personalised',
      'personalized',
      'material',
      'materials',
      'size',
      'colour',
      'color',
      'हातले',
      'साइज',
    ],
    links: [{ label: 'Browse products', href: '/shop' }],
  },
  {
    id: 'gifts',
    title: 'Find a thoughtful gift',
    body: 'Choose a handmade gift around what they enjoy. Explore jewellery, homeware or an occasion below; check each listing for current prices, materials and availability.',
    keywords: [
      'gift',
      'gifts',
      'gift ideas',
      'suggest',
      'suggestion',
      'suggestions',
      'recommend',
      'recommendation',
      'birthday',
      'wedding',
      'उपहार',
    ],
    links: [
      { label: 'Gifts by occasion', href: '/occasions' },
      { label: 'Explore categories', href: '/categories' },
      { label: 'Browse lower prices first', href: '/shop?sort=price-low' },
    ],
  },
  {
    id: 'jewellery',
    title: 'Jewellery ideas',
    body: 'Explore jewellery and check the material, dimensions and care details on each listing. Start with lower-priced items if you are comparing gifts on a budget.',
    keywords: [
      'jewellery',
      'jewelry',
      'earrings',
      'necklace',
      'bracelet',
      'गहना',
    ],
    links: [
      { label: 'Explore jewellery', href: '/shop?q=jewellery&sort=price-low' },
    ],
  },
  {
    id: 'home',
    title: 'Something for their home',
    body: 'Browse homeware and decorative pieces. Check dimensions, materials and handling instructions before choosing a gift, especially for fragile items.',
    keywords: [
      'homeware',
      'decor',
      'decoration',
      'pottery',
      'ceramic',
      'vase',
      'घर सजावट',
    ],
    links: [
      { label: 'Explore homeware', href: '/shop?q=homeware&sort=price-low' },
      { label: 'Explore pottery', href: '/shop?q=pottery&sort=price-low' },
    ],
  },
  {
    id: 'selling',
    title: 'Start selling on Hastabazaar',
    body: 'Bring your handmade work to Hastabazaar. Explore Sell with us, choose a suitable seller route and complete the application with your business and product details. Our team reviews applications before approving a store.',
    keywords: [
      'sell',
      'seller',
      'selling',
      'become a seller',
      'register shop',
      'join',
      'maker',
      'बिक्रेता',
      'विक्रेता',
      'बेच्ने',
    ],
    links: [{ label: 'Sell with us', href: '/sell' }],
  },
  {
    id: 'fees',
    title: 'Seller fees & commission',
    body: 'Fees depend on your seller route and applicable account terms. Read the terms offered to you, or ask our team to explain the charges before you agree.',
    keywords: [
      'fee',
      'fees',
      'commission',
      'charges for selling',
      'कमिसन',
      'शुल्क',
    ],
    links: [
      { label: 'Seller information', href: '/sell' },
      { label: 'Seller dashboard', href: '/seller' },
    ],
  },
  {
    id: 'payouts',
    title: 'Seller payouts',
    body: 'Sign in to your seller finance page to review the information available for your account and the applicable terms. For a payout problem, contact our team. This assistant cannot see balances, approve a payout or confirm a payment date.',
    keywords: ['payout', 'payouts', 'settlement', 'seller balance'],
    links: [
      { label: 'Seller dashboard', href: '/seller' },
      { label: 'Seller finance', href: '/seller/finance' },
    ],
  },
  {
    id: 'cancellation',
    title: 'Cancel an order',
    body: 'Use your secure order receipt or contact support promptly to request cancellation. The order status and applicable policy determine what can be cancelled. Sending a chat message does not itself cancel an order.',
    keywords: ['cancel', 'cancellation', 'रद्द'],
    links: [
      { label: 'My orders', href: '/account/orders' },
      { label: 'Cancellation policy', href: '/returns' },
    ],
  },
  ...additionalSupportTopics,
];

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();

const commonSpellings = new Map([
  ['delivary', 'delivery'],
  ['delevery', 'delivery'],
  ['shiping', 'shipping'],
]);

export function findSupportAnswers(question: string): SupportTopic[] {
  // Correct a few common spellings without fuzzy-matching unrelated words.
  const query = ` ${normalize(question.slice(0, 300))
    .split(' ')
    .map((word) => commonSpellings.get(word) ?? word)
    .join(' ')} `;
  if (!query.trim()) return [];
  const contains = (keyword: string) =>
    query.includes(` ${normalize(keyword)} `);
  const deliveryQuestion = orderKeywords.shipping.some(contains);
  const sellerQuestion = [
    'seller',
    'selling',
    'commission',
    'कमिसन',
    'विक्रेता',
    'बिक्रेता',
  ].some(contains);
  return supportTopics
    .filter(
      (topic) => topic.id !== 'fees' || !deliveryQuestion || sellerQuestion,
    )
    .map((topic) => ({
      topic,
      score: topic.keywords.reduce((score, keyword) => {
        const normalized = normalize(keyword);
        // Generic context must not outweigh the actual request (e.g. cancel my order).
        const weight = [
          'my order',
          'where is my order',
          'seller',
          'maker',
        ].includes(normalized)
          ? 0.25
          : normalized.split(' ').length;
        return contains(normalized) ? score + weight : score;
      }, 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ topic }) => topic);
}

export function whatsappSupportHref(
  topic = 'a question',
  pathname = '',
): string {
  const publicPath = pathname.split(/[?#]/)[0];
  const product = /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(publicPath)
    ? `\nProduct: https://hastabazaar.com${publicPath}`
    : '';
  return `${companyPublicContacts.whatsappUrl}?text=${encodeURIComponent(`Namaste Hastabazaar! I need help with ${topic}.${product}`)}`;
}

export function supportWidgetVisible(pathname: string): boolean {
  return (
    !/^\/(admin|seller|rider|account|orders|auth|checkout|local-testing|security|api|login|register|forgot-password|recover-account|form-submissions)(\/|$)/.test(
      pathname,
    ) && !/^\/sell\/(apply|application)(\/|$)/.test(pathname)
  );
}
