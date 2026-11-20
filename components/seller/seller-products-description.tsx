'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function SellerProductsDescription() {
  const router = useRouter();
  const [values, setValues] = useState<{ productCategories: string; businessDescription: string; version: number } | null>(null);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch('/api/seller/products-description', { cache: 'no-store' }).then(async response => {
    const body = await response.json() as { productCategories: string; businessDescription: string; version: number; error?: string };
    if (!response.ok) throw new Error(body.error); setValues(body);
  }).catch(error => setMessage(error.message)); }, []);
  async function save(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault(); if (!values) return; const data = new FormData(event.currentTarget); setBusy(true);
    try {
      const response = await fetch('/api/seller/products-description', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCategories: data.get('productCategories'), businessDescription: data.get('businessDescription'), version: values.version }) });
      const body = await response.json() as { error?: string; version: number };
      if (!response.ok) throw new Error(body.error ?? 'Descriptions could not be saved.');
      setValues({ ...values, version: body.version }); setMessage('Your product types and description have been saved.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reload to check whether the save completed.'); }
    finally { setBusy(false); }
  }
  return <section id="your-products" className="space-y-4 rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Your products</h2>
    <p className="text-sm text-muted-foreground">Tell customers what you make. Add individual product listings in the Products section of your dashboard.</p>
    {values ? <form data-form-id="seller.products-description" onSubmit={save} className="space-y-4">
      <label htmlFor="dashboard-product-types" className="block space-y-2">Product types<Input id="dashboard-product-types" name="productCategories" maxLength={500} defaultValue={values.productCategories} placeholder="For example, textiles, jewellery, pottery" /></label>
      <label htmlFor="dashboard-product-description" className="block space-y-2">Tell us about your work<Textarea id="dashboard-product-description" name="businessDescription" maxLength={1500} rows={5} defaultValue={values.businessDescription} placeholder="Describe what you make, your materials and your process." /></label>
      <Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save product details'}</Button>
    </form> : null}<output className="block">{message}</output></section>;
}
