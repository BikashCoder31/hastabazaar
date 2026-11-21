'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, CircleAlert, Clock3, Eye, Flag, LockKeyhole, Package, ShieldCheck, Undo2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { FormGuide } from '@/components/forms/form-guide';
import type { PublishedFormConfig } from '@/lib/forms/types';
import type { OrderOfferSnapshot } from '@/lib/products/offer-order-contract';
import type { CustomerAftercareContext } from '@/lib/returns/customer-aftercare-context';
import { maximumEvidenceFiles, maximumEvidenceFileBytes, type ReturnReason } from '@/lib/returns/validation';
import { aftercareBox, aftercareLink, aftercarePrimary, aftercareSecondary, shortAftercareDate } from './customer-request-presentation';

export interface AftercareReceiptItem {
  offerSnapshot?: OrderOfferSnapshot | null;
  id: string;
  productName: string;
  sellerName: string;
  quantity: number;
  returnEligible: boolean;
  fulfillmentStatus?: string;
  lineTotalPaisa?: number;
}

export const returnBaseKeys = ['orderItemId', 'quantity', 'requestedResolution', 'reason',
  'detail', 'originalSealIntact', 'locale', 'evidence', 'idempotencyKey'];
export const complaintBaseKeys = ['orderItemId', 'category', 'subject', 'detail',
  'locale', 'idempotencyKey'];

const reasons = [
  { key: 'damaged', title: 'Damaged or faulty', help: 'Broken, not working, or damaged in transit', icon: CircleAlert },
  { key: 'wrong_item', title: 'Wrong item', help: 'Different item, size or colour', icon: Package },
  { key: 'not_as_described', title: 'Not as described', help: 'Doesn’t match the photos or details', icon: Eye },
  { key: 'counterfeit', title: 'Possibly not genuine', help: 'Doesn’t seem to be what was promised', icon: ShieldCheck },
  { key: 'late_delivery', title: 'Arrived very late', help: 'Much later than the estimate', icon: Clock3 },
  { key: 'change_of_mind', title: 'Changed my mind', help: 'Unused, with labels and packaging', icon: Undo2 },
  { key: 'other', title: 'Something else', help: 'Tell us what happened', icon: CircleAlert },
] as const satisfies readonly { key: ReturnReason; title: string; help: string; icon: typeof Eye }[];

const complaintCategories = [
  ['product', 'Product'], ['delivery', 'Delivery'], ['seller', 'Seller'], ['refund', 'Refund'],
  ['service', 'Hastabazaar service'], ['safety', 'Safety or urgent concern'], ['other', 'Other'],
] as const;

const followup = [
  ['You send the request', 'Tell us what happened and how we can help.'],
  ['The seller replies', 'They can accept, explain, or ask for more information.'],
  ['Hastabazaar decides', 'We review what both sides tell us and any photos.'],
  ['The courier collects it', 'Only if the item needs to come back.'],
  ['Refund or replacement', 'If approved, we’ll tell you what happens next.'],
] as const;

const inputStyle = 'min-h-11 w-full min-w-0 rounded-lg border border-[#CFBB9E] bg-white px-3 py-2 text-[#14213D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const steps = ['Which item is this about?', 'What happened?', 'What would put it right?', 'Show us what you see'] as const;
const wholeOrder = 'whole-order';
const money = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' });

function Choice({ name, value, selected, change, title, description, image, icon, unavailable }: {
  name: string; value: string; selected: boolean; change: () => void; title: string;
  description?: ReactNode; image?: string; icon?: ReactNode; unavailable?: boolean;
}) {
  return <label className={`flex min-h-16 min-w-0 items-center gap-3 rounded-xl border bg-white px-4 py-3 ${selected ? 'border-[#14213D] ring-1 ring-[#14213D]' : 'border-[#D6C5AB]'} ${unavailable ? 'cursor-not-allowed' : 'cursor-pointer'} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#14213D]`}>
    <input className="size-5 shrink-0 accent-[#14213D]" type="radio" name={name} value={value}
      checked={selected} onChange={change} disabled={unavailable}/>
    {image ? <Image src={image} alt="" width={56} height={56} unoptimized
      className="size-14 shrink-0 rounded-lg border border-[#E7DCCB] object-contain"/> : icon}
    <span className="min-w-0 break-words"><strong className="block text-sm leading-snug text-[#14213D]">{title}</strong>
      {description ? <span className="mt-1 block text-sm leading-snug text-[#46536F]">{description}</span> : null}</span>
  </label>;
}

function HelpSidebar({ context }: { context?: CustomerAftercareContext | null }) {
  return <aside className="min-w-0 space-y-4">
    <section className={aftercareBox} aria-label="What happens after you send">
      <h3 className="font-semibold text-[#14213D]">What happens after you send</h3>
      <ol className="mt-5 space-y-6">
        {followup.map(([title, detail], index) => <li key={title} className="flex gap-3.5">
          <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === 0 ? 'bg-[#14213D] text-white' : 'bg-[#ECE2D1] text-[#46536F]'}`}>{index + 1}</span>
          <div className="min-w-0"><strong className="block text-sm text-[#14213D]">{title}</strong><p className="mt-0.5 text-sm text-[#46536F]">{detail}</p></div>
        </li>)}
      </ol>
    </section>
    <section className={aftercareBox} aria-label="Good to know">
      <h3 className="font-semibold text-[#14213D]">Good to know</h3>
      {context?.policy?.changeOfMindEnabled ? <p className="mt-2 text-sm leading-relaxed text-[#46536F]">For a change of mind, ask within <strong>{context.policy.generalDays} days</strong> of delivery. For goods supplied sealed, the recorded window is {context.policy.sealedDays} days if the original seal is intact.</p> : null}
      <p className="mt-2 text-sm leading-relaxed text-[#46536F]">You can still report damage, faults, wrong items or goods that don’t match the description.</p>
      <Link className={aftercareLink} href="/returns">Full returns &amp; refunds policy</Link>
    </section>
  </aside>;
}

interface HelpFormState {
  config: PublishedFormConfig | null;
  canSubmit: boolean;
  message: string;
  pending: boolean;
  error: string;
  submit: (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => void;
}

type HelpChoice = 'item' | 'complaint' | 'urgent';

export function CustomerHelpFlow({ orderNumber, orderStatus, items, initialItemId, context, returnForm, complaintForm, mode, startComplaint }: {
  orderNumber: string; orderStatus: string; items: readonly AftercareReceiptItem[]; initialItemId?: string;
  context?: CustomerAftercareContext | null; returnForm: HelpFormState; complaintForm: HelpFormState;
  mode: HelpChoice; startComplaint: (itemId?: string) => void;
}) {
  const isDelivered = (item: AftercareReceiptItem) => item.fulfillmentStatus === 'delivered' || (!item.fulfillmentStatus && orderStatus === 'delivered');
  const [step, setStep] = useState(mode === 'urgent' || items.some(item => initialItemId === item.id) ? 2 : 1);
  const [itemId, setItemId] = useState(items.find(item => item.id === initialItemId)?.id ?? (mode === 'item' ? items.find(isDelivered)?.id ?? wholeOrder : wholeOrder));
  const [reason, setReason] = useState<ReturnReason>('damaged');
  const [resolution, setResolution] = useState<'refund' | 'replacement'>('refund');
  const [category, setCategory] = useState(mode === 'urgent' ? 'safety' : mode === 'complaint' ? 'product' : 'delivery');
  const [quantity, setQuantity] = useState(1);
  const [sealed, setSealed] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stepHeading.current?.focus(); }, []);
  const ids = useId();
  const selectedItem = items.find(item => item.id === itemId);
  const complaint = mode !== 'item' || !selectedItem || !isDelivered(selectedItem);
  const activeForm = complaint ? complaintForm : returnForm;
  const facts = context?.items.find(item => item.id === itemId);
  const changeOfMindUnavailable = !selectedItem?.returnEligible || context?.policy?.changeOfMindEnabled === false;
  const reasonLabel = reason === 'defective' ? 'Defective' : reasons.find(item => item.key === reason)?.title;
  const helpFormId = complaint ? 'commerce.complaint' : 'commerce.return-request';

  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function selectItem(nextId: string) {
    if (nextId === itemId) return;
    setItemId(nextId);
    setQuantity(1);
    setSealed(false);
    setReason('damaged');
  }

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <form data-form-id={helpFormId} className={`${aftercareBox} min-w-0 space-y-5`} onSubmit={event => {
      if (step < 4) { event.preventDefault(); go(step + 1); return; }
      activeForm.submit(event);
    }}>
      <div><p className="text-sm text-[#65584A]" aria-live="polite">Step {step} of 4</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
          {steps.map((name, index) => <span key={name} className={`h-1.5 rounded-full ${index < step ? 'bg-[#14213D]' : 'bg-[#E2D5BE]'}`}/>)}
        </div>
      </div>
      <h3 ref={stepHeading} tabIndex={-1} className="font-heading text-2xl font-semibold text-[#14213D] outline-none">
        {complaint && step === 3 ? 'What help do you need?' : steps[step - 1]}
      </h3>
      <input type="hidden" name="orderItemId" value={selectedItem?.id ?? ''}/>
      {complaint ? <input type="hidden" name="category" value={category}/> : <>
        <input type="hidden" name="quantity" value={quantity}/><input type="hidden" name="reason" value={reason}/>
        <input type="hidden" name="requestedResolution" value={resolution}/><input type="hidden" name="locale" value="en-NP"/>
        {sealed ? <input type="hidden" name="originalSealIntact" value="yes"/> : null}
      </>}

      {step === 1 ? <fieldset className="min-w-0 space-y-2.5">
        <legend className="sr-only">Which item is this about?</legend>
        <p className="mb-3 text-sm text-[#46536F]">Order {orderNumber}{facts?.deliveredAt ? ` · Delivered ${shortAftercareDate(facts.deliveredAt)}` : ''}</p>
        {items.map(item => <Choice key={item.id} name={`${ids}-item`} value={item.id} selected={item.id === itemId} change={() => selectItem(item.id)} title={item.productName}
          image={photoPath(context?.items.find(candidate => candidate.id === item.id)?.photoId)}
          description={<>{item.sellerName}{item.lineTotalPaisa != null ? ` · ${money.format(item.lineTotalPaisa / 100)}` : ''}
            {isDelivered(item) ? (!item.returnEligible || context?.policy?.changeOfMindEnabled === false ? ' · No change-of-mind returns' : '') : ' · Return available after delivery'}
            {item.offerSnapshot?.selection.length ? <span className="mt-1 block">{item.offerSnapshot.selection.map(choice => `${choice.name}: ${choice.value}`).join(' · ')}</span> : null}</>}/>)}
        <Choice name={`${ids}-item`} value={wholeOrder} selected={itemId === wholeOrder} change={() => selectItem(wholeOrder)}
          title="The whole order or the delivery" description="Late or missing parcel, a courier problem or Hastabazaar service" />
      </fieldset> : null}

      {step === 2 ? <div className="min-w-0 space-y-4">
        <p className="text-sm text-[#46536F]">{selectedItem?.productName ?? 'The whole order or the delivery'}</p>
        {complaint ? <fieldset className="grid min-w-0 gap-2.5 md:grid-cols-2">
          <legend className="sr-only">What happened?</legend>
          {complaintCategories.map(([key,title]) => <Choice name={`${ids}-category`} key={key} value={key} selected={category === key} change={() => setCategory(key)} title={title}/>) }
        </fieldset> : <>
          <fieldset className="grid min-w-0 gap-2.5 md:grid-cols-2">
            <legend className="sr-only">What happened?</legend>
            {reasons.map(({key,title,help,icon: Icon}) => <Choice key={key} name={`${ids}-reason`} value={key}
              selected={reason === key || (key === 'damaged' && reason === 'defective')}
              change={() => setReason(key)} title={title} description={key === 'change_of_mind' && changeOfMindUnavailable ? 'Unavailable for this item. You can still report a problem.' : help}
              unavailable={key === 'change_of_mind' && changeOfMindUnavailable} icon={<Icon className="size-4 shrink-0 text-[#46536F]" aria-hidden="true"/>}/>) }
          </fieldset>
          {reason === 'damaged' || reason === 'defective' ? <label className="block text-sm font-medium text-[#14213D]">Which best describes the issue?
            <select value={reason} onChange={event => setReason(event.target.value as 'damaged' | 'defective')} className={`${inputStyle} mt-2 max-w-sm`}>
              <option value="damaged">Damaged</option><option value="defective">Faulty or not working</option>
            </select>
          </label> : null}
          <button type="button" onClick={() => startComplaint(selectedItem?.id)} className={aftercareLink}><Flag className="size-4" aria-hidden="true"/>Safety or urgent concern? Tell us now</button>
        </>}
      </div> : null}

      {step === 3 ? <div className="space-y-4">
        {complaint ? <p className="text-sm text-[#46536F]">Tell us what you need in the details on the next step. Hastabazaar will review your complaint and explain what happens next.</p> : <>
          <p className="text-sm text-[#46536F]">You ask, the seller replies, and Hastabazaar makes the final decision.</p>
          <fieldset className="grid min-w-0 gap-2.5 md:grid-cols-2"><legend className="sr-only">Preferred resolution</legend>
            <Choice name={`${ids}-resolution`} value="refund" selected={resolution === 'refund'} change={() => setResolution('refund')} title="A refund" description="We’ll confirm the amount after review."/>
            <Choice name={`${ids}-resolution`} value="replacement" selected={resolution === 'replacement'} change={() => setResolution('replacement')} title="A replacement" description="The same item, if the seller has one."/>
          </fieldset>
          {(selectedItem?.quantity ?? 1) > 1 ? <label className="block text-sm font-semibold text-[#14213D]">Quantity
            <input value={quantity || ''} onChange={event => setQuantity(Number(event.target.value))} type="number" min={1}
              max={selectedItem?.quantity ?? 1} step={1} required className={`${inputStyle} mt-2 max-w-28`}/>
          </label> : null}
          {resolution === 'refund' ? <section className="space-y-2 rounded-xl border border-[#E7DCCB] bg-white px-4 py-3">
            <h4 className="flex items-center gap-2 font-semibold text-[#14213D]"><LockKeyhole className="size-4" aria-hidden="true"/>Where should the refund go?</h4>
            <p className="text-sm leading-relaxed text-[#46536F]">{context?.paymentMode === 'cod' ? 'For an approved cash refund, we’ll ask for a verified bank account in Returns & help.' : 'If we need payment details after approval, you can provide them privately in Returns & help.'}</p>
          </section> : null}
        </>}
      </div> : null}

      <fieldset hidden={step !== 4} disabled={step !== 4 || activeForm.pending} className="min-w-0 space-y-4">
        <legend className="sr-only">Photos, details and review</legend>
        {complaint ? <label className="block space-y-2 text-sm font-semibold text-[#14213D]">Subject
          <input className={inputStyle} name="subject" minLength={5} maxLength={120} required/>
        </label> : <>
          <p className="text-sm text-[#46536F]">Photos help the seller and Hastabazaar understand what happened.</p>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#CDBA9D] bg-white p-4 focus-within:outline-2 focus-within:outline-[#14213D]">
            <Upload className="size-5 shrink-0 text-[#14213D]" aria-hidden="true" />
            <span className="min-w-0"><strong className="block text-sm">Add photos or evidence</strong><span className="text-xs text-[#46536F]">Optional · JPG, PNG, WebP or PDF · {maximumEvidenceFiles} files, {maximumEvidenceFileBytes / (1024 * 1024)} MB each</span></span>
            <input type="file" name="evidence" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
              onChange={event => setFileNames(Array.from(event.currentTarget.files ?? [], file => file.name))} />
          </label>
          {fileNames.length ? <ul className="space-y-1 break-all text-sm text-[#46536F]">{fileNames.map((name,index) => <li key={`${index}:${name}`}>{name}</li>)}</ul> : null}
          <label className="flex min-h-11 items-start gap-2 text-sm leading-relaxed text-[#46536F]">
            <input type="checkbox" checked={sealed} onChange={event => setSealed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[#14213D]"/>
            The product was supplied with a seal, and the original seal is still intact.
          </label>
        </>}
        <label className="block space-y-2 text-sm font-semibold text-[#14213D]">{complaint ? 'Details' : 'Tell us more'}
          <textarea name="detail" required minLength={20} maxLength={complaint ? 3000 : 2000} rows={4} className={`${inputStyle} resize-y`} placeholder="Explain what happened and what help you need."/>
        </label>
        <FormGuide formId={helpFormId}/>
        {activeForm.config ? <div className="[&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11">
          <ConfiguredFields key={activeForm.config.formId} config={activeForm.config} baseKeys={complaint ? complaintBaseKeys : returnBaseKeys}/>
        </div> : null}
        {!activeForm.canSubmit ? <output className="block text-sm text-[#46536F]">{activeForm.message || 'Loading the current request form…'}</output> : null}
        <section className="space-y-1 rounded-xl border border-[#E7DCCB] p-4 text-sm text-[#46536F]" aria-label="Check before sending">
          <h4 className="font-semibold text-[#14213D]">Check before sending</h4>
          <p>{selectedItem?.productName ?? 'The whole order or the delivery'} · {complaint ? complaintCategories.find(([key]) => key === category)?.[1] : `${reasonLabel} · ${resolution === 'refund' ? 'Refund' : 'Replacement'}`}</p>
        </section>
        {activeForm.error ? <p role="alert" className="text-sm font-semibold text-[#A8232E]">{activeForm.error}</p> : null}
      </fieldset>

      <div className="grid gap-2 pt-2 sm:flex sm:items-center sm:justify-between">
        {step > 1 ? <button type="button" onClick={() => go(step - 1)} className={aftercareSecondary} disabled={activeForm.pending}><ChevronLeft className="size-4" aria-hidden="true"/> Back</button> : null}
        {step < 4 ? <button type="button" onClick={event => { if (event.currentTarget.form?.reportValidity()) go(step + 1); }} className={`${aftercarePrimary} sm:ml-auto sm:min-w-48`}>Continue</button> : <button type="submit" className={`${aftercarePrimary} sm:ml-auto sm:min-w-48`} disabled={activeForm.pending || !activeForm.canSubmit}>{activeForm.pending ? 'Sending…' : complaint ? 'Send complaint' : 'Send return request'}</button>}
      </div>
    </form>
    <HelpSidebar context={context}/>
  </div>;
}

function photoPath(id?: string | null) {
  return id ? `/api/product-media/${encodeURIComponent(id)}` : undefined;
}
