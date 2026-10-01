import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://hastabazaar.com'),
  title: {
    default: 'HastaBazaar — Handmade with a human story',
    template: '%s · HastaBazaar',
  },
  description:
    'A considered marketplace for handmade craft, jewellery, textiles, and homeware.',
  icons: {
    icon: '/brand/hastabazaar-icon-32.png',
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
      <body><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-background focus:p-3 focus:text-primary">Skip to main content</a>{children}</body>
    </html>
  );
}
