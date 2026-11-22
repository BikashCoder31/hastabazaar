'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdminPageTitle } from '@/components/admin/page-help';
import { StepLine, type StepLineStep } from '@/components/ui/step-line';
import { WhoseTurn, type WhoseTurnStatus } from '@/components/ui/whose-turn';
import { cn } from '@/lib/utils';

export const refundPanel = 'min-w-0 rounded-[14px] border border-[#E4DACA] bg-white';
export const refundLink = 'inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#14213D] underline underline-offset-4';
export const refundColumns = 'grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]';

type QueueView = 'refunds' | 'recoveries';
type ReviewStatus = { status: WhoseTurnStatus; label: string };

export function RefundRecoveryHeader({ view, otherHref, returnTo }: {
  view: QueueView;
  otherHref?: string;
  returnTo?: string;
}) {
  const tabs = [
    { id: 'refunds', label: 'Refunds to customers' },
    { id: 'recoveries', label: 'Money back from sellers & couriers' },
  ] as const;
  const chip = 'inline-flex min-h-11 max-w-full items-center rounded-full border px-3.5 py-2 text-sm font-semibold leading-tight';

  return <header className="space-y-3 text-[#14213D]">
    <AdminPageTitle><h1 className="font-heading text-3xl font-semibold sm:text-4xl">Refunds &amp; recoveries</h1></AdminPageTitle>
    <nav aria-label="Refund and recovery queues" className="flex flex-wrap items-start gap-2">
      {tabs.map(tab => tab.id === view
        ? <span key={tab.id} aria-current="page" className={cn(chip, 'border-[#14213D] bg-[#14213D] text-white')}>{tab.label}</span>
        : otherHref ? <Link key={tab.id} href={otherHref} className={cn(chip, 'border-[#D3C5AD] bg-white text-[#46536F] hover:border-[#14213D] hover:text-[#14213D]')}>{tab.label}</Link> : null)}
    </nav>
    {returnTo ? <Link href={returnTo} className={cn(refundLink, 'gap-2')}><ArrowLeft aria-hidden="true" className="size-4" />Back to previous view</Link> : null}
  </header>;
}

export function RefundQueueRow({ id, reference, title, status, description, amount, href, selected, linkLabel }: {
  id?: string;
  reference: string;
  title: string;
  status: ReviewStatus;
  description: string;
  amount?: string;
  href: string;
  selected?: boolean;
  linkLabel?: string;
}) {
  return <li id={id} className="min-w-0 border-t border-[#E4DACA]">
    <Link href={href} prefetch={false} aria-current={selected ? 'true' : undefined} aria-label={linkLabel}
      className={cn('flex min-h-11 min-w-0 items-center justify-between gap-2 border-l-[3px] border-transparent px-3 py-3 hover:bg-[#F7F3EC] sm:px-4', selected && 'border-l-[#A8232E] bg-[#FFFCF7]')}>
      <span className="min-w-0 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-all font-mono text-xs font-semibold text-[#46536F]">{reference}</span>
          <WhoseTurn {...status} />
        </span>
        <strong className="block break-words text-sm leading-snug">{title}</strong>
        <span className="block break-words text-sm leading-snug text-[#46536F]">{description}</span>
      </span>
      {amount ? <strong className="shrink-0 text-right text-sm tabular-nums">{amount}</strong> : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#46536F]" />}
    </Link>
  </li>;
}

export function RefundDetailHeading({ reference, title, status, steps, progressLabel }: {
  reference: string;
  title: string;
  status: ReviewStatus;
  steps: readonly StepLineStep[];
  progressLabel: string;
}) {
  return <>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-all font-mono text-xs text-[#46536F] sm:text-sm">{reference}</p>
        <h2 className="mt-1 break-words [font-family:Fraunces,Georgia,serif] text-2xl font-semibold leading-tight sm:text-[1.75rem]">{title}</h2>
      </div>
      <WhoseTurn {...status} />
    </div>
    <StepLine label={progressLabel} steps={steps} className="grid-cols-2 lg:grid-cols-2 xl:grid-cols-4" />
  </>;
}

export function RefundDetails({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm leading-snug sm:gap-x-6">
    {rows.map(({ label, value }) => <div key={label} className="contents">
      <dt className="text-[#46536F]">{label}</dt><dd className="break-words font-semibold">{value}</dd>
    </div>)}
  </dl>;
}

export function RefundReviewButton({ targetId, children }: { targetId: string; children: ReactNode }) {
  function openReview() {
    const target = document.getElementById(targetId);
    if (!target) return;
    const disclosure = target instanceof HTMLDetailsElement ? target : target.hasAttribute('tabindex') ? null : target.querySelector('details');
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    if (disclosure) disclosure.open = true;
    const focusTarget = disclosure?.querySelector('summary') ?? target;
    focusTarget.focus({ preventScroll: true });
    focusTarget.scrollIntoView({ block: 'start' });
  }

  return <button type="button" aria-controls={targetId} onClick={openReview}
    className="min-h-11 rounded-[10px] bg-[#A8232E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#881B25]">
    {children}
  </button>;
}
