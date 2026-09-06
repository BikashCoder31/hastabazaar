import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Hathkriti — Handmade with a human story',
    template: '%s · Hathkriti',
  },
  description:
    'A considered marketplace for handmade craft, jewellery, textiles, and homeware.',
  icons: {
    icon: '/brand/hathkriti-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
