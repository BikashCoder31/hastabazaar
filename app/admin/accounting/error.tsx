'use client';
import { Button } from '@/components/ui/button';
export default function AccountingError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="section-title">Accounting</h1>
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
