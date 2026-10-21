import { getManualDeliveryQuote } from '../checkout/validation';
import { phaseOneMarketplacePolicy } from '../marketplace/policy';
import { companyDetails } from './company-details';

type Section = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  links?: readonly { label: string; href: string }[];
};
export type PublicPage = {
  title: string;
  description: string;
  intro: string;
  sections: readonly Section[];
};
const returns = phaseOneMarketplacePolicy.value.returns;
const rate = (district: string) => {
  const quote = getManualDeliveryQuote(district);
  return `estimated ${quote.estimatedMinDays}–${quote.estimatedMaxDays} days in transit. Select your district on a product or at checkout for the current delivery charge`;
};

export const publicPages = {
  about: {
    title: 'About HastaBazaar',
    description:
      'Meet HastaBazaar, a marketplace for gifts and everyday finds from independent sellers.',
    intro:
      'Thoughtful finds. Product details to help you choose.',
    sections: [
      {
        id: 'marketplace',
        title: 'A place for sellers and thoughtful finds',
        paragraphs: [
          'HastaBazaar connects customers with independent sellers offering gifts, homeware, jewellery and everyday finds. Browse the collection and read each listing for who sells it, where it comes from and how it was made.',
          'We operate as a marketplace. Each product identifies its seller, who prepares the item. HastaBazaar provides the shopping experience and coordinates order support, delivery, returns and complaints.',
        ],
        links: [{ label: 'Explore the collection', href: '/shop' }],
      },
      {
        id: 'details',
        title: 'Know what you are buying',
        paragraphs: [
          'Product pages show the seller, price, availability, materials and applicable preparation and return information. Handmade items can have individual characteristics; read the listing and its conditions before ordering.',
          'Seller applications and product listings pass through our review process. Customer reviews are tied to delivered purchases, and reviews, photos and seller replies are moderated before publication. Review does not replace the product information or your right to report a problem.',
        ],
      },
      {
        id: 'nepal',
        title: 'Shopping across Nepal',
        paragraphs: [
          'Prices are shown in Nepalese rupees. Enter your delivery district to see the applicable charge and an estimate that includes preparation. An estimate does not confirm delivery availability at your address; delivery is available only to an address accepted for your order. Checkout shows the full delivery charge and order total before you confirm. Cash on delivery is available.',
        ],
        links: [
          { label: 'How delivery works', href: '/shipping' },
          { label: 'Returns and refunds', href: '/returns' },
        ],
      },
      {
        id: 'makers',
        title: 'Bring your work to the marketplace',
        paragraphs: [
          'Makers and sellers can apply through our seller application process. Tell us about your work and provide the requested business information for review.',
        ],
        links: [
          { label: 'Apply to sell', href: '/sell' },
          { label: 'Contact and support', href: '/contact' },
        ],
      },
    ],
  },
  contact: {
    title: 'Contact & support',
    description:
      'Find the right route for order help, returns, complaints and privacy requests.',
    intro:
      'Start with the order or account you need help with so your request reaches the right place.',
    sections: [
      {
        id: 'email',
        title: 'Email HastaBazaar support',
        paragraphs: [
          `For general questions, help accessing an order or a privacy enquiry, email ${companyDetails.supportEmail}. If your question concerns an order, include its order number and a clear description of the issue.`,
          'Please do not email passwords, one-time codes or private receipt links. We may ask you to verify order ownership before sharing private details.',
        ],
        links: [
          {
            label: companyDetails.supportEmail,
            href: `mailto:${companyDetails.supportEmail}`,
          },
        ],
      },
      {
        id: 'orders',
        title: 'Help with an existing order',
        paragraphs: [
          'Sign in to My orders and open the affected order to view its details and available support actions. Guest customers can use the secure receipt from checkout. Keep that receipt private.',
          'For delivery progress, use Track an order with your order number and checkout email. Tracking shows recorded progress; it does not give access to private order actions.',
        ],
        links: [
          { label: 'Open My orders', href: '/account/orders' },
          { label: 'Track an order', href: '/track' },
        ],
      },
      {
        id: 'returns',
        title: 'Returns, refunds and complaints',
        paragraphs: [
          'Use your order’s support actions to select the affected item, explain what happened and request a return, replacement or complaint review. Include the order number and clear details; photos can help but are optional.',
          'Do not share passwords, one-time codes, payment credentials or private receipt links in review text or other public content.',
        ],
        links: [
          { label: 'Read the return policy', href: '/returns' },
          { label: 'Help with complaints', href: '/help#complaints' },
        ],
      },
      {
        id: 'privacy',
        title: 'Account and privacy requests',
        paragraphs: [
          'Signed-in customers can request access, correction, deletion of eligible data or a review of retention through their account. Requests are reviewed; submitting one does not immediately delete your account or order records.',
        ],
        links: [
          { label: 'Make a privacy request', href: '/account/privacy' },
          { label: 'Read the privacy policy', href: '/privacy' },
        ],
      },
      {
        id: 'shopping',
        title: 'Before you order',
        paragraphs: [
          'Check the product listing for preparation, materials, delivery estimates and item-specific return conditions. The pages below explain how shopping on HastaBazaar works.',
        ],
        links: [
          { label: 'Shipping information', href: '/shipping' },
          { label: 'Terms and conditions', href: '/terms' },
          { label: 'Help centre', href: '/help' },
        ],
      },
    ],
  },
  shipping: {
    title: 'Shipping & delivery',
    description:
      'Delivery charges, preparation times and order tracking for deliveries within Nepal.',
    intro:
      'Know the delivery charge and allow time for your maker to prepare your order.',
    sections: [
      {
        id: 'coverage',
        title: 'Delivery within Nepal',
        paragraphs: [
          'We arrange delivery within Nepal to addresses accepted for your order. A district estimate does not confirm delivery availability at your address. Enter your full delivery district in English on the product page or at checkout. Checkout also collects your municipality, locality and recipient contact details. International delivery is not offered.',
        ],
      },
      {
        id: 'charges',
        title: 'Current delivery charges',
        paragraphs: [
          `Kathmandu, Lalitpur and Bhaktapur: ${rate('Kathmandu')}.`,
          `Configured Terai delivery districts, including Dhanusha: ${rate('Dhanusha')}.`,
          `Other Nepal districts: ${rate('Dolpa')}.`,
          'The product calculator shows the current one-store district base rate. Multiple products from the same store share that fee; each additional store adds 50% of the base. Checkout saves the applied pricing policy and amount. This is not a live courier quote. Any Platform service fee is shown separately at checkout, once per order. It is non-refundable except where required by law. Orders keep their saved fee and terms when settings change.',
        ],
      },
      {
        id: 'preparation',
        title: 'Preparation is part of your estimate',
        paragraphs: [
          'Transit times above start after preparation. Product estimates add the listed preparation time to the transit range. Made-to-order items may need more time before dispatch.',
          'The checkout estimate uses the longest preparation time among your items. Sellers can prepare items in parallel and send them separately. Different parts of one order may arrive at different times.',
          'All arrival ranges are estimates, not guaranteed dates. Weather, road access, holidays and delivery arrangements can affect arrival. Use your order’s recorded updates to follow progress.',
        ],
      },
      {
        id: 'receiving',
        title: 'Receiving and tracking your order',
        paragraphs: [
          'Provide an accurate address and a reachable recipient phone number. Pay the cash amount shown on your order when it arrives. Promotional shopping credit applies to products; delivery remains payable in cash.',
          'If delivery is delayed, unsuccessful or damaged, open the order for support. Do not send a return to a seller or courier without confirmed return instructions.',
        ],
        links: [
          { label: 'Track an order', href: '/track' },
          { label: 'Get order help', href: '/contact' },
          { label: 'Returns and refunds', href: '/returns' },
        ],
      },
    ],
  },
  returns: {
    title: 'Returns & refunds',
    description:
      'Item eligibility, return windows, problem-item claims and the refund process.',
    intro:
      'Check the item’s conditions before buying. If something goes wrong, request help through your order.',
    sections: [
      {
        id: 'eligibility',
        title: 'Eligibility and return window',
        paragraphs: [
          `For items eligible for change-of-mind returns, request a return within ${returns.generalRequestWindowDays} days after delivery. The product page states whether the item is eligible and shows its applicable conditions and exclusions.`,
          'A product marked non-returnable is excluded from change-of-mind returns. Do not assume that all handmade, customised or sale items have the same conditions: read the specific listing.',
          'The policy and eligibility saved with your order govern that order. Later changes to a listing or this page do not replace its saved terms.',
        ],
      },
      {
        id: 'problems',
        title: 'Wrong, damaged or defective items',
        paragraphs: [
          'Wrong, damaged, defective, counterfeit, materially misdescribed or unreasonably late goods can still be reviewed even where change-of-mind returns are excluded. Nothing here removes applicable consumer rights.',
          `Report visible damage within ${returns.deliveryDamageEvidenceWindowHours} hours where possible. Later damage reports receive manual review rather than automatic rejection. Supporting photos are optional; missing photos alone do not defeat a problem-item claim.`,
        ],
      },
      {
        id: 'request',
        title: 'How to request a return',
        paragraphs: [
          'After delivery, open the secure receipt or My orders, select the affected item and quantity, choose a reason and preferred refund or replacement, and explain the issue. You may attach supporting evidence.',
          'HastaBazaar reviews the request and may ask for more information. A request is not an automatic refund approval. Follow the confirmed instructions for any physical return; do not dispatch an item before arrangements are agreed.',
          'Return shipping responsibility and any approved delivery refund depend on the case decision. Keep the item and any available packaging while the issue is reviewed.',
        ],
        links: [
          { label: 'Open My orders', href: '/account/orders' },
          { label: 'Contact and support', href: '/contact' },
        ],
      },
      {
        id: 'refunds',
        title: 'Refunds and shopping credit',
        paragraphs: [
          'Approved COD refunds follow a verified manual refund process. The approved amount and progress are recorded against your order. Timing depends on review, any required physical return and the confirmed refund arrangement; no completion date is guaranteed.',
          'Refunds account for the amount actually paid. Shopping credit used is restored proportionately for the refunded items; referral discounts are not cash refunds. Refunds and replacements are recorded separately from the original delivery.',
        ],
      },
      {
        id: 'cancellation',
        title: 'Need to cancel before delivery?',
        paragraphs: [
          'You can cancel a seller parcel without a cancellation charge until it is ready for pickup. Custom-made production already started requires staff review. Review the revised COD and restored wallet credit before confirming. For new-policy orders, delivery is recalculated from the remaining stores; historical orders retain their recorded cancellation policy. After dispatch, use the return process.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    description:
      'How HastaBazaar uses account, order and support information and how to make a privacy request.',
    intro:
      'We use personal information to run the marketplace, fulfil orders and provide support.',
    sections: [
      {
        id: 'information',
        title: 'Information used by the marketplace',
        paragraphs: [
          'Optional delivery map pins are saved with addresses and order delivery details. Assigned riders and authorised operations staff can use them for delivery. Riders can explicitly share their current position during dispatch; the customer can view the latest reported position through their protected order page. Stale positions are hidden after two minutes, and positions are cleared when sharing stops, assignment changes or an order closes. Keep the rider page open for sharing; background updates are not guaranteed.',
          'Opening a map loads tiles from OpenStreetMap, whose service receives the map-area requests and your network information. Opening a courier tracking link visits that courier’s website. Location permission is optional; manual addresses remain available.',
          'Optional delivery map pins are saved with addresses and orders. Assigned riders and authorised operations staff use them for delivery. Riders can explicitly share their latest position during dispatch, visible through the protected order page. Stale positions are hidden after two minutes. Positions are cleared when sharing stops, assignment changes or the order closes. Sharing needs the rider page open; background updates are not guaranteed.',
          'Maps load OpenStreetMap tiles, which disclose requested map areas and network information to that service. Courier tracking links visit the courier website. Location permission is optional and manual addresses remain available.',
          'Account information includes your name, email, contact details and sign-in records. Order information includes the items purchased, delivery address, recipient and contact details, payment status, shopping credit and referral activity.',
          'We also process saved addresses, wishlists, reviews and photos you submit, support messages, return evidence and privacy requests. Seller applications include business and verification documents.',
          'Security and operational records include authentication activity, request identifiers, technical request data and audit history used to protect accounts, investigate problems and prevent abuse.',
        ],
      },
      {
        id: 'purposes',
        title: 'Why we use it',
        paragraphs: [
          'We use this information to authenticate you, maintain your cart and account, fulfil and track orders, send account and order emails, handle returns and complaints, operate promotional offers, and prevent fraud or misuse.',
          'Records also support financial reconciliation, dispute resolution and applicable legal obligations. Providing delivery and contact information is necessary to place and fulfil an order.',
        ],
      },
      {
        id: 'sharing',
        title: 'Who can receive information',
        paragraphs: [
          'Relevant order information is made available to the seller fulfilling your items, delivery providers and authorised support staff as needed for their work. Hosting, storage and email service providers process information to operate the service.',
          'If you choose Google sign-in, Google participates in authentication and we receive the account information needed to sign you in. Google’s own service policies also apply.',
          'Published reviews, the reviewer display name, approved photos and seller replies are visible publicly. Do not upload sensitive information or location metadata in review photos. Return evidence and seller verification documents are not public review content.',
          'Information may also be disclosed where required by applicable law or to handle a lawful request.',
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies and sign-in',
        paragraphs: [
          'The marketplace uses cookies to keep you signed in, retain a guest cart, protect authentication flows, recognise referral entry and provide access to a guest receipt. Blocking essential cookies can stop these features from working.',
          'Treat private receipt links and sign-in codes as confidential. Sign out on shared devices. Passwords are stored using a one-way password hashing process; we do not need your password or one-time code in a support message.',
        ],
      },
      {
        id: 'retention',
        title: 'Retention and protection',
        paragraphs: [
          'Access controls limit private records to authorised accounts and operations. No online service can promise absolute security.',
          'Retention depends on the record’s purpose and applicable obligations. Order, payment, dispute and security records may need to be retained after an account request. We do not promise immediate deletion of every record; an eligible deletion request is reviewed and its outcome recorded.',
        ],
      },
      {
        id: 'choices',
        title: 'Your requests and choices',
        paragraphs: [
          'You can update profile and saved address information in your account. You can request access, correction, deletion of eligible information or object to retention through the privacy request page. Identity and scope may need to be checked before action.',
          'This page describes current practices. Future updates do not rewrite the commercial terms saved with existing orders.',
        ],
        links: [
          { label: 'Account privacy requests', href: '/account/privacy' },
          { label: 'Contact and support', href: '/contact' },
        ],
      },
    ],
  },
  terms: {
    title: 'Terms & conditions',
    description:
      'Customer terms for using HastaBazaar, placing orders and getting support.',
    intro:
      'Please read these terms together with the product listing, shipping information, return policy and privacy policy before placing an order.',
    sections: [
      {
        id: 'marketplace',
        title: 'Using HastaBazaar',
        paragraphs: [
          'HastaBazaar is a marketplace connecting customers with independent sellers in Nepal. Listings identify the seller and item details. HastaBazaar provides marketplace operations and coordinates customer support.',
          'Provide accurate account, contact and delivery information, keep account access secure and use the service lawfully. Do not impersonate others, misuse personal information, submit fraudulent orders or interfere with the service.',
        ],
      },
      {
        id: 'ordering',
        title: 'Listings, prices and orders',
        paragraphs: [
          'Prices are shown in NPR. Read the materials, preparation time, availability and return conditions on each listing. Checkout rechecks price and stock and displays the applicable delivery charge and total.',
          'A cart does not reserve stock. An order is recorded when checkout succeeds and an order confirmation is created. Keep the order number and your secure receipt.',
          'Your accepted policy information, item prices and relevant commercial details are saved with the order. Later page or listing changes do not replace those saved terms.',
        ],
      },
      {
        id: 'payment',
        title: 'COD and promotional credit',
        paragraphs: [
          'Payment is by cash on delivery for the amount recorded on your order. Eligible promotional shopping credit and referral discounts are shown separately and apply to products, not delivery charges.',
          'The promotional wallet does not accept deposits or withdrawals and is not a bank account. Do not create duplicate accounts, self-refer or place artificial orders to obtain rewards. Offer eligibility and the terms saved with the order apply.',
        ],
        links: [
          {
            label: 'Referral and shopping credit terms',
            href: '/referral-terms',
          },
        ],
      },
      {
        id: 'delivery',
        title: 'Delivery, cancellation and returns',
        paragraphs: [
          'Delivery uses your district base fee for the first store. Multiple products from that store share the fee; each additional store adds 50% of the base. Preparation is included in the displayed arrival estimate. Estimates are not guaranteed dates and seller shipments can arrive separately.',
          'Cancellation is available without a cancellation charge until the relevant seller parcel is ready for pickup. Custom-made production already started requires staff review. New-policy orders recalculate delivery from the remaining stores; historical orders retain their recorded rule. Cancelled-item wallet credit is restored and its discount allocation removed. Review the revised amount before confirming. After dispatch, use the return process. Return eligibility, windows and conditions are explained on the product and Returns page.',
        ],
        links: [
          { label: 'Shipping policy', href: '/shipping' },
          { label: 'Return policy', href: '/returns' },
        ],
      },
      {
        id: 'reviews',
        title: 'Reviews and submitted content',
        paragraphs: [
          'Submit only content you have the right to share, describe your experience honestly and avoid other people’s personal information. Reviews require a verified delivered purchase and are moderated with their photos before publication. Seller replies are also moderated.',
          'You allow HastaBazaar to display the review content you submit for that purpose. We may withhold or hide content that violates marketplace rules or exposes private information; negative feedback is not excluded merely because it is negative.',
        ],
      },
      {
        id: 'support',
        title: 'Problems, privacy and applicable rights',
        paragraphs: [
          'Use the order support process to raise a complaint or return request. We may ask for further information and record the decision and any approved resolution.',
          'These terms operate subject to applicable laws in Nepal. Nothing in these pages excludes rights or remedies that applicable law does not allow us to exclude. We do not promise uninterrupted access or guaranteed delivery dates.',
          'Personal information is handled as described in the Privacy policy. Updates to these public pages describe future practices and do not silently amend an existing order’s saved commercial terms.',
        ],
        links: [
          { label: 'Contact and support', href: '/contact' },
          { label: 'Privacy policy', href: '/privacy' },
        ],
      },
    ],
  },
} satisfies Record<string, PublicPage>;

export type PublicPageKey = keyof typeof publicPages;
export const publicPageNavigation = Object.entries(publicPages).map(
  ([slug, page]) => ({ href: `/${slug}`, label: page.title }),
);
