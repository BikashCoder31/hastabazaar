import type { Metadata } from 'next';
import { TrafficBeacon } from '@/components/analytics/traffic-beacon';
import { SupportAssistant } from '@/components/support/support-assistant';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://hastabazaar.com'),
  title: {
    default: 'Hastabazaar — Handmade Gifts & Crafts in Nepal',
    template: '%s · Hastabazaar',
  },
  description:
    'Shop handmade gifts, jewellery, textiles and homeware from independent makers in Nepal. Discover local crafts and the people behind them at Hastabazaar.',
  icons: {
    icon: { url: '/brand/hastabazaar-mark-192.png', type: 'image/png', sizes: '192x192' },
    apple: '/brand/hastabazaar-apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-background focus:p-3 focus:text-primary"
        >
          Skip to main content
        </a>
        {children}
        <SupportAssistant />
        <TrafficBeacon />
      </body>
    </html>
  );
}
