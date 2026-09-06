import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Hastabazaar — Handmade with a human story',
    template: '%s · Hastabazaar',
  },
  description:
    'A considered marketplace for handmade craft, jewellery, textiles, and homeware.',
  icons: {
    icon: '/brand/hastabazaar-logo.png',
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
