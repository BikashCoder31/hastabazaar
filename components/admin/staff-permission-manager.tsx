'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson } from '@/lib/http/client-request';
import {
  configurableAdminPermissions,
  type Permission,
} from '@/lib/marketplace/permissions';
import type {
  StaffPermissionProfile,
  StaffPermissionRequest,
  StaffPermissionPreset,
} from '@/lib/db/repositories/staff-permissions';
const labels: Record<string, string> = {
  'seller.application.review': 'Review seller applications',
  'product.review': 'Review products and customer reviews',
  'product.publish': 'Publish products',
  'catalog.manage': 'Manage categories and governance',
  'order.manage': 'Manage orders, shipping and order emails',
  'support.manage': 'Manage returns, complaints and privacy requests',
  'refund.approve.standard': 'Approve standard refunds',
  'payout.prepare': 'Prepare payouts',
  'audit_log.view': 'View audit, reports and overview',
};
export function StaffPermissionManager({
  actorId,
  members,
  requests,
  presets,
}: {
  actorId: string;
  members: readonly (StaffPermissionProfile & {
    displayName: string;
    email: string;
  })[];
  requests: readonly StaffPermissionRequest[];
  presets: readonly StaffPermissionPreset[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(members[0]?.userId ?? '');
  const selected = members.find((m) => m.userId === userId);
  const [permissions, setPermissions] = useState<readonly Permission[]>(
    members[0]?.permissions ?? [],
  );
  const [reason, setReason] = useState('');
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await sendJson<{ message: string }>(
        '/api/admin/staff-permissions',
        'POST',
        body,
        'Permission request failed.',
      );
      setMessage(result.message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permission request failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-heading text-xl">Individual Admin permissions</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Existing Admin access stays in place until a change is approved by a
          different active Super Admin. A single Super Admin cannot approve
          their own proposal. Reserved Super Admin actions and independent
          approval safeguards cannot be delegated.
        </p>
      </div>
      {members.length > 0 ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({
              action: 'propose',
              userId,
              permissions,
              version: selected?.version,
              reason,
              presetName,
            });
          }}
        >
          <div>
            <Label htmlFor="permission-admin">Admin *</Label>
            <select
              id="permission-admin"
              className="mt-2 min-h-11 w-full rounded border p-2"
              disabled={busy}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPermissions(
                  members.find((m) => m.userId === e.target.value)
                    ?.permissions ?? [],
                );
              }}
            >
              {members.map((m) => (
                <option value={m.userId} key={m.userId}>
                  {m.displayName} — {m.email}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm">
            Current effective access:{' '}
            {selected?.permissions.map((p) => labels[p] ?? p).join(', ') ||
              'No operational features'}
            . Account access is retained. Version {selected?.version}.{' '}
            {selected?.updatedAt
              ? 'Last recorded by ' +
                selected.updatedBy +
                ' at ' +
                new Date(selected.updatedAt).toISOString()
              : 'Legacy access; no saved change.'}
          </p>
          <div>
            <Label htmlFor="permission-preset">Reuse an approved preset</Label>
            <select
              id="permission-preset"
              className="mt-2 min-h-11 w-full rounded border p-2"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const p = presets.find((p) => p.id === e.target.value);
                if (p) setPermissions(JSON.parse(p.permissionsJson));
              }}
            >
              <option value="">Select a preset</option>
              {presets.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 font-semibold">
              Proposed feature access
            </legend>
            {configurableAdminPermissions.map((p) => (
              <label
                key={p}
                className="flex min-h-11 items-center gap-3 rounded border p-3"
              >
                <input
                  type="checkbox"
                  checked={permissions.includes(p)}
                  onChange={(e) =>
                    setPermissions(
                      e.target.checked
                        ? [...permissions, p]
                        : permissions.filter((x) => x !== p),
                    )
                  }
                />
                <span className="text-sm">{labels[p] ?? p}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <Label htmlFor="permission-preset-name">
              Save approved selection as a reusable preset (optional)
            </Label>
            <Input
              id="permission-preset-name"
              maxLength={80}
              value={presetName}
              disabled={busy}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="permission-reason">Reason *</Label>
            <Input
              id="permission-reason"
              required
              minLength={8}
              maxLength={1000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * Required. Clearing every feature removes operational access after
            approval. Presets are copies: reusing one does not change other
            people.
          </p>
          <Button disabled={busy} type="submit">
            Propose permission change
          </Button>
        </form>
      ) : (
        <p>No active Admin accounts are available.</p>
      )}
      {message && <output className="block text-sm">{message}</output>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <h3 className="font-semibold">Recent permission requests</h3>
      <div className="space-y-3">
        {requests.map((r) => (
          <article key={r.id} className="space-y-2 rounded border p-4">
            <p className="font-semibold">
              {members.find((m) => m.userId === r.userId)?.displayName ??
                r.userId}{' '}
              — {r.status}
            </p>
            <p className="text-sm">
              Proposed access:{' '}
              {(JSON.parse(r.permissionsJson) as string[])
                .map((p) => labels[p] ?? p)
                .join(', ') || 'No operational features'}
            </p>
            <p className="text-sm">{r.reason}</p>
            <p className="text-xs text-muted-foreground">
              Proposed by {r.proposedBy} at{' '}
              {new Date(r.proposedAt).toISOString()}. Based on version{' '}
              {r.expectedVersion}.
              {r.decidedBy
                ? ' Decided by ' + r.decidedBy + '. ' + r.decisionNote
                : ''}
            </p>
            {r.status === 'pending' &&
              (r.proposedBy === actorId ? (
                <p className="text-sm">Awaiting another active Super Admin.</p>
              ) : (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    void submit({
                      action:
                        (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                          'value',
                        ) ?? 'approve',
                      requestId: r.id,
                      reason: form.get('reason'),
                    });
                  }}
                >
                  <Input
                    aria-label="Decision reason"
                    name="reason"
                    minLength={8}
                    maxLength={1000}
                    required
                    placeholder="Decision reason (required)"
                    disabled={busy}
                  />
                  <Button
                    type="submit"
                    name="action"
                    value="approve"
                    disabled={busy}
                  >
                    Approve
                  </Button>
                  <Button
                    type="submit"
                    name="action"
                    value="reject"
                    variant="outline"
                    disabled={busy}
                  >
                    Reject
                  </Button>
                </form>
              ))}
          </article>
        ))}
      </div>
    </section>
  );
}
