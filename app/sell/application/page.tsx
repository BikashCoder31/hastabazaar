import type { Metadata } from 'next';
import { SellerApplicationWorkspace } from '@/components/seller/application-workspace';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Application progress', robots: { index: false, follow: false } };
export default SellerApplicationWorkspace;
