'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { passwordConfirmationError } from '@/lib/auth/password-confirmation';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

export function SignupPasswordFields() {
  const passwordId = useId();
  const confirmationId = useId();
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  function validate() {
    const error = passwordConfirmationError(password.current?.value ?? '', confirmation.current?.value ?? '');
    confirmation.current?.setCustomValidity(error === 'confirmation' ? 'Passwords must match exactly.' : '');
  }

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor={passwordId}>Password *</FieldLabel>
        <InputGroup className="h-12 rounded-xl">
          <InputGroupInput
            id={passwordId}
            ref={password}
            onInput={validate}
            required
            type={passwordVisible ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={256}
            aria-describedby={`${passwordId}-help`}
            className="h-full px-4 py-3"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-sm"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              aria-controls={passwordId}
              aria-pressed={passwordVisible}
              title={passwordVisible ? 'Hide password' : 'Show password'}
              onClick={() => setPasswordVisible(visible => !visible)}
            >
              {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id={`${passwordId}-help`}>Use at least 10 characters.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={confirmationId}>Confirm password *</FieldLabel>
        <InputGroup className="h-12 rounded-xl">
          <InputGroupInput
            id={confirmationId}
            ref={confirmation}
            onInput={validate}
            required
            type={confirmationVisible ? 'text' : 'password'}
            name="confirm_password"
            autoComplete="new-password"
            minLength={10}
            maxLength={256}
            className="h-full px-4 py-3"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-sm"
              aria-label={confirmationVisible ? 'Hide confirm password' : 'Show confirm password'}
              aria-controls={confirmationId}
              aria-pressed={confirmationVisible}
              title={confirmationVisible ? 'Hide confirm password' : 'Show confirm password'}
              onClick={() => setConfirmationVisible(visible => !visible)}
            >
              {confirmationVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}
