'use client';
import { StaffAccessControls } from '@/components/admin/staff-access-controls';
import { StaffAccessHistory } from '@/components/admin/staff-access-history';
import {
  STAFF_ACCESS_RIGHTS,
  compareStaffAccess,
  parseSavedStaffAccessTemplate,
} from '@/lib/staff/access';
import type { StaffAccessHistoryEntry } from '@/lib/db/repositories/staff-access-history';
import { FormGuide } from '@/components/forms/form-guide';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Permission } from '@/lib/marketplace/permissions';
import type {
  StaffPermissionProfile,
  StaffPermissionRequest,
  StaffPermissionPreset,
} from '@/lib/db/repositories/staff-permissions';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {
  configuredJsonPayload,
  readConfiguredSubmission,
} from '@/lib/forms/submission';
import {
  clearSessionAttempt,
  getOrCreateSessionAttempt,
  hasSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
const proposalBaseKeys = [
  'action',
  'userId',
  'permissions',
  'version',
  'reason',
  'presetName',
  'requestId',
  'formVersion',
  'customAnswers',
];
const decisionBaseKeys = [
  'action',
  'requestId',
  'reason',
  'formRequestId',
  'formVersion',
  'customAnswers',
];
const labels = Object.fromEntries(
  STAFF_ACCESS_RIGHTS.map((right) => [right.permission, right.label]),
);
export function StaffPermissionManager({
  actorId,
  members,
  requests,
  presets,
  history = [],
  staffNames = {},
}: {
  history?: readonly StaffAccessHistoryEntry[];
  staffNames?: Readonly<Record<string, string>>;
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
  const [savedPermissions, setSavedPermissions] = useState<
    readonly Permission[]
  >(members[0]?.permissions ?? []);
  const [draftVersion, setDraftVersion] = useState(members[0]?.version);
  const [savedProfileVersion, setSavedProfileVersion] = useState<number | null>(
    null,
  );
  const [templateId, setTemplateId] = useState('');
  const [customDirty, setCustomDirty] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<{
    body: Record<string, unknown>;
    requestKey: 'requestId' | 'formRequestId';
    attemptKey: string;
    title: string;
    description: string;
    confirmLabel: string;
  } | null>(null);
  const comparison = compareStaffAccess(savedPermissions, permissions);
  const { added = [], removed = [], unchanged = [] } = comparison ?? {};
  const dirty =
    added.length > 0 ||
    removed.length > 0 ||
    reason !== '' ||
    presetName !== '' ||
    templateId !== '' ||
    customDirty;
  const versionChanged = selected?.version !== draftVersion;
  const cannotEdit =
    !selected ||
    userId === actorId ||
    versionChanged ||
    savedProfileVersion !== null;
  const names = {
    ...Object.fromEntries(
      members.map((member) => [member.userId, member.displayName]),
    ),
    ...staffNames,
  };
  if (
    savedProfileVersion !== null &&
    selected &&
    selected.version !== savedProfileVersion
  ) {
    setSavedProfileVersion(null);
    setDraftVersion(selected.version);
    setPermissions(selected.permissions);
    setSavedPermissions(selected.permissions);
  }
  function selectStaff(nextId: string) {
    const next = members.find((member) => member.userId === nextId);
    if (!next) {
      setSwitchTo(null);
      setError(
        'This staff member is no longer available. Choose another Admin.',
      );
      return;
    }
    setUserId(nextId);
    setPermissions(next.permissions);
    setSavedPermissions(next.permissions);
    setDraftVersion(next.version);
    setSavedProfileVersion(null);
    setReason('');
    setPresetName('');
    setTemplateId('');
    setCustomDirty(false);
    setFormRevision((value) => value + 1);
    setReview(null);
    setSwitchTo(null);
    setError('');
    setMessage('');
  }
  const invalidReview =
    review?.requestKey === 'requestId'
      ? cannotEdit ||
        review.body.userId !== userId ||
        review.body.version !== selected?.version
      : review
        ? !requests.some(
            (request) =>
              request.id === review.body.requestId &&
              request.status === 'pending' &&
              request.userId !== actorId,
          )
        : false;
  const proposalCatalog = usePublishedFormConfig('staff.staff-permission-1');
  const decisionCatalog = usePublishedFormConfig('staff.staff-permission-2');
  const [retryKeys, setRetryKeys] = useState<Record<string, boolean>>({});
  const proposalKey = sessionAttemptKey('staff.staff-permission-1', userId);
  useEffect(() => {
    const keys = [
      proposalKey,
      ...requests
        .filter((r) => r.status === 'pending')
        .flatMap((r) => [
          sessionAttemptKey('staff.staff-permission-2', r.id + ':approve'),
          sessionAttemptKey('staff.staff-permission-2', r.id + ':reject'),
        ]),
    ];
    const timer = window.setTimeout(
      () =>
        setRetryKeys(
          Object.fromEntries(keys.map((key) => [key, hasSessionAttempt(key)])),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [proposalKey, requests]);
  async function submit(
    body: Record<string, unknown>,
    requestKey: 'requestId' | 'formRequestId',
    attemptKey: string,
  ) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setRetryKeys((current) => ({ ...current, [attemptKey]: true }));
      const response = await fetch('/api/admin/staff-permissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, [requestKey]: requestId }),
      });
      const result = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
        code?: string;
      } | null;
      if (result?.code === 'stale_version')
        (requestKey === 'requestId'
          ? proposalCatalog
          : decisionCatalog
        ).handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(
          result?.error ?? 'Permission request failed. Retry the same request.',
        );
      if (
        typeof result?.message !== 'string' ||
        !result.message.trim() ||
        (requestKey === 'requestId' &&
          (typeof result.id !== 'string' || !result.id.trim()))
      )
        throw new Error(
          'The response could not confirm this decision. Retry the same request.',
        );
      setMessage(result.message);
      clearSessionAttempt(attemptKey);
      setRetryKeys((current) => ({ ...current, [attemptKey]: false }));
      if (requestKey === 'requestId') {
        setSavedProfileVersion(Number(body.version));
        setSavedPermissions(permissions);
        setReason('');
        setPresetName('');
        setTemplateId('');
        setCustomDirty(false);
        setFormRevision((value) => value + 1);
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permission request failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const retryNotice = (key: string, catalog: typeof proposalCatalog) =>
    retryKeys[key] ? (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          A permission action may already have succeeded. Check its history
          before retrying. Changed details keep the same request reference and
          may conflict.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                'A prior permission action may already have succeeded. Check its history first. Starting a new attempt may duplicate it. Continue?',
              )
            )
              return;
            clearSessionAttempt(key);
            setRetryKeys((current) => ({ ...current, [key]: false }));
            setError('');
            if (catalog.status === 'stale') catalog.refresh();
          }}
        >
          Start a new attempt
        </Button>
      </div>
    ) : null;
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-heading text-xl">Staff access</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Review changes before saving. Confirmed changes apply to the selected
          Admin immediately. Existing pending requests can still be approved or
          rejected. The locked actions below are for Super Admins only.
        </p>
      </div>
      {members.length > 0 ? (
        <form
          key={`${userId}:${formRevision}`}
          data-form-id="staff.staff-permission-1"
          className="space-y-4"
          onChange={(event) => {
            const control = event.target;
            if (
              (control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement) &&
              control.name.startsWith('custom.')
            )
              setCustomDirty(true);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            if (
              cannotEdit ||
              !selected ||
              !proposalCatalog.config ||
              !proposalCatalog.canSubmit
            )
              return;
            let configured: ReturnType<typeof configuredJsonPayload>;
            try {
              const values = readConfiguredSubmission(
                e.currentTarget,
                proposalCatalog.config,
                proposalBaseKeys,
              );
              configured = configuredJsonPayload(
                proposalCatalog.config,
                values.answers,
                proposalBaseKeys,
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Review the configured fields.',
              );
              return;
            }
            setError('');
            setReview({
              body: {
                action: 'propose',
                userId,
                permissions,
                version: draftVersion,
                reason,
                presetName,
                ...configured,
              },
              requestKey: 'requestId',
              attemptKey: proposalKey,
              title:
                'Review permissions for ' + (selected?.displayName ?? userId),
              description:
                'This changes feature access for ' +
                (selected?.displayName ?? userId) +
                '. Added: ' +
                (added.map((permission) => labels[permission]).join(', ') ||
                  'none') +
                '. Removed: ' +
                (removed.map((permission) => labels[permission]).join(', ') ||
                  'none') +
                '. Reason: ' +
                reason +
                '. Account access is retained; the locked actions are for Super Admins only.',
              confirmLabel: 'Confirm permission changes',
            });
          }}
        >
          <FormGuide formId="staff.staff-permission-1" />
          <div>
            <Label htmlFor="permission-admin">Admin *</Label>
            <select
              id="permission-admin"
              className="mt-2 min-h-11 w-full rounded border p-2"
              disabled={busy}
              value={userId}
              onChange={(e) => {
                if (e.target.value === userId) return;
                if (dirty) setSwitchTo(e.target.value);
                else selectStaff(e.target.value);
              }}
            >
              {!selected ? (
                <option value={userId}>Staff member unavailable</option>
              ) : null}
              {members.map((m) => (
                <option value={m.userId} key={m.userId}>
                  {m.displayName} — {m.email}
                </option>
              ))}
            </select>
          </div>
          <section
            aria-label="Staff summary"
            className="rounded-xl border bg-secondary/30 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {selected?.displayName ?? 'Staff member unavailable'}
                </h3>
                <p className="break-all text-sm text-muted-foreground">
                  {selected?.email}
                </p>
              </div>
              <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium">
                Admin
              </span>
            </div>
            {savedProfileVersion !== null ? (
              <p className="mt-3 text-sm">Refreshing current saved access...</p>
            ) : (
              <p className="mt-3 text-sm">
                Current saved access:{' '}
                <strong>
                  {selected?.permissions.length ?? 'Unknown'} of{' '}
                  {STAFF_ACCESS_RIGHTS.length} work areas
                </strong>
                {selected ? ` · Version ${selected.version}` : ''}.
              </p>
            )}

            <p className="mt-1 text-sm text-muted-foreground">
              Account access is retained. This person can still sign in and
              shop, even when work access is off.
            </p>
          </section>
          {!selected ? (
            <p role="alert" className="text-sm text-destructive">
              This staff member is no longer available. Choose another Admin.
            </p>
          ) : userId === actorId ? (
            <p role="alert" className="text-sm text-destructive">
              You cannot change your own permissions.
            </p>
          ) : savedProfileVersion !== null ? (
            <output className="block text-sm">
              Saved. Waiting for the latest staff access to load.
            </output>
          ) : versionChanged ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                Saved access changed while you were editing. Load the latest
                access before making another change.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (dirty) setSwitchTo(userId);
                  else selectStaff(userId);
                }}
              >
                Load latest access
              </Button>
            </div>
          ) : null}
          <output className="block text-sm font-medium">
            {savedProfileVersion !== null
              ? 'Changes saved. Refreshing access.'
              : dirty
                ? 'Unsaved draft · current access has not changed.'
                : 'Showing current saved access.'}
          </output>
          <StaffAccessControls
            permissions={permissions}
            onChange={setPermissions}
            presets={presets}
            templateId={templateId}
            onTemplateChange={setTemplateId}
            disabled={busy || cannotEdit}
          />
          <section aria-label="Permission change preview">
            <Alert role="presentation">
              <AlertTitle>Changes for {selected?.displayName}</AlertTitle>
              <AlertDescription>
                <dl className="mt-2 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold">Added ({added.length})</dt>
                    <dd>
                      {added
                        .map((permission) => labels[permission])
                        .join(', ') || 'No features added'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">
                      Removed ({removed.length})
                    </dt>
                    <dd>
                      {removed
                        .map((permission) => labels[permission])
                        .join(', ') || 'No features removed'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">
                      Unchanged ({unchanged.length})
                    </dt>
                    <dd>
                      {unchanged
                        .map((permission) => labels[permission])
                        .join(', ') || 'No work areas kept'}
                    </dd>
                  </div>
                </dl>
              </AlertDescription>
            </Alert>
          </section>
          <div>
            <Label htmlFor="permission-preset-name">Save as template</Label>
            <Input
              id="permission-preset-name"
              maxLength={80}
              value={presetName}
              disabled={busy || cannotEdit}
              aria-describedby="permission-template-help"
              onChange={(e) => setPresetName(e.target.value)}
            />
            <p
              id="permission-template-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              Optional. Save this selection as a reusable template when you
              confirm.
            </p>
          </div>
          <div>
            <Label htmlFor="permission-reason">Reason *</Label>
            <Input
              id="permission-reason"
              required
              minLength={8}
              maxLength={1000}
              value={reason}
              disabled={busy || cannotEdit}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * Required. Clearing every feature removes operational access when
            saved. Templates are copies: reusing one does not change other
            people.
          </p>
          <Link
            href="/admin/staff-form-history?kind=staff-permission-proposal"
            className="block text-sm underline"
          >
            View permission proposal form history
          </Link>
          {proposalCatalog.config ? (
            <fieldset disabled={busy || cannotEdit}>
              <ConfiguredFields
                config={proposalCatalog.config}
                baseKeys={proposalBaseKeys}
              />
            </fieldset>
          ) : null}
          {!proposalCatalog.canSubmit ? (
            <p role="alert" className="text-sm text-destructive">
              {proposalCatalog.message || 'Loading form configuration…'}
            </p>
          ) : null}
          {retryNotice(proposalKey, proposalCatalog)}
          <Button
            disabled={busy || cannotEdit || !proposalCatalog.canSubmit}
            type="submit"
          >
            Save permissions
          </Button>
        </form>
      ) : (
        <p>No active Admin accounts are available.</p>
      )}
      <output className="block text-sm" aria-live="polite">
        {busy ? 'Saving permission decision…' : message}
      </output>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <StaffAccessHistory
        entries={history}
        requests={requests}
        staffNames={names}
      />
      <h3 className="font-heading text-xl">Pending decisions</h3>
      <p className="text-sm text-muted-foreground">
        Older requests waiting for a decision. Requested access has not been
        applied.
      </p>
      {!requests.some((request) => request.status === 'pending') ? (
        <p className="text-sm text-muted-foreground">
          No pending permission requests.
        </p>
      ) : null}
      <div className="space-y-3">
        {requests
          .filter((request) => request.status === 'pending')
          .map((r) => (
            <article key={r.id} className="space-y-2 rounded border p-4">
              <p className="font-semibold">
                {names[r.userId] ?? 'Former staff member'} — {r.status}
              </p>
              <p className="text-sm">
                Requested access:{' '}
                {parseSavedStaffAccessTemplate({
                  id: r.id,
                  name: 'Requested access',
                  permissionsJson: r.permissionsJson,
                })
                  ?.permissions.map((permission) => labels[permission])
                  .join(', ') ?? 'Requested access is unavailable'}
                {r.permissionsJson === '[]' ? 'No work access' : ''}
              </p>
              <p className="text-sm">{r.reason}</p>
              <p className="text-xs text-muted-foreground">
                {r.appliedDirectly ? 'Saved by ' : 'Proposed by '}
                {names[r.proposedBy] ?? 'Name unavailable'} at{' '}
                {new Date(r.proposedAt).toISOString()}. Based on version{' '}
                {r.expectedVersion}.
                {r.decidedBy
                  ? ' Decided by ' +
                    (names[r.decidedBy] ?? 'Name unavailable') +
                    '. ' +
                    r.decisionNote
                  : ''}
              </p>
              {r.status !== 'pending' ? (
                <Link
                  href={`/admin/staff-form-history?kind=${r.appliedDirectly ? 'staff-permission-proposal' : 'staff-permission-decision'}&id=${encodeURIComponent(r.id)}`}
                  className="block text-sm underline"
                >
                  {r.appliedDirectly
                    ? 'View permission change form history'
                    : 'View permission decision form history'}
                </Link>
              ) : null}
              {r.status === 'pending' &&
                (r.userId === actorId ? (
                  <p className="text-sm">
                    You cannot change your own permissions.
                  </p>
                ) : (
                  <form
                    data-form-id="staff.staff-permission-2"
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        r.userId === actorId ||
                        r.status !== 'pending' ||
                        !decisionCatalog.config ||
                        !decisionCatalog.canSubmit
                      )
                        return;
                      let configured: ReturnType<typeof configuredJsonPayload>;
                      try {
                        const values = readConfiguredSubmission(
                          e.currentTarget,
                          decisionCatalog.config,
                          decisionBaseKeys,
                        );
                        configured = configuredJsonPayload(
                          decisionCatalog.config,
                          values.answers,
                          decisionBaseKeys,
                        );
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : 'Review the configured fields.',
                        );
                        return;
                      }
                      const form = new FormData(e.currentTarget);
                      const action =
                        (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                          'value',
                        ) ?? 'approve';
                      setError('');
                      const decisionReason = form.get('reason');
                      setReview({
                        body: {
                          action,
                          requestId: r.id,
                          reason: form.get('reason'),
                          ...configured,
                        },
                        requestKey: 'formRequestId',
                        attemptKey: sessionAttemptKey(
                          'staff.staff-permission-2',
                          r.id + ':' + action,
                        ),
                        title:
                          (action === 'approve' ? 'Approve' : 'Reject') +
                          ' this permission request?',
                        description:
                          'Review the requested access for ' +
                          (members.find((member) => member.userId === r.userId)
                            ?.displayName ?? r.userId) +
                          '. Reason: ' +
                          (typeof decisionReason === 'string'
                            ? decisionReason
                            : '') +
                          '. The recorded request and current authority are checked again when you confirm.',
                        confirmLabel:
                          action === 'approve'
                            ? 'Approve access changes'
                            : 'Reject access changes',
                      });
                    }}
                  >
                    <FormGuide formId="staff.staff-permission-2" />
                    <Input
                      aria-label="Decision reason"
                      name="reason"
                      minLength={8}
                      maxLength={1000}
                      required
                      placeholder="Decision reason (required)"
                      disabled={busy}
                    />
                    <Link
                      href={`/admin/staff-form-history?kind=staff-permission-decision&id=${encodeURIComponent(r.id)}`}
                      className="block text-sm underline"
                    >
                      View permission decision form history
                    </Link>
                    {decisionCatalog.config ? (
                      <ConfiguredFields
                        config={decisionCatalog.config}
                        baseKeys={decisionBaseKeys}
                      />
                    ) : null}
                    {!decisionCatalog.canSubmit ? (
                      <p role="alert" className="text-sm text-destructive">
                        {decisionCatalog.message ||
                          'Loading form configuration…'}
                      </p>
                    ) : null}
                    {retryNotice(
                      sessionAttemptKey(
                        'staff.staff-permission-2',
                        r.id + ':approve',
                      ),
                      decisionCatalog,
                    )}
                    {retryNotice(
                      sessionAttemptKey(
                        'staff.staff-permission-2',
                        r.id + ':reject',
                      ),
                      decisionCatalog,
                    )}
                    <Button
                      type="submit"
                      name="action"
                      value="approve"
                      disabled={busy || !decisionCatalog.canSubmit}
                    >
                      Approve
                    </Button>
                    <Button
                      type="submit"
                      name="action"
                      value="reject"
                      variant="outline"
                      disabled={busy || !decisionCatalog.canSubmit}
                    >
                      Reject
                    </Button>
                  </form>
                ))}
            </article>
          ))}
      </div>
      <ConfirmOperation
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
        title={review?.title ?? 'Review permission changes'}
        description={
          invalidReview
            ? 'This staff record or request changed. Go back and review the latest access.'
            : (review?.description ?? '')
        }
        pending={busy}
        error={error}
        confirmLabel={review?.confirmLabel}
        disabled={
          invalidReview ||
          (review?.requestKey === 'requestId'
            ? !proposalCatalog.canSubmit
            : !decisionCatalog.canSubmit)
        }
        onConfirm={() => {
          if (!review || invalidReview) return;
          const catalog =
            review.requestKey === 'requestId'
              ? proposalCatalog
              : decisionCatalog;
          if (!catalog.canSubmit) {
            setError(
              catalog.message ||
                'Refresh the form configuration before confirming.',
            );
            return;
          }
          void submit(review.body, review.requestKey, review.attemptKey).then(
            (saved) => {
              if (saved) setReview(null);
            },
          );
        }}
      />
      <ConfirmOperation
        open={switchTo !== null}
        onOpenChange={(open) => {
          if (!open) setSwitchTo(null);
        }}
        title="Discard this draft?"
        description="The unsaved access, reason, saved template name and extra answers will be cleared. Current saved access will stay the same."
        pending={false}
        confirmLabel="Discard and switch"
        onConfirm={() => {
          if (switchTo !== null) selectStaff(switchTo);
        }}
      />
    </section>
  );
}
