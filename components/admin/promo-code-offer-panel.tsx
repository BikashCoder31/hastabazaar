'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import { PromoCodeCostPreview } from '@/components/admin/promo-code-cost-preview';
import { PromoCodeManager } from '@/components/admin/promo-code-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizePromoCode } from '@/lib/incentives/promo-policy';
import { nprToPaisa, percentageToBps } from '@/lib/incentives/presentation';
import type { PromoTerms } from '@/lib/incentives/types';

const emptyPage = { campaigns: [], nextCursor: null };
const decimal = '[0-9]+([.][0-9]{1,2})?';
const inputClass = 'min-h-11 rounded-xl border-[#d6c5ac] px-3';

function positiveAmount(value: string, parse: (input: string) => number) {
  try {
    return parse(value) || null;
  } catch {
    return null;
  }
}

export function PromoCodeOfferPanel({
  actorId,
  role,
  averageSubtotalPaisa,
  defaultCommissionBps,
}: {
  actorId: string;
  role: 'super_admin';
  averageSubtotalPaisa: number | null;
  defaultCommissionBps?: number;
}) {
  const [code, setCode] = useState('');
  const [percentage, setPercentage] = useState('');
  const [budget, setBudget] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const percentBps = positiveAmount(percentage, percentageToBps);
  const budgetPaisa = positiveAmount(budget, nprToPaisa);

  const terms: PromoTerms | null =
    percentBps === null
      ? null
      : {
          code: 'PREVIEW',
          label: 'Cost preview',
          kind: 'percentage',
          percentBps,
          // Illustrate the percentage before the native editor collects these limits.
          maxDiscountPaisa: Number.MAX_SAFE_INTEGER,
          minimumSubtotalPaisa: 0,
          startsAt: 0,
          endsAt: 1,
          totalUseLimit: 1,
          perCustomerUseLimit: 1,
          budgetPaisa: Number.MAX_SAFE_INTEGER,
        };

  function continueToDraft(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      let normalized: string;
      try {
        normalized = normalizePromoCode(code);
      } catch {
        throw new Error(
          'Use 3 to 32 letters, numbers, hyphens or underscores, starting with a letter or number.',
        );
      }
      if (percentBps === null)
        throw new Error('Enter a discount percentage above 0 and up to 100%.');
      if (budgetPaisa === null)
        throw new Error('Enter a positive total budget in NPR.');
      setCode(normalized);
      setError('');
      setEditing(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Review the draft details.',
      );
    }
  }

  function cancel() {
    setEditing(false);
    setCode('');
    setPercentage('');
    setBudget('');
    setError('');
    requestAnimationFrame(() => codeRef.current?.focus());
  }

  if (editing) {
    return (
      <PromoCodeManager
        actorId={actorId}
        role={role}
        initialPage={emptyPage}
        defaultCommissionBps={defaultCommissionBps}
        draftStart={{
          code,
          percentage,
          budget,
          averageSubtotalPaisa,
          onCancel: cancel,
        }}
      />
    );
  }

  return (
    <form onSubmit={continueToDraft} className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="new-offer-code">Code customers type</Label>
        <Input
          id="new-offer-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          ref={codeRef}
          minLength={3}
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
          required
        />
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-offer-percentage">Discount %</Label>
          <Input
            id="new-offer-percentage"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            inputMode="decimal"
            pattern={decimal}
            className={inputClass}
            required
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-offer-budget">Total budget (NPR)</Label>
          <Input
            id="new-offer-budget"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            inputMode="decimal"
            pattern={decimal}
            className={inputClass}
            required
          />
        </div>
      </div>
      <PromoCodeCostPreview
        terms={terms}
        averageSubtotalPaisa={averageSubtotalPaisa}
        defaultCommissionBps={defaultCommissionBps}
        compact={{ estimatedBudgetPaisa: budgetPaisa }}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="workspace-decision" size="workspace" type="submit">
          Continue to draft
        </Button>
        <Button
          variant="ghost"
          size="workspace"
          type="button"
          className="border-transparent!"
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
