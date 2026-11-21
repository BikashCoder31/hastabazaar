'use client';

import { useState } from 'react';

export function PasswordVisibility({ inputId }: { inputId: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button type="button" aria-controls={inputId} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
      className="absolute inset-y-2 right-0 my-auto min-h-11 min-w-12 rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#a8232e]"
      onClick={() => {
        const input = document.getElementById(inputId);
        if (!(input instanceof HTMLInputElement)) return;
        input.type = shown ? 'password' : 'text';
        setShown(!shown);
      }}>
      {shown ? 'Hide' : 'Show'}
    </button>
  );
}
