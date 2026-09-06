'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { GovernanceOverview } from '@/lib/db/repositories/operations';

export function GovernanceConsole({
  data,
  superAdmin,
}: {
  data: GovernanceOverview;
  superAdmin: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/admin/governance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, data, requestId: crypto.randomUUID() }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) return setMessage(body.error ?? 'Operation failed.');
    setMessage('Saved successfully.');
    router.refresh();
  }
  function createRule(form: FormData) {
    return send('rule.create', Object.fromEntries(form));
  }
  function createPromotion(form: FormData) {
    const startsAt = form.get('startsAt');
    const endsAt = form.get('endsAt');
    return send('promotion.create', {
      nameEn: form.get('nameEn'),
      nameNe: form.get('nameNe'),
      placement: form.get('placement'),
      startsAt:
        typeof startsAt === 'string'
          ? new Date(startsAt).getTime()
          : Number.NaN,
      endsAt:
        typeof endsAt === 'string' ? new Date(endsAt).getTime() : Number.NaN,
      note: form.get('note'),
      productIds: form.getAll('productIds'),
    });
  }
  function createIncident(form: FormData) {
    return send('incident.create', Object.fromEntries(form));
  }
  function verifyBackup(form: FormData) {
    return send('backup.verify', Object.fromEntries(form));
  }
  return (
    <div className="space-y-8">
      {message ? (
        <output className="block rounded-lg border bg-card p-3 text-sm">
          {message}
        </output>
      ) : null}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-2xl">
          Prohibited & restricted products
        </h2>
        <form action={createRule} className="mt-4 grid gap-2 md:grid-cols-3">
          <input
            name="code"
            required
            placeholder="Rule code"
            className="rounded-lg border p-2"
          />
          <input
            name="titleEn"
            required
            placeholder="English title"
            className="rounded-lg border p-2"
          />
          <input
            name="titleNe"
            required
            placeholder="नेपाली शीर्षक"
            className="rounded-lg border p-2"
          />
          <textarea
            name="descriptionEn"
            required
            placeholder="English guidance"
            className="rounded-lg border p-2"
          />
          <textarea
            name="descriptionNe"
            required
            placeholder="नेपाली मार्गदर्शन"
            className="rounded-lg border p-2"
          />
          <select name="severity" className="rounded-lg border p-2">
            <option value="prohibited">Prohibited</option>
            <option value="restricted">Restricted</option>
          </select>
          <button
            disabled={busy}
            className="rounded-lg bg-primary p-2 font-semibold text-primary-foreground"
          >
            Add rule
          </button>
        </form>
        <div className="mt-5 space-y-2">
          {data.rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"
            >
              <span>
                <strong>
                  {rule.code}: {rule.titleEn}
                </strong>
                <small className="ml-2">
                  {rule.titleNe} · {rule.severity}
                </small>
              </span>
              <button
                onClick={() =>
                  send('rule.toggle', { id: rule.id, isActive: !rule.isActive })
                }
                className="rounded-lg border px-3 py-2"
              >
                {rule.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-2xl">
          Promotions & featured placement
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin prepares; a different Super Admin approves.
        </p>
        <form
          action={createPromotion}
          className="mt-4 grid gap-2 md:grid-cols-3"
        >
          <input
            name="nameEn"
            required
            placeholder="English name"
            className="rounded-lg border p-2"
          />
          <input
            name="nameNe"
            required
            placeholder="नेपाली नाम"
            className="rounded-lg border p-2"
          />
          <select name="placement" className="rounded-lg border p-2">
            <option value="homepage">Homepage</option>
            <option value="shop">Shop</option>
          </select>
          <input
            name="startsAt"
            type="datetime-local"
            required
            className="rounded-lg border p-2"
          />
          <input
            name="endsAt"
            type="datetime-local"
            required
            className="rounded-lg border p-2"
          />
          <input
            name="note"
            required
            minLength={8}
            placeholder="Campaign rationale"
            className="rounded-lg border p-2"
          />
          <select
            name="productIds"
            multiple
            className="min-h-28 rounded-lg border p-2 md:col-span-2"
          >
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nameEn}
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            className="rounded-lg bg-primary p-2 font-semibold text-primary-foreground"
          >
            Submit for approval
          </button>
        </form>
        <div className="mt-5 space-y-2">
          {data.promotions.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"
            >
              <span>
                <strong>
                  {item.nameEn} / {item.nameNe}
                </strong>
                <small className="ml-2 capitalize">
                  {item.placement} · {item.status.replaceAll('_', ' ')} · maker{' '}
                  {item.creatorName}
                </small>
              </span>
              {superAdmin && item.status === 'pending_approval' ? (
                <span className="flex gap-2">
                  <button
                    onClick={() => send('promotion.approve', { id: item.id })}
                    className="rounded-lg border px-3 py-2"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => send('promotion.reject', { id: item.id })}
                    className="rounded-lg border px-3 py-2 text-destructive"
                  >
                    Reject
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      {superAdmin ? (
        <>
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-2xl">
              Customer & user management
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Role assignment remains in the protected Team workflow. Account
              suspension cannot target your own account.
            </p>
            <div className="mt-4 max-h-96 overflow-auto">
              {data.users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap justify-between gap-3 border-t py-3 text-sm"
                >
                  <span>
                    <strong>{user.displayName}</strong>
                    <small className="ml-2">
                      {user.email} · {user.roles || 'no role'} · {user.status}
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      send('user.status', {
                        id: user.id,
                        status:
                          user.status === 'active' ? 'disabled' : 'active',
                      })
                    }
                    className="rounded-lg border px-3 py-2"
                  >
                    {user.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-heading text-2xl">Incident management</h2>
              <form action={createIncident} className="mt-4 space-y-2">
                <input
                  name="title"
                  required
                  placeholder="Incident title"
                  className="w-full rounded-lg border p-2"
                />
                <select
                  name="severity"
                  className="w-full rounded-lg border p-2"
                >
                  <option>low</option>
                  <option>medium</option>
                  <option>high</option>
                  <option>critical</option>
                </select>
                <textarea
                  name="detail"
                  required
                  minLength={20}
                  placeholder="What happened and immediate response"
                  className="w-full rounded-lg border p-2"
                />
                <button
                  disabled={busy}
                  className="rounded-lg bg-primary p-2 font-semibold text-primary-foreground"
                >
                  Open incident
                </button>
              </form>
              {data.incidents.map((item) => (
                <div key={item.id} className="mt-3 border-t pt-3 text-sm">
                  <strong>
                    {item.referenceNumber}: {item.title}
                  </strong>
                  <p className="capitalize">
                    {item.severity} · {item.status}
                  </p>
                  {item.status !== 'resolved' ? (
                    <button
                      onClick={() =>
                        send('incident.update', {
                          id: item.id,
                          status: 'resolved',
                          resolution:
                            'Resolution confirmed through the operations console.',
                        })
                      }
                      className="mt-2 rounded-lg border px-3 py-2"
                    >
                      Mark resolved
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-heading text-2xl">
                Backup verification register
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This records evidence; it does not claim to create a provider
                backup.
              </p>
              <form action={verifyBackup} className="mt-4 space-y-2">
                <select name="scope" className="w-full rounded-lg border p-2">
                  <option value="d1">D1</option>
                  <option value="r2">R2</option>
                  <option value="full">Full</option>
                </select>
                <select name="status" className="w-full rounded-lg border p-2">
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
                <input
                  name="evidenceReference"
                  required
                  placeholder="Provider evidence / export reference"
                  className="w-full rounded-lg border p-2"
                />
                <textarea
                  name="note"
                  required
                  minLength={8}
                  placeholder="Verification result"
                  className="w-full rounded-lg border p-2"
                />
                <button
                  disabled={busy}
                  className="rounded-lg bg-primary p-2 font-semibold text-primary-foreground"
                >
                  Record verification
                </button>
              </form>
              {data.backups.map((item) => (
                <p key={item.id} className="mt-3 border-t pt-3 text-sm">
                  <strong>
                    {item.scope.toUpperCase()} · {item.status}
                  </strong>
                  <br />
                  {item.evidenceReference} ·{' '}
                  {new Date(item.verifiedAt).toLocaleString()}
                </p>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          User status, incident, backup verification, and promotion decisions
          are visible to Super Admins only.
        </p>
      )}
    </div>
  );
}
