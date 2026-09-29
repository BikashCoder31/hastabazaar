export const storefrontNavigation = [
  { label: 'Shop all', href: '/shop' },
  { label: 'Categories', href: '/categories' },
  { label: 'Gifts by occasion', href: '/occasions' },
  { label: 'Our makers', href: '/#makers' },
  { label: 'Our standard', href: '/#our-standard' },
  { label: 'Help & support', href: '/help' },
] as const;

export const customerNavigation = [
  { label: 'My account', href: '/account' },
  { label: 'My profile', href: '/account/profile' },
  { label: 'My orders', href: '/account/orders' },
  { label: 'My wallet', href: '/account/wallet' },
  { label: 'Refer & earn', href: '/account/referrals' },
  { label: 'My wishlist', href: '/account/wishlist' },
  { label: 'Saved addresses', href: '/account/addresses' },
  { label: 'Notifications', href: '/account/notifications' },
] as const;
