import type { ReactNode } from 'react';
import { CustomerAuthFrame } from '@/components/account/customer-auth-frame';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <CustomerAuthFrame>{children}</CustomerAuthFrame>;
}
