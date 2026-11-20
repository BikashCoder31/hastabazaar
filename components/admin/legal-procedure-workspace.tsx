'use client';

import { useRef, useState } from 'react';
import { LegalProcedureControls } from './legal-procedure-controls';
import { completedOperatingSections } from '@/lib/legal-procedures/operating-procedure';
import type { LegalControlWorkspace } from '@/lib/legal-procedures/lifecycle-model';
import { LEGAL_SECTIONS, type LegalCompany, type LegalDraftSnapshot, type LegalDraftWorkspace,
  type LegalHistoryEntry, type LegalSection } from '@/lib/legal-procedures/model';

const endpoint = '/api/admin/legal-procedures';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold hover:border-primary/60 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const field = 'mt-2 w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const time = (value: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu',
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);

function CompanyDetails({ company, historical = false }: { company: LegalCompany; historical?: boolean }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label={historical ? 'Company details in this version' : 'Recorded company details'}>
    <h2 className="font-heading text-2xl">{historical ? 'Company details in this version' : 'Recorded company details'}</h2>
    <p className="mt-3 font-semibold">{company.legalName} <span className="font-normal text-muted-foreground">({company.nepaliName})</span></p>
    <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
      {[
        ['Brand', company.brandName], ['Company registration', company.registrationNumber],
        ['Registered with', company.registeringAuthority], ['Incorporated', company.incorporationDate],
        ['PAN', company.pan || 'Not yet confirmed'], ['Support email', company.supportEmail],
        ['Registered office', company.registeredOffice],
      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-semibold">{label}</dt><dd className="mt-1 break-words leading-6 text-muted-foreground">{value}</dd></div>)}
    </dl>
  </section>;
}
function DraftSections({ sections, prefix }: { sections: LegalSection[]; prefix: string }) {
  return <div className="space-y-5">
    <nav aria-label="Procedure sections" className="grid gap-2 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2">
      {LEGAL_SECTIONS.map(([id, title], index) => <a key={id} href={`#${prefix}-${id}`} className="rounded-lg px-2 py-2 font-medium text-primary hover:bg-secondary">{index + 1}. {title}</a>)}
    </nav>
    {sections.map((section, index) => <section key={section.id} id={`${prefix}-${section.id}`} className="scroll-mt-32 rounded-2xl border bg-card p-5 sm:p-6">
      <h3 className="font-heading text-xl sm:text-2xl">{index + 1}. {LEGAL_SECTIONS[index][1]}</h3>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{section.body}</p>
    </section>)}
  </div>;
}

export function LegalProcedureWorkspace({ initial, initialControl }: { initial: LegalDraftWorkspace; initialControl?: LegalControlWorkspace }) {
  const [current, setCurrent] = useState(initial.current);
  const [sections, setSections] = useState(() => initial.current.sections.map(section => ({ ...section })));
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'read' | 'edit' | 'preview' | 'history'>('read');
  const [history, setHistory] = useState(initial.history);
  const [nextBeforeRevision, setNextBeforeRevision] = useState(initial.nextBeforeRevision);
  const [selected, setSelected] = useState<LegalDraftSnapshot | 'legacy' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const dirty = JSON.stringify(sections) !== JSON.stringify(current.sections);

  async function readResponse<T>(response: Response): Promise<T> {
    const data = await response.json() as { error?: unknown };
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'The draft request failed. Your edits are kept.');
    return data as T;
  }
  async function save() {
    setError(''); setNotice(''); setBusy(true);
    const payload = { expectedRevision: current.revision, expectedSha256: current.sha256, sections, reason };
    const fingerprint = JSON.stringify(payload);
    if (pendingRequest.current?.fingerprint !== fingerprint)
      pendingRequest.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const data = await readResponse<{ saved: LegalDraftSnapshot }>(await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId: pendingRequest.current.requestId }), credentials: 'same-origin', cache: 'no-store' }));
      const saved = data.saved as LegalDraftSnapshot;
      setCurrent(saved); setSections(saved.sections.map(section => ({ ...section }))); setReason('');
      setHistory(previous => [{ id: saved.id, revision: saved.revision, actorName: saved.actorName,
        savedAt: saved.savedAt, reason: saved.reason, sha256: saved.sha256 }, ...previous.filter(entry => entry.id !== saved.id)]);
      pendingRequest.current = null; setMode('read');
      setNotice(`Version saved. Revision ${saved.revision} is retained in history. Approval and activation are separate actions.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The save failed. Your edits are kept.'); }
    finally { setBusy(false); }
  }
  async function viewRevision(revision: number) {
    setBusy(true); setError('');
    try {
      const data = await readResponse<{ version: LegalDraftSnapshot }>(await fetch(`${endpoint}?revision=${revision}`, { credentials: 'same-origin', cache: 'no-store' }));
      setSelected(data.version as LegalDraftSnapshot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That version is unavailable.'); }
    finally { setBusy(false); }
  }
  async function olderHistory() {
    if (nextBeforeRevision === null) return;
    setBusy(true); setError('');
    try {
      const data = await readResponse<LegalDraftWorkspace>(await fetch(`${endpoint}?beforeRevision=${nextBeforeRevision}`, { credentials: 'same-origin', cache: 'no-store' }));
      setHistory(previous => [...previous, ...data.history.filter(entry => !previous.some(old => old.id === entry.id))]);
      setNextBeforeRevision(data.nextBeforeRevision);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Older history is unavailable.'); }
    finally { setBusy(false); }
  }
  function historyEntry(entry: LegalHistoryEntry) {
    return <li key={entry.id} className="min-w-0 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Saved procedure · revision {entry.revision}</p>
        <p className="mt-1 text-sm text-muted-foreground">{entry.actorName} · {time(entry.savedAt)} Nepal time</p></div>
        <button type="button" disabled={busy} onClick={() => void viewRevision(entry.revision)} className={button}>View revision {entry.revision}</button></div>
      <p className="mt-3 break-words text-sm leading-6">{entry.reason}</p>
      <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-2">Content fingerprint</summary><code className="block break-all py-2">{entry.sha256}</code></details>
    </li>;
  }

  return <div className="min-w-0 space-y-5">
    <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20" aria-label="Draft status">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Working version · {current.revision ? `saved revision ${current.revision}` : 'retained source'}</h2><span className="rounded-full border border-amber-400/60 px-3 py-1 text-xs font-bold">VERSION MANAGEMENT</span></div>
      <p className="mt-3 text-sm leading-6">Edit and save a version, approve its exact text, then activate it for staff. Working changes do not replace the active procedure or change existing agreements and financial terms.</p>
      <p className="mt-2 text-xs leading-6">{current.revision ? 'Saved' : 'Prepared'}: {time(current.savedAt)} Nepal time · {current.actorName}</p>
    </section>
    <CompanyDetails company={current.company} />
    <section className="rounded-2xl border bg-card p-5 sm:p-6"><h2 className="font-heading text-2xl">Completed operating procedure</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">Use the complete wording for responsibilities, complaints, refunds, evidence, incidents, legal holds and controlled changes. Loading it fills the editor for review; it does not overwrite saved history or adopt a procedure.</p>
      <button type="button" disabled={busy || dirty} className={`${button} mt-3`} onClick={() => { setSections(completedOperatingSections()); setReason('Use the completed operating procedure with existing company details and recorded terms.'); setMode('edit'); setSelected(null); }}>Use completed procedure</button>
    </section>
    <LegalProcedureControls current={current} dirty={dirty} busy={busy} onBusyChange={setBusy} initial={initialControl} />
    <div className="flex flex-wrap gap-2" aria-label="Legal procedure views">
      {([['read', 'Read working version'], ['edit', 'Edit version'], ['preview', 'Preview changes'], ['history', 'Version history']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setSelected(null); }}
          className={`${button} ${mode === value ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card'}`}>{label}</button>)}
    </div>
    {dirty ? <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">You have unsaved procedure changes. They stay here while you preview or read history.</p> : null}
    {notice ? <output className="block rounded-xl border border-green-600/30 bg-green-50 p-4 text-sm leading-6 text-green-950">{notice}</output> : null}
    {error ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm leading-6"><p>{error}</p>
      <a href="/admin/legal-policies" target="_blank" rel="noopener" className="mt-2 inline-block font-semibold text-primary underline">Open the latest saved version in a new tab to compare</a></div> : null}
    {busy ? <output className="block text-sm text-muted-foreground">Loading or saving procedure…</output> : null}

    {mode === 'edit' || mode === 'preview' ? <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label="Save a draft version">
      <h2 className="font-heading text-2xl">Save a working version</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Only Super Admin can save. Add a reason so the next reviewer can understand the change.</p>
      <label className="mt-4 block text-sm font-semibold" htmlFor="legal-draft-reason">Reason for this version</label>
      <textarea id="legal-draft-reason" value={reason} maxLength={500} rows={2} onChange={event => setReason(event.target.value)} disabled={busy} className={field} placeholder="Explain what changed and why (8–500 characters)" />
      <button type="button" onClick={() => void save()} disabled={busy || reason.trim().length < 8 || (!dirty && current.revision > 0)}
        className={`${button} mt-3 border-primary bg-primary text-primary-foreground hover:bg-primary/90`}>Save version</button>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">Previous versions are retained. Approval and activation are recorded separately; company details come from the shared record.</p>
    </section> : null}

    {mode === 'read' ? <DraftSections sections={current.sections} prefix="procedure" /> : null}
    {mode === 'preview' ? <section aria-label="Unsaved draft preview" className="space-y-4"><h2 className="font-heading text-2xl">Preview · unsaved changes</h2><DraftSections sections={sections} prefix="preview" /></section> : null}
    {mode === 'edit' ? <section aria-label="Procedure text editor" className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Edit plain text. Line breaks are kept; HTML and link code are displayed as text. Each section allows up to 12,000 characters; the draft allows 60,000 in total.</p>
      {sections.map((section, index) => <details key={section.id} open={index === 0 ? true : undefined} className="rounded-2xl border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer py-1 text-lg font-semibold">{index + 1}. {LEGAL_SECTIONS[index][1]}</summary>
        <label htmlFor={`edit-${section.id}`} className="mt-4 block text-sm font-semibold">{LEGAL_SECTIONS[index][1]}</label>
        <textarea id={`edit-${section.id}`} value={section.body} rows={10} maxLength={12_000} disabled={busy}
          onChange={event => setSections(previous => previous.map((item, i) => i === index ? { ...item, body: event.target.value } : item))} className={field} />
      </details>)}
    </section> : null}
    {mode === 'history' ? <section aria-label="Draft version history" className="space-y-5">
      <div className="rounded-2xl border bg-card p-5 sm:p-6"><h2 className="font-heading text-2xl">Version history</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Saved versions are read-only. Dates are shown in Nepal time. Draft 3.0 is the retained original source and may contain older company disclosures.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void viewRevision(0)} className={button}>View source draft</button>
          <button type="button" disabled={busy} onClick={() => setSelected('legacy')} className={button}>View retained Draft 3.0</button></div>
        {history.length ? <ol className="mt-5 space-y-3">{history.map(historyEntry)}</ol> : <p className="mt-5 text-sm text-muted-foreground">No saved revisions yet. The source draft and original Draft 3.0 are available above.</p>}
        {nextBeforeRevision !== null ? <button type="button" disabled={busy} onClick={() => void olderHistory()} className={`${button} mt-4`}>Load older versions</button> : null}
      </div>
      {selected === 'legacy' ? <section className="rounded-2xl border bg-card p-5 sm:p-6"><h3 className="font-heading text-2xl">Draft 3.0</h3>
        <p className="mt-2 text-sm font-semibold">Original source retained · read-only</p><p className="mt-2 break-all text-xs text-muted-foreground">SHA-256: {initial.legacy.sha256}</p>
        <pre className="mt-5 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">{initial.legacy.markdown}</pre></section> : selected ?
        <div className="space-y-4"><section className="rounded-2xl border bg-card p-5"><h3 className="font-heading text-2xl">Saved procedure · revision {selected.revision}</h3>
          <p className="mt-2 text-sm font-semibold">Historical saved version · read-only</p><p className="mt-2 text-sm">{selected.actorName} · {time(selected.savedAt)} Nepal time</p>
          <p className="mt-2 break-words text-sm">{selected.reason}</p><p className="mt-2 break-all text-xs text-muted-foreground">SHA-256: {selected.sha256}</p></section>
          <CompanyDetails company={selected.company} historical /><DraftSections sections={selected.sections} prefix={`history-${selected.revision}`} /></div> : null}
    </section> : null}
  </div>;
}
