export const storefrontNavigation = [
  { label: 'Shop all', href: '/shop' },
  { label: 'Categories', href: '/categories' },
  { label: 'Gifts by occasion', href: '/occasions' },
  { label: 'Craft guide', href: '/#craft-guide' },
  { label: 'Our standard', href: '/#our-standard' },
  { label: 'Help & support', href: '/help' },
] as const;

export const customerNavigation = [
  { label: 'My account', href: '/account' },
  { label: 'Daily rewards', href: '/account/rewards' },
  { label: 'My profile', href: '/account/profile' },
  { label: 'My orders', href: '/account/orders' },
  { label: 'My wallet', href: '/account/wallet' },
  { label: 'Refer & earn', href: '/account/referrals' },
  { label: 'My wishlist', href: '/account/wishlist' },
  { label: 'Saved addresses', href: '/account/addresses' },
  { label: 'Notifications', href: '/account/notifications' },
] as const;

// The legacy makers anchor reaches a buying guide. Actual /makers/{id} pages
// retain their seller identity and destination.
export function publicStorefrontAction(label: string, href: string) {
  return href === '/#makers' ||
    href === '#makers' ||
    href === '/#craft-guide' ||
    href === '#craft-guide'
    ? { label: 'Craft guide', href: '/#craft-guide' }
    : { label, href };
}
