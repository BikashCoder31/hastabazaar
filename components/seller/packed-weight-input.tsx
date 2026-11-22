'use client';

import { useId, useState } from 'react';
import { packedWeightRange, parsePackedWeightKg } from '@/lib/shipping/packed-weight';

export function PackedWeightInput({ label, value, onChange, onBlur, disabled, required, invalid, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  hint: string;
}) {
  const inputId = useId();
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={inputId} className="block text-sm font-semibold">{label}</label>
    <input id={inputId} type="text" inputMode="decimal" autoComplete="off" maxLength={6}
      aria-describedby={`${inputId}-hint`} aria-invalid={invalid || undefined} required={required}
      value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} disabled={disabled}
      className="min-h-11 w-full min-w-0 rounded-lg border border-[#D7C4A9] bg-white px-3 py-2 text-base aria-invalid:border-[#A8232E] disabled:opacity-70" />
    <p id={`${inputId}-hint`} className={`text-sm ${invalid ? 'text-[#A8232E]' : 'text-[#665B4C]'}`}>{hint}</p>
  </div>;
}

export function PackedProductWeightInput({ grams, onChange }: {
  grams?: number | null;
  onChange: (grams: number | null) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  const value = entry ?? (grams == null ? '' : String(grams / 1000));
  const invalid = value.trim() !== '' && parsePackedWeightKg(value) === null;
  return <PackedWeightInput label="Packed weight (kg)" value={value} invalid={invalid}
    hint={invalid ? packedWeightRange : 'Optional. Include packaging for one item.'}
    onChange={text => {
      const parsed = parsePackedWeightKg(text);
      setEntry(text);
      if (parsed !== null || text.trim() === '') onChange(parsed);
    }} onBlur={() => { if (!invalid) setEntry(null); }} />;
}
