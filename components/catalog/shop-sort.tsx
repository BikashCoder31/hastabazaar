'use client';

export function ShopSort({ entries, value, label, helpText }: {
  entries: readonly [string, string][];
  value: string;
  label: string;
  helpText?: string;
}) {
  return (
    <form action="/shop" method="get" className="max-w-full">
      {entries.map(([name, content], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={content} />)}
      <label htmlFor="shop-results-sort" className="sr-only">{label}</label>
      <select id="shop-results-sort" name="sort" defaultValue={value} key={value}
        aria-describedby={helpText ? 'shop-results-sort-help' : undefined}
        className="min-h-11 max-w-full rounded-xl border border-[#d9c8ae] bg-[#fffdf9] px-3 text-sm text-[#14213d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onChange={event => event.currentTarget.form?.requestSubmit()}>
        <option value="relevance">Best match</option>
        <option value="newest">Newest</option>
        <option value="price-low">Price: low to high</option>
        <option value="price-high">Price: high to low</option>
        <option value="name">Name</option>
      </select>
      <noscript><button type="submit" className="ml-2 min-h-11 rounded-lg border px-3">Apply sort</button></noscript>
      {helpText ? <p id="shop-results-sort-help" className="mt-1 text-xs text-muted-foreground">{helpText}</p> : null}
    </form>
  );
}
