import Link from 'next/link';

export function CommissionSettings({ percent }: { percent: number }) {
  return (
    <section className="max-w-2xl space-y-4 rounded-2xl border bg-card p-6">
      <div>
        <p className="text-sm font-semibold">Current seller commission</p>
        <p className="mt-2 font-heading text-4xl">{percent}%</p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {percent}% commission on completed, paid product sales. No joining fee.
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        The commission base is the product selling value after seller-funded
        discounts. Separately stated product taxes and delivery charges are
        excluded; a discount funded entirely by HastaBazaar does not reduce the
        seller&apos;s agreed product value.
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        A different future rate requires advance notice, a new versioned Seller
        Marketplace Agreement, prospective seller acceptance, and a separate
        configuration activation. Existing order and ledger snapshots are never
        rewritten.
      </p>
      <Link href="/seller-agreement" className="font-semibold text-primary underline">
        Read the Seller Marketplace Agreement
      </Link>
    </section>
  );
}
