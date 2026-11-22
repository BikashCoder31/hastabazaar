import { sellerDisclosure } from '@/lib/sellers/disclosure';

export function SellerDisclosure(props: Parameters<typeof sellerDisclosure>[0]) {
  return <span className="block text-xs leading-5">{sellerDisclosure(props).map(line => <span key={line} className="block">{line}</span>)}</span>;
}
