'use client';

import { DISTRICTS_BY_PROVINCE } from '@/lib/checkout/nepal-address';
import type { DeliveryRates } from '@/lib/checkout/delivery-rates';
import { DELIVERY_ESTIMATE_NOTICE, deliveryDistrictFeedback } from '@/lib/checkout/delivery-presentation';
import { useState } from 'react';
import { getDeliveryEstimate } from '@/lib/checkout/validation';

export function ProductDelivery({ preparationDays, madeToOrder, rates }: { preparationDays: number; madeToOrder: boolean; rates: DeliveryRates }) {
  const [district, setDistrict] = useState('');
  const feedback = deliveryDistrictFeedback(district);
  const quote = feedback.status === 'valid' ? getDeliveryEstimate(feedback.district, [preparationDays], rates) : null;
  return (
    <div>
      <h3 className="font-semibold">Delivery estimate & charge</h3>
      <label htmlFor="product-delivery-district" className="mt-3 block text-sm font-medium">Delivery district</label>
      <input id="product-delivery-district" value={district} onChange={event => setDistrict(event.target.value)} list="product-districts" maxLength={80} autoComplete="address-level2" placeholder="e.g. Kathmandu, Dhanusha or Dolpa" aria-describedby="product-delivery-help product-delivery-feedback" aria-invalid={feedback.status === 'invalid'} className="mt-2 h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-primary" />
      <datalist id="product-districts">{Object.values(DISTRICTS_BY_PROVINCE).flat().map(name => <option key={name} value={name}>{name}</option>)}</datalist>
      <p id="product-delivery-help" className="mt-2 text-xs leading-5 text-muted-foreground">Choose or type a district. Nawalparasi and Rukum need East or West. {DELIVERY_ESTIMATE_NOTICE}</p>
      <div aria-live="polite" aria-atomic="true" className="mt-3 text-sm leading-6">
        <p id="product-delivery-feedback" className={feedback.status === 'invalid' ? 'font-medium text-destructive' : 'text-muted-foreground'}>{feedback.message}</p>
        {quote ? <>
          <p className="font-semibold">Delivery charge: {new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(quote.chargePaisa / 100)}</p>
          <p>Estimated arrival: <strong>{quote.estimatedMinDays}–{quote.estimatedMaxDays} days after ordering</strong>.</p>
          <p className="text-muted-foreground">{madeToOrder ? 'Made to order · ' : ''}{quote.preparationDays} days preparation + {quote.transitMinDays}–{quote.transitMaxDays} days transit. Estimate, not a guaranteed date.</p>
        </> : <p className="text-muted-foreground">{madeToOrder ? 'Made to order · ' : ''}{preparationDays === 0 ? 'Ready to dispatch.' : `${preparationDays} days of preparation before dispatch.`}</p>}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">This estimate is for one seller. Items from the same seller share the delivery charge. See the delivery totals for your bag at checkout.</p>
    </div>
  );
}
