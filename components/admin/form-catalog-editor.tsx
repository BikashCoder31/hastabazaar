'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { FormCatalogPreview } from '@/components/admin/form-catalog-preview';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ConfiguredField, CustomFieldType, FormConfigDraft, FormDefinition } from '@/lib/forms/types';
import { validateFormDraftForDefinition } from '@/lib/forms/validation';

export interface CatalogVersion {
  id: string;
  version: number;
  revision: number;
  status: 'draft' | 'published';
  reason: string;
  updatedAt: number;
  publishedAt: number | null;
  config: FormConfigDraft;
}

const choicesType = (type: CustomFieldType) => type === 'single_choice' || type === 'multiple_choice';
const canonicalKey = (key: string) => key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
const readChoiceDraft = (drafts: Readonly<Record<string, string>>, id: string) => Object.hasOwn(drafts, id) && typeof drafts[id] === 'string' ? drafts[id] : undefined;
const parseChoices = (raw: string) => raw.split('\n').filter((line) => line.trim()).map((line) => {
  const [value, ...label] = line.split('|');
  return { value: value.trim(), label: label.join('|').trim() };
});
const ordered = (fields: readonly ConfiguredField[]) => fields.toSorted((a, b) => a.order - b.order);
const normalized = (fields: readonly ConfiguredField[]) => fields.map((field, order) => ({ ...field, order }));
// Stored array position is not configured order. Stable sorting also preserves ties.
const canonicalFields = (fields: readonly ConfiguredField[]) => normalized(ordered(fields));
const newest = (versions: readonly CatalogVersion[], status: CatalogVersion['status']) => versions.find((item) => item.status === status);
const currentDraft = (versions: readonly CatalogVersion[]) => {
  const draft = newest(versions, 'draft');
  const published = newest(versions, 'published');
  return draft && draft.version > (published?.version ?? 0) ? draft : undefined;
};
const displayDate = (value: number) => new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' }).format(new Date(value));

export function FormCatalogEditor({ form, versions: initialVersions }: { form: FormDefinition; versions: readonly CatalogVersion[] }) {
  const [versions, setVersions] = useState(initialVersions);
  const first = currentDraft(initialVersions) ?? newest(initialVersions, 'published');
  const [fields, setFields] = useState<readonly ConfiguredField[]>(() => canonicalFields(first?.config.fields ?? []));
  const [savedFields, setSavedFields] = useState(() => JSON.stringify(canonicalFields(first?.config.fields ?? [])));
  const [choiceDrafts, setChoiceDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>(form.capabilities.customFieldTypes[0] ?? 'short_text');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const [conflict, setConflict] = useState<'draft' | 'publish' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacingHistory, setReplacingHistory] = useState(false);
  const [uncertainAction, setUncertainAction] = useState<'draft' | 'publish' | 'restore' | null>(null);
  const [dialog, setDialog] = useState<'publish' | 'restore' | null>(null);
  const [fieldWarning, setFieldWarning] = useState<{ id: string; label: string; action: 'optional' | 'archive' } | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const dialogErrorRef = useRef<HTMLDivElement>(null);
  const pendingRequest = useRef<{ action: 'draft' | 'publish' | 'restore'; body: string } | null>(null);
  const historyGeneration = useRef(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const pending = form.adapterId.startsWith('pending:');
  const customTypes = form.capabilities.customFieldTypes;
  const published = newest(versions, 'published');
  const draft = currentDraft(versions);
  const editLocked = busy || replacingHistory || uncertainAction !== null;
  const dirty = JSON.stringify(fields) !== savedFields;
  const canPublish = !!draft && !dirty && !conflict && JSON.stringify(fields) === JSON.stringify(canonicalFields(draft.config.fields));
  const baseKeys = new Set(form.baseFields.map((item) => canonicalKey(item.key)));
  const customFields = ordered(fields.filter((field) => !baseKeys.has(canonicalKey(field.key))));
  const previewConfig = { formId: form.id, version: published?.version ?? 0, publishedAt: published?.publishedAt ?? 0, fields };

  function announce(problem: string, focus?: HTMLElement | null) {
    setMessage(''); setError(problem);
    queueMicrotask(() => (focus ?? errorRef.current)?.focus());
  }
  function replaceField(id: string, change: Partial<ConfiguredField>) {
    if (editLocked) return;
    setFields((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
    setError('');
  }
  function move(id: string, direction: -1 | 1) {
    const list = ordered(fields);
    const customIndex = customFields.findIndex((item) => item.id === id);
    const neighbor = customFields[customIndex + direction];
    if (customIndex < 0 || !neighbor) return;
    const index = list.findIndex((item) => item.id === id);
    const target = list.findIndex((item) => item.id === neighbor.id);
    [list[index], list[target]] = [list[target], list[index]];
    // This explicit user move defines a new sequence; retain the built-in slots.
    setFields(normalized(list));
  }
  function addField() {
    const key = newKey.trim();
    const label = newLabel.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key) || fields.some((item) => canonicalKey(item.key) === canonicalKey(key)) || baseKeys.has(canonicalKey(key))) {
      announce('Enter a unique field key using lowercase letters, numbers, and underscores.', keyRef.current); return;
    }
    if (!label) { announce('Enter a label for the new field.', labelRef.current); return; }
    const item: ConfiguredField = { id: key, key, label, type: newType, required: false, order: fields.length, status: 'active', ...(choicesType(newType) ? { choices: [{ value: 'first', label: 'First option' }, { value: 'second', label: 'Second option' }] } : {}) };
    setFields((current) => canonicalFields([...current, item]));
    setNewKey(''); setNewLabel(''); setError('');
  }
  async function reload({ keepEdits = true, resolveConflict = false, success, warning = 'Version history could not refresh. Try again.' }: {
    keepEdits?: boolean; resolveConflict?: boolean; success?: string; warning?: string;
  } = {}) {
    const generation = ++historyGeneration.current;
    // Replacing fields must exclude edits for the entire GET, just like a write.
    // Keep this separate from POST busy state and non-replacing history refreshes.
    if (!keepEdits) setReplacingHistory(true);
    try {
      const response = await fetch(`/api/admin/forms/${encodeURIComponent(form.id)}`, { cache: 'no-store' });
      const body = await response.json() as { versions?: CatalogVersion[]; error?: string };
      if (generation !== historyGeneration.current) return;
      if (!response.ok || !body.versions) throw new Error(body.error ?? 'Could not reload form history.');
      setVersions(body.versions);
      if (!keepEdits) {
        const selected = currentDraft(body.versions) ?? newest(body.versions, 'published');
        const next = canonicalFields(selected?.config.fields ?? []);
        setFields(next); setSavedFields(JSON.stringify(next)); setChoiceDrafts({});
      }
      if (resolveConflict) setConflict(null);
      setRefreshWarning('');
      setMessage(success ?? (keepEdits ? 'Latest version loaded. Your edits are still here; review them before saving again.' : 'Latest version loaded. Review the fields and preview before publishing.'));
      setError('');
    } catch {
      if (generation === historyGeneration.current) setRefreshWarning(warning);
    } finally {
      if (!keepEdits) setReplacingHistory(false);
    }
  }
  async function mutate(action: 'draft' | 'publish' | 'restore', extra: Record<string, unknown>) {
    if (replacingHistory) return;
    if (pendingRequest.current && pendingRequest.current.action !== action) return;
    ++historyGeneration.current;
    const request = pendingRequest.current ?? { action, body: JSON.stringify({ requestId: crypto.randomUUID(), expectedPublishedVersion: published?.version ?? 0, reason: reason.trim(), ...extra }) };
    pendingRequest.current = request;
    setBusy(true); setError(''); setDialogError(''); setMessage(''); setRefreshWarning('');
    try {
      const response = await fetch(`/api/admin/forms/${encodeURIComponent(form.id)}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: request.body,
      });
      if (!response.ok) {
        // A server failure can follow a committed write. Only a definite rejection
        // releases the saved request; retryable responses must replay it verbatim.
        if (response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)) {
          pendingRequest.current = null; setUncertainAction(null);
        }
        const rejected = await response.json().catch(() => ({})) as { error?: string };
        if (response.status === 409) setConflict(action);
        throw new Error(rejected.error ?? `Could not ${action} form.`);
      }
      const body = await response.json() as { draft?: CatalogVersion; published?: CatalogVersion };
      if ((action === 'draft' && !body.draft) || (action !== 'draft' && !body.published)) throw new Error('The server response could not confirm this change. Retry the same request.');
      // A committed mutation supersedes every history request started before it completed.
      ++historyGeneration.current;
      pendingRequest.current = null; setUncertainAction(null);
      if (action === 'draft' && body.draft) {
        const saved = body.draft;
        setVersions((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
        const next = canonicalFields(saved.config.fields);
        setFields(next);
        setSavedFields(JSON.stringify(next));
        setChoiceDrafts({});
      }
      if (body.published) {
        const publishedResult = body.published;
        setVersions((current) => [publishedResult, ...current.filter((entry) => entry.id !== publishedResult.id)]);
        if (action === 'restore') {
          const next = canonicalFields(publishedResult.config.fields);
          setFields(next);
          setSavedFields(JSON.stringify(next));
          setChoiceDrafts({});
        }
      }
      setConflict(null);
      setDialog(null); setReason(''); setRestoreVersion(null);
      const success = action === 'draft' ? 'Draft saved.' : action === 'publish' ? 'Form published.' : 'Historical version restored as a new publication.';
      setMessage(success);
      void reload({ success, warning: `${action === 'draft' ? 'The draft was saved' : action === 'publish' ? 'The form was published' : 'The form was restored'}, but version history could not refresh.` });
    } catch (caught) {
      if (pendingRequest.current) setUncertainAction(action);
      const detail = caught instanceof Error ? caught.message : 'Form catalog is unavailable.';
      const problem = pendingRequest.current ? `${detail} Request outcome is unknown; retry the same request.` : detail;
      if (dialog) {
        setDialogError(problem);
        queueMicrotask(() => dialogErrorRef.current?.focus());
      } else announce(problem);
    }
    finally { setBusy(false); }
  }
  function validReason() {
    if (reason.trim()) return true;
    if (dialog) {
      setDialogError('Enter a reason for this change.');
      queueMicrotask(() => dialogErrorRef.current?.focus());
    } else announce('Enter a reason for this change.', reasonRef.current);
    return false;
  }
  function save() {
    if (pendingRequest.current?.action === 'draft') { void mutate('draft', {}); return; }
    if (uncertainAction) return;
    if (!validReason()) return;
    const config = { formId: form.id, fields: canonicalFields(fields.map((field) => {
      const raw = readChoiceDraft(choiceDrafts, field.id);
      return raw === undefined ? field : { ...field, choices: parseChoices(raw) };
    })) };
    try { validateFormDraftForDefinition(form, config, !pending); }
    catch (caught) { announce(caught instanceof Error ? caught.message : 'Review the field settings.'); return; }
    void mutate('draft', { config, ...(draft ? { draftId: draft.id, expectedDraftRevision: draft.revision } : {}) });
  }
  function confirm() {
    if (pendingRequest.current && pendingRequest.current.action === dialog) { void mutate(pendingRequest.current.action, {}); return; }
    if (!validReason()) return;
    if (dialog === 'publish' && draft && canPublish) void mutate('publish', { draftId: draft.id, expectedDraftRevision: draft.revision });
    if (dialog === 'restore' && restoreVersion !== null) void mutate('restore', { sourceVersion: restoreVersion });
  }
  function confirmFieldWarning() {
    if (!fieldWarning) return;
    replaceField(fieldWarning.id, fieldWarning.action === 'optional' ? { required: false } : { status: 'archived' });
    setFieldWarning(null);
  }

  const uncertaintyNotice = uncertainAction ? <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
    <p>The request outcome is unknown. Editing is locked to preserve the submitted change. Use {uncertainAction === 'draft' ? 'Save draft' : `Confirm ${uncertainAction}`} to retry the same request.</p>
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reload({ success: 'Version history refreshed. Retry the same request to confirm its outcome.' })}>Refresh version history</Button>
    {dialog ? <output aria-live="polite">{message}</output> : null}
    {refreshWarning ? <p role="alert">{refreshWarning}</p> : null}
  </div> : null;

  return <div className="grid min-w-0 gap-5" aria-busy={busy || replacingHistory}>
    <Card>
      <CardHeader>
        <CardTitle>Form capability</CardTitle>
        <CardDescription>{form.capabilities.explanation}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Badge variant={pending ? 'secondary' : 'default'}>{pending ? 'Adapter pending' : 'Adapter connected'}</Badge>
        <Badge variant="outline">{form.capabilities.answerBehavior === 'query' ? 'Query criteria' : form.capabilities.answerBehavior === 'none' ? 'No answers stored' : 'Record linked answers'}</Badge>
        <span className="min-w-0 break-all text-xs text-muted-foreground">{form.route}</span>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Fields</CardTitle>
        <CardDescription>Protected fields keep their server rules. Archived custom fields remain in version history and old answers.</CardDescription>
      </CardHeader>
      <fieldset disabled={editLocked} aria-busy={editLocked} className="min-w-0">
      <CardContent className="grid min-w-0 gap-4">
        {form.baseFields.map((base) => {
          const item = fields.find((field) => canonicalKey(field.key) === canonicalKey(base.key));
          const editable = !pending && base.capability !== 'protected' && customTypes.includes(base.type as CustomFieldType) && typeof base.required === 'boolean' && base.status === 'active';
          const reasonLocked = base.capability === 'protected' ? base.explanation : pending ? 'This form has no connected server adapter yet.' : 'The adapter keeps this built-in field’s required and visibility rules.';
          return <div key={base.key} className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0"><p className="font-medium">{item?.label ?? base.label}</p><p className="break-words text-xs text-muted-foreground">Built-in · {base.key}</p><p className="mt-1 text-xs text-muted-foreground">{reasonLocked}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" aria-label={`Required for ${base.label}`} disabled title={reasonLocked}>{base.required ? 'Required' : 'Optional'}</Button>
              {editable ? <Button type="button" variant="outline" size="sm" onClick={() => setFields((current) => current.some((field) => canonicalKey(field.key) === canonicalKey(base.key)) ? current : canonicalFields([...current, { id: canonicalKey(base.key), key: canonicalKey(base.key), type: base.type as CustomFieldType, label: base.label, required: base.required ?? false, status: 'active', order: current.length, ...(base.choices ? { choices: base.choices } : {}), ...(base.min !== undefined ? { min: base.min } : {}), ...(base.max !== undefined ? { max: base.max } : {}), ...(base.integerOnly !== undefined ? { integerOnly: base.integerOnly } : {}) }]))}>Edit display</Button> : null}
            </div>
            {item && editable ? <FieldGroup className="sm:col-span-2">
              <Field><FieldLabel htmlFor={`base-${base.key}-label`}>Label</FieldLabel><Input id={`base-${base.key}-label`} value={item.label} onChange={(event) => replaceField(item.id, { label: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor={`base-${base.key}-help`}>Help text</FieldLabel><Input id={`base-${base.key}-help`} value={item.helpText ?? ''} onChange={(event) => replaceField(item.id, { helpText: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor={`base-${base.key}-placeholder`}>Placeholder</FieldLabel><Input id={`base-${base.key}-placeholder`} value={item.placeholder ?? ''} onChange={(event) => replaceField(item.id, { placeholder: event.target.value })} /></Field>
            </FieldGroup> : null}
          </div>;
        })}
        {customFields.map((field, index) => <div key={field.id} className="grid min-w-0 gap-3 rounded-lg border p-3" data-editor-field={field.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words">{field.label}</strong><Badge variant={field.status === 'archived' ? 'secondary' : 'outline'}>{field.status}</Badge></div><span className="text-xs text-muted-foreground">{field.key} · {field.type.replaceAll('_', ' ')}</span></div>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`${field.id}-label`}>Label</FieldLabel><Input id={`${field.id}-label`} value={field.label} onChange={(event) => replaceField(field.id, { label: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor={`${field.id}-placeholder`}>Placeholder</FieldLabel><Input id={`${field.id}-placeholder`} value={field.placeholder ?? ''} onChange={(event) => replaceField(field.id, { placeholder: event.target.value })} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor={`${field.id}-help`}>Help text</FieldLabel><Input id={`${field.id}-help`} value={field.helpText ?? ''} onChange={(event) => replaceField(field.id, { helpText: event.target.value })} /></Field>
            {choicesType(field.type) ? <Field className="sm:col-span-2"><FieldLabel htmlFor={`${field.id}-choices`}>Choices (value | label, one per line)</FieldLabel><Textarea id={`${field.id}-choices`} value={readChoiceDraft(choiceDrafts, field.id) ?? field.choices?.map((choice) => `${choice.value} | ${choice.label}`).join('\n') ?? ''} onChange={(event) => setChoiceDrafts((current) => ({ ...current, [field.id]: event.target.value }))} onBlur={(event) => replaceField(field.id, { choices: parseChoices(event.target.value) })} /></Field> : null}
            {field.type === 'number' ? <>
              <Field><FieldLabel htmlFor={`${field.id}-min`}>Minimum</FieldLabel><Input id={`${field.id}-min`} type="number" value={field.min ?? ''} onChange={(event) => replaceField(field.id, { min: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
              <Field><FieldLabel htmlFor={`${field.id}-max`}>Maximum</FieldLabel><Input id={`${field.id}-max`} type="number" value={field.max ?? ''} onChange={(event) => replaceField(field.id, { max: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
              <Field orientation="horizontal" className="sm:col-span-2"><Checkbox id={`${field.id}-integer-only`} checked={field.integerOnly ?? false} disabled={editLocked} onCheckedChange={(checked) => replaceField(field.id, { integerOnly: checked })} /><FieldLabel htmlFor={`${field.id}-integer-only`}>Whole numbers only</FieldLabel></Field>
            </> : null}
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={field.required ? 'secondary' : 'outline'} size="sm" aria-label={`Required for ${field.label}`} aria-pressed={field.required} disabled={field.status === 'archived'} onClick={() => field.required ? setFieldWarning({ id: field.id, label: field.label, action: 'optional' }) : replaceField(field.id, { required: true })}>{field.required ? 'Required' : 'Optional'}</Button>
            <Button type="button" variant="ghost" size="sm" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => move(field.id, -1)}><ArrowUp data-icon="inline-start" /> Up</Button>
            <Button type="button" variant="ghost" size="sm" aria-label={`Move ${field.label} down`} disabled={index === customFields.length - 1} onClick={() => move(field.id, 1)}><ArrowDown data-icon="inline-start" /> Down</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => field.status === 'active' && field.required ? setFieldWarning({ id: field.id, label: field.label, action: 'archive' }) : replaceField(field.id, { status: field.status === 'active' ? 'archived' : 'active' })}>{field.status === 'active' ? <Trash2 data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}{field.status === 'active' ? 'Archive' : 'Reactivate'}</Button>
          </div>
        </div>)}
      </CardContent>
      <CardFooter className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field><FieldLabel htmlFor="new-field-key">New field key</FieldLabel><Input ref={keyRef} id="new-field-key" value={newKey} onChange={(event) => setNewKey(event.target.value)} disabled={pending || customTypes.length === 0} placeholder="e.g. delivery_note" /></Field>
        <Field><FieldLabel htmlFor="new-field-label">Label</FieldLabel><Input ref={labelRef} id="new-field-label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} disabled={pending || customTypes.length === 0} /></Field>
        <Field><FieldLabel htmlFor="new-field-type">Type</FieldLabel><select id="new-field-type" className="h-8 rounded-md border bg-background px-2" value={newType} onChange={(event) => setNewType(event.target.value as CustomFieldType)} disabled={pending || customTypes.length === 0}>{customTypes.length ? customTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>) : <option value="short_text">Unavailable</option>}</select></Field>
        <Button type="button" variant="outline" className="sm:col-span-3 sm:justify-self-start" disabled={pending || customTypes.length === 0} onClick={addField}><Plus data-icon="inline-start" /> Add field</Button>
        {pending || customTypes.length === 0 ? <p className="text-xs text-muted-foreground sm:col-span-3">New fields are unavailable until a server adapter defines accepted field types and answer behavior.</p> : null}
      </CardFooter>
      </fieldset>
    </Card>

    <Card>
      <CardHeader><CardTitle>Preview</CardTitle><CardDescription>The draft uses the same configured field renderer as live forms. Built-in controls are illustrative; their server rules stay in place.</CardDescription></CardHeader>
      <CardContent><Tabs defaultValue="phone"><TabsList aria-label="Preview width"><TabsTrigger value="phone">Phone</TabsTrigger><TabsTrigger value="desktop">Desktop</TabsTrigger></TabsList><TabsContent value="phone" className="pt-4"><FormCatalogPreview form={form} config={previewConfig} mode="phone" /></TabsContent><TabsContent value="desktop" className="pt-4"><FormCatalogPreview form={form} config={previewConfig} mode="desktop" /></TabsContent></Tabs></CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Save and publish</CardTitle><CardDescription>Save a draft before publishing. Publication changes new visits to {form.route}.</CardDescription></CardHeader>
      <CardContent><FieldGroup><Field><FieldLabel htmlFor="catalog-reason">Reason for change</FieldLabel><Textarea ref={reasonRef} id="catalog-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} aria-required="true" disabled={editLocked} /><FieldDescription>Recorded in the form catalog audit history.</FieldDescription></Field>
        <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="text-sm text-destructive focus:outline-none">{error ? <FieldError>{error}</FieldError> : null}</div>
        {uncertainAction === 'draft' ? uncertaintyNotice : null}
        {refreshWarning && !uncertainAction ? <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"><span>{refreshWarning}</span><Button type="button" variant="outline" size="sm" disabled={editLocked} onClick={() => void reload()}>Retry history refresh</Button></div> : null}
        <output aria-live="polite" className="text-sm text-muted-foreground">{replacingHistory ? 'Loading latest version…' : busy ? 'Updating form…' : dialog ? '' : message}</output>
        {conflict ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 p-3"><p className="text-sm">The catalog changed. Your edits are preserved.{conflict === 'publish' ? ' Reload to replace the displayed fields with the latest server draft and review it before publishing.' : ''}</p><Button type="button" variant="outline" disabled={editLocked} onClick={() => void reload({ keepEdits: conflict !== 'publish', resolveConflict: true })}>Reload latest version</Button></div> : null}
      </FieldGroup></CardContent>
      <CardFooter className="flex flex-wrap gap-2"><Button type="button" onClick={save} disabled={busy || replacingHistory || (uncertainAction !== null && uncertainAction !== 'draft')}><Save data-icon="inline-start" /> Save draft</Button><Button type="button" variant="secondary" disabled={!canPublish || editLocked} onClick={() => { if (validReason()) setDialog('publish'); }}><Send data-icon="inline-start" /> Publish draft</Button>{dirty || (draft && !conflict && !canPublish) ? <span className="text-xs text-muted-foreground">Save your latest edits before publishing.</span> : null}</CardFooter>
    </Card>

    <Card>
      <CardHeader><CardTitle>Version history</CardTitle><CardDescription>Restoring a published version creates a new publication. Existing answers stay with their original version.</CardDescription></CardHeader>
      <CardContent className="grid gap-2">{versions.length ? versions.map((entry) => <div key={entry.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b py-2 last:border-b-0"><div className="min-w-0"><p className="font-medium">Version {entry.version} · revision {entry.revision} <Badge variant={entry.status === 'published' ? 'default' : 'secondary'}>{entry.status === 'draft' && entry.version <= (published?.version ?? 0) ? 'stale draft' : entry.status}</Badge></p><p className="break-words text-xs text-muted-foreground">{entry.reason} · {displayDate(entry.updatedAt)}</p></div>{entry.status === 'published' ? <Button type="button" size="sm" variant="outline" disabled={editLocked} onClick={() => { setRestoreVersion(entry.version); if (validReason()) setDialog('restore'); }}><RotateCcw data-icon="inline-start" /> Restore</Button> : null}</div>) : <p className="text-sm text-muted-foreground">No saved versions yet.</p>}</CardContent>
    </Card>

    <AlertDialog open={dialog !== null} onOpenChange={(open) => { if (!open && !editLocked) { setDialog(null); setDialogError(''); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{dialog === 'publish' ? 'Publish this form draft?' : `Restore version ${restoreVersion}?`}</AlertDialogTitle><AlertDialogDescription>{dialog === 'publish' ? `New visits to ${form.route} will use this draft. Reason: ${reason.trim()}` : `A new published version will copy the selected historical configuration for ${form.route}. Reason: ${reason.trim()}`}</AlertDialogDescription></AlertDialogHeader><div ref={dialogErrorRef} tabIndex={-1} role="alert" aria-live="assertive" className="text-sm text-destructive focus:outline-none">{dialogError}</div>{uncertaintyNotice}<AlertDialogFooter><AlertDialogCancel disabled={editLocked}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || (dialog === 'publish' && !canPublish && uncertainAction !== 'publish')} onClick={confirm}>{dialog === 'publish' ? 'Confirm publish' : 'Confirm restore'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={fieldWarning !== null} onOpenChange={(open) => { if (!open) setFieldWarning(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{fieldWarning?.action === 'archive' ? `Archive required field ${fieldWarning.label}?` : `Make required field ${fieldWarning?.label} optional?`}</AlertDialogTitle><AlertDialogDescription>{fieldWarning?.action === 'archive' ? 'New submissions will not show this field. Existing answers remain available with their original form version.' : 'New submissions may omit this field. Existing answers and historical form versions are unchanged.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmFieldWarning}>{fieldWarning?.action === 'archive' ? 'Confirm archive' : 'Confirm optional'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
