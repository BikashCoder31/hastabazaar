'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { draftFieldNames, draftFileNames, type DraftAnswers, type SellerDraft, type DraftSave } from '@/lib/sellers/draft-contract';
import type { PublishedFormConfig } from '@/lib/forms/types';

const endpoint = '/api/seller-applications/draft';
type DraftState = { status: 'loading' | 'ready' | 'dirty' | 'saving' | 'error' | 'conflict'; message: string; draft: SellerDraft | null };
type RouteValues = { registration: 'yes' | 'no'; applicant: 'individual' | 'company'; tax: 'business_pan_only' | 'vat_registered'; addressesMatch: boolean };
function readAnswers(form: HTMLFormElement, config: PublishedFormConfig): DraftAnswers {
  const allowed = new Set([...draftFieldNames, ...config.fields.filter(field => field.status === 'active').map(field => `custom.${field.key}`)]);
  const answers: DraftAnswers = {};
  const data = new FormData(form);
  for (const name of allowed) {
    const control = form.elements.namedItem(name);
    if (!control) continue;
    answers[name] = data.getAll(name).filter((value): value is string => typeof value === 'string');
  }
  return answers;
}
function restoreAnswers(form: HTMLFormElement, answers: DraftAnswers) {
  for (const control of Array.from(form.elements)) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    const values = answers[control.name];
    if (!values || control instanceof HTMLInputElement && ['file', 'hidden'].includes(control.type)) continue;
    if (control instanceof HTMLSelectElement) {
      for (const option of Array.from(control.options)) option.selected = values.includes(option.value);
    } else if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) control.checked = values.includes(control.value);
    else control.value = values[0] ?? '';
  }
}

export function useSellerDraft(formRef: RefObject<HTMLFormElement | null>, accountId: string | undefined,
  config: PublishedFormConfig | null, restoreRoute: (values: RouteValues) => void, enabled = true) {
  const [state, setState] = useState<DraftState>({ status: enabled ? 'loading' : 'ready', message: enabled ? 'Checking for saved progress…' : '', draft: null });
  const current = useRef(state);
  const busy = useRef<Promise<boolean> | null>(null);
  const sequence = useRef(0);
  const savedSequence = useRef(0);
  const uploadedFiles = useRef(new Map<string, File>());
  const removed = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoring = useRef(false);
  const stopped = useRef(false);
  const attempt = useRef<string | null>(null);
  const latest = useRef({ accountId, config, restoreRoute });
  useEffect(() => { latest.current = { accountId, config, restoreRoute }; }, [accountId, config, restoreRoute]);
  const update = useCallback((next: DraftState) => { current.current = next; setState(next); }, []);
  const headers = () => ({ 'X-Draft-Account': latest.current.accountId ?? '' });

  useEffect(() => {
    if (!enabled || !accountId || !config || current.current.status !== 'loading') return;
    const controller = new AbortController();
    fetch(endpoint, { headers: { 'X-Draft-Account': accountId }, cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json() as { error?: string; draft: SellerDraft | null }; if (!response.ok) throw new Error(body.error); return body.draft; })
      .then(draft => {
        if (controller.signal.aborted) return;
        attempt.current = draft?.attemptId ?? crypto.randomUUID();
        if (!draft || !formRef.current) { update({ status: 'ready', draft, message: 'Progress saves automatically to your account.' }); return; }
        restoring.current = true;
        const registration = draft.answers.hasBusinessTaxRegistration?.[0] === 'no' ? 'no' : 'yes';
        latest.current.restoreRoute({ registration, applicant: draft.answers.applicantType?.[0] === 'individual' ? 'individual' : 'company',
          tax: draft.answers.taxStatus?.[0] === 'vat_registered' ? 'vat_registered' : 'business_pan_only',
          addressesMatch: Boolean(draft.answers.pickupAddress?.[0] && draft.answers.pickupAddress[0] === draft.answers.returnAddress?.[0]) });
        requestAnimationFrame(() => {
          if (controller.signal.aborted) return;
          if (formRef.current) restoreAnswers(formRef.current, draft.answers);
          restoring.current = false;
          update({ status: 'ready', draft, message: `Saved progress restored. Please review your answers and accept the current terms again.${draft.formVersion !== latest.current.config?.version ? ' The form questions have changed since this draft was saved.' : ''}` });
        });
      }).catch(error => { if (!controller.signal.aborted) update({ status: 'error', draft: null, message: error instanceof Error ? error.message : 'Saved progress could not be loaded.' }); });
    return () => controller.abort();
  }, [accountId, config, formRef, update, enabled]);

  async function saveOnce(): Promise<boolean> {
    if (!enabled) return true;
    const form = formRef.current;
    const snapshot = current.current;
    if (!form || !latest.current.config || !latest.current.accountId || snapshot.status === 'loading' || snapshot.status === 'conflict' || stopped.current) return false;
    const atSequence = sequence.current;
    if (atSequence === savedSequence.current && snapshot.draft) return true;
    // If loading failed, never overwrite a possibly existing draft with an empty one.
    if (!attempt.current) { update({ ...snapshot, status: 'error', message: 'Reload to retrieve your saved draft before editing. Keep any unsaved answers on this page.' }); return false; }
    const input: DraftSave = { revision: snapshot.draft?.revision ?? null, changeId: crypto.randomUUID(), attemptId: attempt.current,
      formVersion: latest.current.config.version, answers: readAnswers(form, latest.current.config), files: {} };
    const data = new FormData();
    const newFiles = new Map<string, File>();
    for (const field of draftFileNames) {
      const control = form.elements.namedItem(field);
      if (!(control instanceof HTMLInputElement) || control.type !== 'file') continue;
      const file = control.files?.[0];
      const saved = snapshot.draft?.files[field];
      if (file?.size && uploadedFiles.current.get(field) !== file) { data.set(field, file); newFiles.set(field, file); }
      else if (saved && !removed.current.has(field)) input.files[field] = saved.id;
    }
    data.set('payload', JSON.stringify(input));
    update({ ...snapshot, status: 'saving', message: 'Saving progress… Please keep this page open.' });
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: headers(), body: data });
      const body = await response.json() as { error?: string; draft: SellerDraft };
      if (!response.ok) {
        update({ ...snapshot, status: response.status === 409 ? 'conflict' : 'error', message: body.error ?? 'Progress could not be saved. Please retry before leaving.' });
        return false;
      }
      const draft = body.draft as SellerDraft;
      for (const [field, file] of newFiles) uploadedFiles.current.set(field, file);
      savedSequence.current = atSequence;
      update({ draft, status: atSequence === sequence.current ? 'ready' : 'dirty', message: atSequence === sequence.current ? 'Progress saved to your account.' : 'New changes are waiting to save…' });
      return true;
    } catch {
      // Read back the operation token after an uncertain response. Never retry
      // blindly against a revision that might already have committed.
      try {
        const response = await fetch(endpoint, { headers: headers(), cache: 'no-store' });
        const body = await response.json() as { draft?: SellerDraft | null };
        if (response.ok && body.draft?.revision === input.changeId) {
          for (const [field, file] of newFiles) uploadedFiles.current.set(field, file);
          savedSequence.current = atSequence;
          update({ draft: body.draft, status: atSequence === sequence.current ? 'ready' : 'dirty', message: 'Saved progress recovered.' });
          return true;
        }
      } catch { /* The page retains all answers and files for an explicit retry. */ }
      update({ ...snapshot, status: 'error', message: 'Saving could not be confirmed. Keep this page open and retry saving before leaving.' });
      return false;
    }
  }
  const saveRef = useRef(saveOnce);
  useEffect(() => { saveRef.current = saveOnce; });
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (busy.current) await busy.current;
    if (stopped.current) return false;
    const run = async () => {
      do { if (!await saveRef.current()) return false; }
      while (savedSequence.current !== sequence.current && !stopped.current);
      return true;
    };
    if (busy.current) return busy.current;
    busy.current = run();
    try { return await busy.current; } finally { busy.current = null; }
  }, []);
  const changed = useCallback(() => {
    if (!enabled) return;
    if (restoring.current || stopped.current) return;
    sequence.current++;
    if (current.current.status === 'loading' || current.current.status === 'conflict') return;
    update({ ...current.current, status: 'dirty', message: 'Changes not saved yet…' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 1200);
  }, [flush, update, enabled]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (sequence.current !== savedSequence.current && !stopped.current) event.preventDefault();
    };
    const followLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (!link || link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || sequence.current === savedSequence.current || stopped.current) return;
      event.preventDefault(); event.stopPropagation();
      void flush().then(saved => { if (saved) window.location.assign(link.href); });
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', followLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', followLink, true); if (timer.current) clearTimeout(timer.current); };
  }, [flush]);

  async function attachSavedFiles(data: FormData) {
    for (const [name, file] of Object.entries(current.current.draft?.files ?? {})) {
      const control = formRef.current?.elements.namedItem(name);
      if (!(control instanceof HTMLInputElement) || removed.current.has(name)) continue;
      const selected = data.get(name);
      if (selected instanceof File && selected.size) continue;
      const response = await fetch(`${endpoint}?file=${encodeURIComponent(file.id)}`, { headers: headers(), cache: 'no-store' });
      if (!response.ok) throw new Error('A saved document could not be loaded. Attach it again before submitting.');
      data.set(name, new File([await response.blob()], file.name, { type: file.type }));
    }
  }
  async function confirmedSubmission() {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    const draft = current.current.draft;
    if (draft) await fetch(endpoint, { method: 'DELETE', headers: { ...headers(), 'If-Match': draft.revision } }).catch(() => undefined);
  }
  function removeFile(name: string) {
    removed.current.add(name); uploadedFiles.current.delete(name);
    const field = formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = '';
    const draft = current.current.draft;
    if (draft) { const files = { ...draft.files }; delete files[name]; update({ ...current.current, draft: { ...draft, files } }); }
    changed();
  }
  return { ...state, changed, flush, removeFile, attachSavedFiles, confirmedSubmission,
    attemptId: () => attempt.current, canEdit: state.status !== 'loading', hasUnsaved: ['dirty', 'saving', 'error', 'conflict'].includes(state.status) };
}
