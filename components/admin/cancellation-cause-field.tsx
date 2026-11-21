'use client';

import { useId } from 'react';
import { cancellationCauseLabel, cancellationCauses, type CancellationCause } from '@/lib/cancellation/causes';

export function CancellationCauseField({ inferred, required = true }: {
  inferred?: CancellationCause | null;
  required?: boolean;
}) {
  const id = useId();
  if (inferred) return <p className="text-sm">Cancellation cause · {cancellationCauseLabel(inferred)}</p>;
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id}>Cancellation cause</label>
      <select id={id} name="cause" required={required} className="mt-1 block min-h-11 w-full rounded border bg-background p-2">
        <option value="">Choose a cause</option>
        {cancellationCauses.map(([cause, label]) => <option key={cause} value={cause}>{label}</option>)}
      </select>
    </div>
  );
}
