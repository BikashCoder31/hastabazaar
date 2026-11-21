'use client';
import {useAccountCommand} from './use-account-command';
import {AccountCommandRecovery} from './account-command-recovery';

import { FormGuide } from '@/components/forms/form-guide';
import {LocationPicker} from '@/components/delivery/location-picker';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CustomerAddressRow } from '@/lib/db/repositories/customers';
import { NEPAL_PROVINCES, DISTRICTS_BY_PROVINCE,normalizeProvince,normalizeDistrict } from '@/lib/checkout/nepal-address';
import { ConfiguredFields, fieldDisplay, focusConfiguredField } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const BASE_KEYS = ['label', 'recipientName', 'phone', 'province', 'district', 'municipality', 'ward', 'locality', 'landmark', 'postalCode', 'isDefault', 'location', 'userId', 'idempotencyKey'] as const;
const ADDRESS_KEYS = ['label', 'recipientName', 'phone', 'province', 'district', 'municipality', 'ward', 'locality', 'landmark', 'postalCode'] as const;

type AddressManagerProps={actorId:string;addresses:readonly CustomerAddressRow[]};
export function AddressManager(props:AddressManagerProps & { embedded?: boolean }) {
  return <CurrentAddressManager key={props.actorId} {...props}/>;
}
function CurrentAddressManager({actorId,addresses,embedded}:AddressManagerProps & { embedded?: boolean }) {
  const router = useRouter();
  const { config, status, message: configMessage, canSubmit, refresh, handleSubmissionResponse } = usePublishedFormConfig('account.address');
  const requestId = useRef<string | null>(null);
  const [editing, setEditing] = useState<CustomerAddressRow | null | undefined>(
    undefined,
  );
  const errorSummary=useRef<HTMLParagraphElement>(null);
  const addressForm=useRef<HTMLFormElement>(null);
  const openButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(editing!==undefined) addressForm.current?.querySelector<HTMLInputElement>('input[name=label]')?.focus();},[editing]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(()=>{if(error && Object.keys(fieldErrors).length === 0) errorSummary.current?.focus();},[error, fieldErrors]);
  const [deleting, setDeleting] = useState<CustomerAddressRow | null>(null);
  const command=useAccountCommand({actorId,scopeKey:'addresses',onRecorded:(_result,_isCurrent,reference)=>{
    requestId.current=null;setError('');
    setEditing(current=>reference.action==='address.create'?(current===null?undefined:current):(current?.id===reference.sourceId?undefined:current));
    setDeleting(current=>current?.id===reference.sourceId?null:current);router.refresh();
  },onDenied:()=>router.refresh()});
  useEffect(()=>{const fieldId=Object.keys(fieldErrors)[0],form=addressForm.current;if(!fieldId||!form||command.blocked)return;
    if(fieldId==='landmark')form.querySelector<HTMLInputElement>('input[name="landmark"]')?.focus();else focusConfiguredField(form,fieldId);
  },[fieldErrors,command.blocked]);

  async function save(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || command.blocked || !canSubmit || !config) return;
    const isCurrent=command.capture();
    let payload: ReturnType<typeof configuredJsonPayload>;
    try {
      const { answers } = readConfiguredSubmission(event.currentTarget, config, BASE_KEYS);
      payload = configuredJsonPayload(config, answers, BASE_KEYS);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review your form answers.');
      return;
    }
    setBusy(true);
    setError('');
    setFieldErrors({});
    const data = new FormData(event.currentTarget);
    const address = Object.fromEntries(ADDRESS_KEYS.map((key) => [key, data.get(key)]));
    const url = editing?.id
      ? `/api/account/addresses/${editing.id}`
      : '/api/account/addresses';
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await command.run({action:editing?.id?'address.update':'address.create',sourceId:editing?.id??'new',requestId:requestId.current,endpoint:url,method:editing?.id?'PATCH':'POST',body:{
          address: { ...address, location: data.get('latitude') && data.get('longitude') ? {latitude:Number(data.get('latitude')),longitude:Number(data.get('longitude'))}:undefined, isDefault: data.get('isDefault') === 'on' },
          idempotencyKey: requestId.current,
          ...payload,
        } });
      if(!response||!isCurrent())return;
      const result = response.data as { error?: unknown; code?: unknown; fieldId?: unknown } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version') handleSubmissionResponse(response, 'stale_version');
        else if (response.status === 400 || response.status === 409) requestId.current = null;
        const explanation = typeof result?.error === 'string' ? result.error : 'Address could not be saved.';
        if (typeof result?.fieldId === 'string') {
          setFieldErrors({ [result.fieldId]: explanation });
        }
        throw new Error(explanation);
      }
    } catch (reason) {
      if(isCurrent())setError(
        reason instanceof Error
          ? reason.message
          : 'Address could not be saved.',
      );
    } finally {
      if(isCurrent())setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy||command.blocked) return;
    const isCurrent=command.capture();
    setBusy(true);
    setError('');
    try {
      requestId.current??=crypto.randomUUID();
      const response=await command.run({action:'address.delete',sourceId:id,requestId:requestId.current,endpoint:`/api/account/addresses/${encodeURIComponent(id)}`,method:'DELETE',body:{idempotencyKey:requestId.current}});
      if(!response||!isCurrent())return;
      if(!response.ok){const detail=(response.data as {error?:unknown}|null)?.error;throw Error(typeof detail==='string'?detail:'Address could not be deleted.');}
    } catch (reason) {
      if(isCurrent())setError(
        reason instanceof Error
          ? reason.message
          : 'Address could not be deleted.',
      );
    } finally {
      if(isCurrent())setBusy(false);
    }
  }

  if(command.accessDenied)return <p role="alert">Account access changed. Reopen your account to load the current address book.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {embedded ? <h2 className="text-xl font-semibold">Saved addresses</h2> : (
            <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Saved addresses</h1>
          )}
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            Home, work, or someone special. Save an address for an easier
            checkout.
          </p>
        </div>
        <Button
          ref={openButton}
          disabled={busy || command.blocked || !canSubmit}
          className="min-h-11 rounded-full px-5"
          onClick={() => {
            setError('');
            requestId.current = null;
            setEditing(null);
          }}
        >
          <Plus /> Add address
        </Button>
      </div>
      {status !== 'ready' ? <div className="mt-4">
        <output className="text-sm text-muted-foreground">{status === 'loading' ? 'Form configuration is loading.' : configMessage}</output>
        {status !== 'loading' ? <Button type="button" variant="outline" onClick={refresh} className="ml-3">Refresh form</Button> : null}
      </div> : null}
      {error ? (
        <p
          role="alert"
          ref={errorSummary}
          tabIndex={-1}
          className="mt-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {editing !== undefined ? (
        <form
          data-form-id="account.address"
          ref={addressForm}
          key={editing?.id ?? 'new'}
          onSubmit={save}
          onChange={() => { if (!busy&&!command.blocked) requestId.current = null; }}
          className="customer-form mt-7 rounded-2xl border bg-card p-6"
        >
          <fieldset disabled={command.blocked} className="contents">
      <FormGuide formId="account.address" />

          <div className="flex justify-between gap-4">
            <h2 className="font-heading text-2xl">
              {editing ? 'Edit address' : 'New address'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {setEditing(undefined);openButton.current?.focus();}}
              aria-label="Close form"
              disabled={busy||command.blocked}
            >
              <X />
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {config ? <div className="sm:col-span-2"><ConfiguredFields config={config} baseKeys={BASE_KEYS} errors={fieldErrors} /></div> : null}
            <Field
              name="label"
              label="Label"
              defaultValue={editing?.label ?? ''}
              placeholder="Home or Office"
              required
            />
            <Field
              name="recipientName"
              label="Recipient name"
              defaultValue={editing?.recipientName ?? ''}
              required
            />
            <Field
              name="phone"
              type="tel"
              autoComplete="tel"
              label="Recipient phone"
              defaultValue={editing?.phone ?? ''}
              placeholder="98XXXXXXXX"
              required
            />
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <select
                id="province"
                name="province"
                defaultValue={normalizeProvince(editing?.province ?? '') ?? 'Madhesh'}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {NEPAL_PROVINCES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <Field
              name="district"
              label="District"
              defaultValue={normalizeDistrict(editing?.district ?? '') ?? editing?.district ?? ''}
              list="address-districts"
              aria-describedby="address-district-help"
              required
            />
            <datalist id="address-districts">{Object.values(DISTRICTS_BY_PROVINCE).flat().map(name=><option key={name} value={name}>{name}</option>)}</datalist>
            <p id="address-district-help" className="text-xs text-muted-foreground sm:col-span-2">Choose a district in your selected province. For Nawalparasi and Rukum, choose East or West.</p>
            <Field
              name="municipality"
              label="Municipality / rural municipality"
              defaultValue={editing?.municipality ?? ''}
              required
            />
            <Field
              name="ward"
              label="Ward"
              inputMode="numeric"
              pattern="0?[1-9]|[1-9][0-9]"
              title="Ward number from 1 to 99"
              defaultValue={editing?.ward ?? ''}
            />
            <Field
              name="locality"
              label="Street, tole or locality"
              defaultValue={editing?.locality ?? ''}
              required
            />
            <Field
              name="landmark"
              label={fieldDisplay(config, 'landmark')?.label ?? 'Landmark'}
              defaultValue={editing?.landmark ?? ''}
              placeholder={fieldDisplay(config, 'landmark')?.placeholder}
              required={fieldDisplay(config, 'landmark')?.required ?? false}
              aria-required={fieldDisplay(config, 'landmark')?.required ?? false}
              aria-invalid={Boolean(fieldErrors.landmark)}
            />
            <Field
              name="postalCode"
              label="Postal code"
              defaultValue={editing?.postalCode ?? ''}
            />
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={Boolean(editing?.isDefault)}
                className="size-4 accent-primary"
              />{' '}
              Use as default
            </label>
            <LocationPicker key={editing?.id??"new"} initial={editing?.latitude!=null && editing?.longitude!=null ? {latitude:editing.latitude,longitude:editing.longitude}:undefined} />
              <div className="flex justify-end">
              <Button type="submit" disabled={busy || command.blocked || !canSubmit}>
                {busy ? 'Saving…' : 'Save address'}
              </Button>
            </div>
          </div>
          </fieldset>
        </form>
      ) : null}
      {addresses.length ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <article
              key={address.id}
              className={`rounded-2xl border bg-card p-5 ${address.isDefault ? 'border-primary/40' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-3">
                  <MapPin className="mt-1 size-5 text-primary" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{address.label}</h2>
                      {address.isDefault ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 break-words text-base leading-7 text-muted-foreground">
                      {address.recipientName} · {address.phone}
                      <br />
                      {address.locality}
                      {address.landmark ? `, near ${address.landmark}` : ''}
                      <br />
                      {address.municipality}, {address.district},{' '}
                      {address.province}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { requestId.current = null; setEditing(address); }}
                    disabled={busy||command.blocked}
                    aria-label={`Edit ${address.label}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(address)}
                    disabled={busy||command.blocked}
                    aria-label={`Delete ${address.label}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          <MapPin className="mx-auto mb-4 size-9 text-primary" />
          Your address book is waiting. Add your first delivery address above.
        </div>
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved address from your address book. Existing
              orders keep their original delivery details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep address</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy||command.blocked}
              onClick={() => {
                if (deleting) void remove(deleting.id);
              }}
            >
              {busy ? 'Removing…' : 'Remove address'}
            </AlertDialogAction>
          </AlertDialogFooter>
          <AccountCommandRecovery command={command}/>
        </AlertDialogContent>
      </AlertDialog>
      <AccountCommandRecovery command={command}/>
    </div>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
