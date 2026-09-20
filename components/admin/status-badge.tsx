import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const labels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_changes: 'Needs changes',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  out_of_stock: 'Out of stock',
  archived: 'Inactive / archived',
  suspended: 'Suspended',
  pending: 'Pending',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
  prepared: 'Prepared',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  reversed: 'Reversed',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        status === 'approved' || status === 'accepted' || status === 'published' || status === 'paid'
          ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
          : status === 'rejected' || status === 'revoked' || status === 'failed' || status === 'reversed'
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : status === 'needs_changes' || status === 'out_of_stock'
              ? 'border-amber-600/30 bg-amber-50 text-amber-800'
              : 'border-primary/25 bg-primary/5 text-primary',
      )}
    >
      {labels[status] ?? status.replaceAll('_', ' ')}
    </Badge>
  );
}
