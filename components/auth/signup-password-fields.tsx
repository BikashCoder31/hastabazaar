'use client';
import { useRef } from 'react';
import { passwordConfirmationError } from '@/lib/auth/password-confirmation';
const inputClass = 'mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary';
export function SignupPasswordFields() {
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  function validate() {
    const error = passwordConfirmationError(password.current?.value ?? '', confirmation.current?.value ?? '');
    confirmation.current?.setCustomValidity(error === 'confirmation' ? 'Passwords must match exactly.' : '');
  }
  return <>
    <label className="block text-sm font-medium">Password *<input ref={password} onInput={validate} required type="password" name="password" autoComplete="new-password" minLength={10} maxLength={256} aria-describedby="signup-password-help" className={inputClass} /><span id="signup-password-help" className="mt-1 block text-xs text-muted-foreground">Use 10–256 characters.</span></label>
    <label className="block text-sm font-medium">Confirm password *<input ref={confirmation} onInput={validate} required type="password" name="confirm_password" autoComplete="new-password" minLength={10} maxLength={256} className={inputClass} /></label>
  </>;
}
