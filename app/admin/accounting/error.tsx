'use client';
import { AdminPageTitle } from '@/components/admin/page-help';
import { Button } from '@/components/ui/button';
export default function AccountingError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <AdminPageTitle><h1 className="section-title">Accounting</h1></AdminPageTitle>
      <p role="alert">
        Accounting is unavailable. No financial data was changed. Reload or
        review source readiness.
      </p>
      <Button variant="outline" onClick={reset}>
        Retry reading records
      </Button>
    </div>
  );
}
