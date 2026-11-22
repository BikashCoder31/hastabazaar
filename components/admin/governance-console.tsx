'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/admin/status-badge';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import type { GovernanceOverview } from '@/lib/db/repositories/operations';

const selectClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-base';
const governanceForms = {
  'rule.create': 'staff.governance-rule-create',
  'promotion.create': 'staff.governance-promotion-create',
  'incident.create': 'staff.governance-incident-create',
  'incident.update': 'staff.governance-incident-update',
  'backup.verify': 'staff.governance-backup-verify',
} as const;
type GovernanceFormAction = keyof typeof governanceForms;
const governanceBaseKeys = [
  'action', 'requestId', 'formVersion', 'customAnswers', 'id', 'code', 'titleEn',
  'titleNe', 'descriptionEn', 'descriptionNe', 'severity', 'isActive', 'nameEn',
  'nameNe', 'placement', 'startsAt', 'endsAt', 'note', 'productIds', 'title',
  'detail', 'status', 'resolution', 'scope', 'evidenceReference',
] as const;
type Decision = {
  action: string;
  data: Record<string, unknown>;
  title: string;
  description: string;
};
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(value);

export function GovernanceConsole({
  data,
  superAdmin,
  actorId,
}: {
  data: GovernanceOverview;
  superAdmin: boolean;
  actorId: string;
}) {
  const router = useRouter();
  const { send, pending: decisionPending, error } = useAdminMutation();
  const configuredLock = useRef(false);
  const [configuredPending, setConfiguredPending] = useState(false);
  const [activeAttempts, setActiveAttempts] = useState<Record<string, boolean>>({});
  const pending = decisionPending || configuredPending;
  const ruleCatalog = usePublishedFormConfig(governanceForms['rule.create']);
  const promotionCatalog = usePublishedFormConfig(governanceForms['promotion.create']);
  const incidentCreateCatalog = usePublishedFormConfig(governanceForms['incident.create']);
  const incidentUpdateCatalog = usePublishedFormConfig(governanceForms['incident.update']);
  const backupCatalog = usePublishedFormConfig(governanceForms['backup.verify']);
  const catalogs = {
    'rule.create': ruleCatalog,
    'promotion.create': promotionCatalog,
    'incident.create': incidentCreateCatalog,
    'incident.update': incidentUpdateCatalog,
    'backup.verify': backupCatalog,
  };
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [userSearch, setUserSearch] = useState('');
  function attemptKey(action: GovernanceFormAction, subjectId = 'new') {
    return sessionAttemptKey(governanceForms[action], subjectId);
  }
  useEffect(() => {
    const keys = [attemptKey('rule.create'), attemptKey('promotion.create'),
      attemptKey('incident.create'), attemptKey('backup.verify'),
      ...data.incidents.map((item) => attemptKey('incident.update', item.id))];
    const timer = window.setTimeout(() => setActiveAttempts(Object.fromEntries(keys.filter(hasSessionAttempt).map((key) => [key, true]))), 0);
    return () => window.clearTimeout(timer);
  }, [data.incidents]);
  function retryControl(action: GovernanceFormAction, subjectId = 'new') {
    const key = attemptKey(action, subjectId);
    if (!activeAttempts[key]) return null;
    return <div className="space-y-2 text-xs text-muted-foreground">
      <p>A prior governance action may have succeeded. Check its record before starting a new attempt.</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        if (!window.confirm('This governance action may already have succeeded. Check its record first. Start a new request reference?')) return;
        clearSessionAttempt(key);
        if (catalogs[action].status === 'stale') catalogs[action].refresh();
        setActiveAttempts((prior) => ({ ...prior, [key]: false }));
        setValidation('');
      }}>Start a new attempt</Button>
    </div>;
  }
  async function save(
    action: string,
    values: Record<string, unknown>,
    configured?: ReturnType<typeof configuredJsonPayload>,
  ) {
    setMessage('');
    setValidation('');
    const ok = await send('/api/admin/governance', { action, data: values, ...configured });
    if (ok)
      setMessage('Saved. The operation has been recorded in audit history.');
    return ok;
  }
  async function submit(
    event: { preventDefault(): void; currentTarget: HTMLFormElement },
    action: GovernanceFormAction,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const catalog = catalogs[action];
    if (!catalog.config || !catalog.canSubmit) {
      setValidation(catalog.message || 'Form configuration is unavailable.');
      return;
    }
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const submission = readConfiguredSubmission(form, catalog.config, governanceBaseKeys);
      configured = configuredJsonPayload(catalog.config, submission.answers, governanceBaseKeys);
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : 'Review the configured fields.');
      return;
    }
    const values = new FormData(form);
    const domainKeys = governanceBaseKeys.filter((key) => !['action', 'requestId', 'formVersion', 'customAnswers'].includes(key));
    let body: Record<string, unknown> = Object.fromEntries(
      [...values].filter(([key]) => domainKeys.includes(key as typeof domainKeys[number])),
    );
    if (action === 'rule.create')
      body = {
        ...body,
        titleNe: body.titleEn,
        descriptionNe: body.descriptionEn,
      };
    if (action === 'promotion.create') {
      const productIds = values.getAll('productIds');
      const startInput = values.get('startsAt');
      const startsAt =
        typeof startInput === 'string'
          ? new Date(startInput).getTime()
          : Number.NaN;
      const endInput = values.get('endsAt');
      const endsAt =
        typeof endInput === 'string'
          ? new Date(endInput).getTime()
          : Number.NaN;
      if (
        !Number.isSafeInteger(startsAt) ||
        !Number.isSafeInteger(endsAt) ||
        endsAt <= startsAt ||
        productIds.length > 24
      ) {
        setValidation(
          'Choose an end time after the start time and no more than 24 products.',
        );
        return;
      }
      body = { ...body, nameNe: body.nameEn, startsAt, endsAt, productIds };
    }
    if (configuredLock.current) return;
    configuredLock.current = true;
    setConfiguredPending(true);
    setMessage('');
    setValidation('');
    const key = attemptKey(action, action === 'incident.update' && typeof body.id === 'string' ? body.id : 'new');
    try {
      const requestId = getOrCreateSessionAttempt(key);
      setActiveAttempts((prior) => ({ ...prior, [key]: true }));
      const response = await fetch('/api/admin/governance', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, data: body, ...configured, requestId }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; code?: string; ok?: boolean } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error || 'The action could not be saved. Please try again.');
      if (result?.ok !== true) throw new Error('The response could not be verified. Retry with the same request.');
      clearSessionAttempt(key);
      setActiveAttempts((prior) => ({ ...prior, [key]: false }));
      form.reset();
      setMessage('Saved. The operation has been recorded in audit history.');
      router.refresh();
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : 'The action could not be saved.');
    } finally {
      configuredLock.current = false;
      setConfiguredPending(false);
    }
  }
  const visibleUsers = data.users.filter((user) =>
    (user.displayName + ' ' + user.email + ' ' + (user.roles ?? ''))
      .toLowerCase()
      .includes(userSearch.toLowerCase().trim()),
  );
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-3 text-sm" aria-label="Governance form history">
        <Link className="underline" href="/admin/staff-form-history?kind=governance-rule-create">Rule form history</Link>
        <Link className="underline" href="/admin/staff-form-history?kind=governance-promotion-create">Promotion form history</Link>
        {superAdmin ? <>
          <Link className="underline" href="/admin/staff-form-history?kind=governance-incident-create">Incident reports</Link>
          <Link className="underline" href="/admin/staff-form-history?kind=governance-incident-update">Incident updates</Link>
          <Link className="underline" href="/admin/staff-form-history?kind=governance-backup-verify">Backup verification history</Link>
        </> : null}
      </nav>
      {message ? (
        <output aria-live="polite" className="block rounded-xl border bg-secondary p-4 text-sm">
          {message}
        </output>
      ) : null}
      {error || validation ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/25 bg-card p-4 text-sm text-destructive"
        >
          {validation || error}
        </p>
      ) : null}
      <fieldset disabled={pending} className="min-w-0">
        <Tabs defaultValue="rules" className="gap-5">
          <div className="overflow-x-auto pb-1">
            <TabsList aria-label="Governance sections" className="min-h-12">
              <TabsTrigger value="rules" className="px-4">
                Product rules
              </TabsTrigger>
              <TabsTrigger value="promotions" className="px-4">
                Promotions
              </TabsTrigger>
              {superAdmin ? (
                <>
                  <TabsTrigger value="users" className="px-4">
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="incidents" className="px-4">
                    Incidents
                  </TabsTrigger>
                  <TabsTrigger value="backups" className="px-4">
                    Backup register
                  </TabsTrigger>
                </>
              ) : null}
            </TabsList>
          </div>
          <TabsContent value="rules">
            <Panel
              title="Prohibited & restricted products"
              description="Maintain the guidance used when reviewing listings. Changes are recorded in the audit log."
            >
              <form
                data-form-id="staff.governance-rule-create"
                onSubmit={(event) => void submit(event, 'rule.create')}
                className="grid gap-4 sm:grid-cols-2"
              >
      <FormGuide formId="staff.governance-rule-create" />

                <Field label="Rule code">
                  <Input
                    name="code"
                    required
                    minLength={2}
                    maxLength={40}
                    placeholder="e.g. RESTRICTED_MATERIAL"
                  />
                </Field>
                <Field label="Rule title">
                  <Input
                    name="titleEn"
                    required
                    minLength={3}
                    maxLength={160}
                  />
                </Field>
                <Field label="Guidance">
                  <Textarea
                    name="descriptionEn"
                    required
                    minLength={10}
                    maxLength={1000}
                  />
                </Field>
                <Field label="Severity">
                  <select name="severity" className={selectClass}>
                    <option value="prohibited">Prohibited</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  {ruleCatalog.config ? <ConfiguredFields config={ruleCatalog.config} baseKeys={governanceBaseKeys} /> : null}
                  {!ruleCatalog.canSubmit ? <p role="alert">{ruleCatalog.message || 'Form configuration is unavailable.'}</p> : null}
                  {retryControl('rule.create')}
                  <Button type="submit" className="max-md:min-h-11" disabled={!ruleCatalog.canSubmit}>Add rule</Button>
                </div>
              </form>
              <div className="mt-6 divide-y">
                {data.rules.length === 0 ? (
                  <Empty>No rules have been recorded.</Empty>
                ) : (
                  data.rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="font-semibold">{rule.titleEn}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {rule.code} · {rule.severity} ·{' '}
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDecision({
                            action: 'rule.toggle',
                            data: { id: rule.id, isActive: !rule.isActive },
                            title:
                              (rule.isActive ? 'Deactivate ' : 'Activate ') +
                              rule.titleEn +
                              '?',
                            description:
                              'This changes the active moderation guidance. Existing audit records are retained.',
                          })
                        }
                      >
                        {rule.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </TabsContent>
          <TabsContent value="promotions">
            <Panel
              title="Promotions & featured placement"
              description={superAdmin
                ? 'Create a placement that applies immediately for its scheduled window. This does not create a discount or change product prices.'
                : 'Prepare a placement for Super Admin confirmation. This does not create a discount or change product prices.'}
            >
              <form
                data-form-id="staff.governance-promotion-create"
                onSubmit={(event) => void submit(event, 'promotion.create')}
                className="grid gap-4 sm:grid-cols-2"
              >
      <FormGuide formId="staff.governance-promotion-create" />

                <Field label="Campaign name">
                  <Input name="nameEn" required minLength={3} maxLength={160} />
                </Field>
                <Field label="Placement">
                  <select name="placement" className={selectClass}>
                    <option value="homepage">Homepage</option>
                    <option value="shop">Shop</option>
                  </select>
                </Field>
                <Field label="Starts at (your device time)">
                  <Input name="startsAt" type="datetime-local" required />
                </Field>
                <Field label="Ends at (your device time)">
                  <Input name="endsAt" type="datetime-local" required />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Campaign rationale">
                    <Textarea
                      name="note"
                      required
                      minLength={8}
                      maxLength={1000}
                    />
                  </Field>
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 font-medium">
                    Published products (up to 24)
                  </legend>
                  {data.products.length ? (
                    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
                      {data.products.map((product) => (
                        <label
                          key={product.id}
                          className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            name="productIds"
                            value={product.id}
                            className="size-4 shrink-0 accent-primary"
                          />
                          <span>{product.nameEn}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Empty>
                      No published products are available to feature.
                    </Empty>
                  )}
                </fieldset>
                <div className="sm:col-span-2">
                  {promotionCatalog.config ? <ConfiguredFields config={promotionCatalog.config} baseKeys={governanceBaseKeys} /> : null}
                  {!promotionCatalog.canSubmit ? <p role="alert">{promotionCatalog.message || 'Form configuration is unavailable.'}</p> : null}
                  {retryControl('promotion.create')}
                  <Button type="submit" className="max-md:min-h-11" disabled={!promotionCatalog.canSubmit}>{superAdmin ? 'Create placement' : 'Submit for Super Admin approval'}</Button>
                </div>
              </form>
              <div className="mt-6 divide-y">
                {data.promotions.length === 0 ? (
                  <Empty>No promotions yet.</Empty>
                ) : (
                  data.promotions.map((item) => (
                    <article key={item.id} className="space-y-3 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">{item.nameEn}</h3>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {item.placement === 'homepage' ? 'Homepage' : 'Shop'} ·
                        prepared by {item.creatorName}
                        <br />
                        {date(item.startsAt)} – {date(item.endsAt)} (Nepal time)
                      </p>
                      {superAdmin && item.status === 'pending_approval' ? (
                          <div className="flex gap-2">
                            {(['approve', 'reject'] as const).map((action) => (
                              <Button
                                key={action}
                                variant="outline"
                                onClick={() =>
                                  setDecision({
                                    action: 'promotion.' + action,
                                    data: { id: item.id },
                                    title:
                                      (action === 'approve'
                                        ? 'Approve '
                                        : 'Reject ') +
                                      item.nameEn +
                                      '?',
                                    description:
                                      action === 'approve'
                                        ? 'This authorizes the placement for its scheduled window. Your decision will be recorded.'
                                        : 'This closes the pending proposal as rejected. The proposal and audit history remain available.',
                                  })
                                }
                              >
                                {action === 'approve'
                                  ? 'Approve placement'
                                  : 'Reject proposal'}
                              </Button>
                            ))}
                          </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </Panel>
          </TabsContent>
          {superAdmin ? (
            <>
              <TabsContent value="users">
                <Panel
                  title="User accounts"
                  description="Account status only. Staff role assignment stays in Staff access. You cannot suspend your own account."
                >
                  <Field label="Search loaded accounts">
                    <Input
                      type="search"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Name, email, or role"
                    />
                  </Field>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing matches from the latest {data.users.length} accounts
                    (maximum 300).
                  </p>
                  <div className="mt-4 divide-y">
                    {visibleUsers.length === 0 ? (
                      <Empty>No accounts match this search.</Empty>
                    ) : (
                      visibleUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-4"
                        >
                          <div className="min-w-0 break-words">
                            <p className="font-semibold">
                              {user.displayName}
                              {user.id === actorId ? ' (you)' : ''}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {user.email}
                            </p>
                            <p className="mt-1 text-sm capitalize text-muted-foreground">
                              {user.roles?.replaceAll('_', ' ') || 'No role'} ·{' '}
                              {user.status}
                            </p>
                          </div>
                          {user.id !== actorId ? (
                            <Button
                              variant="outline"
                              onClick={() =>
                                setDecision({
                                  action: 'user.status',
                                  data: {
                                    id: user.id,
                                    status:
                                      user.status === 'active'
                                        ? 'disabled'
                                        : 'active',
                                  },
                                  title:
                                    (user.status === 'active'
                                      ? 'Suspend '
                                      : 'Reactivate ') +
                                    user.displayName +
                                    '?',
                                  description:
                                    'This changes this account’s access to the marketplace. Its records and audit history will not be deleted.',
                                })
                              }
                            >
                              {user.status === 'active'
                                ? 'Suspend account'
                                : 'Reactivate account'}
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </Panel>
              </TabsContent>
              <TabsContent value="incidents">
                <Panel
                  title="Incident register"
                  description="Record operational issues and the actual response. This register does not run monitoring or contact external services."
                >
                  <form
                    data-form-id="staff.governance-incident-create"
                    onSubmit={(event) => void submit(event, 'incident.create')}
                    className="grid gap-4 sm:grid-cols-2"
                  >
      <FormGuide formId="staff.governance-incident-create" />

                    <Field label="Incident title">
                      <Input
                        name="title"
                        required
                        minLength={4}
                        maxLength={160}
                      />
                    </Field>
                    <Field label="Severity">
                      <select name="severity" className={selectClass}>
                        {['low', 'medium', 'high', 'critical'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="What happened and immediate response">
                        <Textarea
                          name="detail"
                          required
                          minLength={20}
                          maxLength={3000}
                        />
                      </Field>
                    </div>
                    <div>
                      {incidentCreateCatalog.config ? <ConfiguredFields config={incidentCreateCatalog.config} baseKeys={governanceBaseKeys} /> : null}
                      {!incidentCreateCatalog.canSubmit ? <p role="alert">{incidentCreateCatalog.message || 'Form configuration is unavailable.'}</p> : null}
                      {retryControl('incident.create')}
                      <Button type="submit" className="max-md:min-h-11" disabled={!incidentCreateCatalog.canSubmit}>Open incident</Button>
                    </div>
                  </form>
                  <div className="mt-6 divide-y">
                    {data.incidents.length === 0 ? (
                      <Empty>No incidents recorded.</Empty>
                    ) : (
                      data.incidents.map((item) => (
                        <article key={item.id} className="py-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">
                              {item.referenceNumber}: {item.title}
                            </h3>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="mt-1 text-sm capitalize text-muted-foreground">
                            {item.severity} severity
                          </p>
                          {item.resolution ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                              {item.resolution}
                            </p>
                          ) : null}
                          {item.status !== 'resolved' ? (
                            <form
                              data-form-id="staff.governance-incident-update"
                              onSubmit={(event) =>
                                void submit(event, 'incident.update')
                              }
                              className="mt-4 grid gap-3 sm:grid-cols-2"
                            >
      <FormGuide formId="staff.governance-incident-update" />

                              <input type="hidden" name="id" value={item.id} />
                              <Field label="Next status">
                                <select name="status" className={selectClass}>
                                  <option value="mitigating">Mitigating</option>
                                  <option value="monitoring">Monitoring</option>
                                  <option value="resolved">Resolved</option>
                                </select>
                              </Field>
                              <Field label="Response or resolution note">
                                <Textarea
                                  name="resolution"
                                  required
                                  minLength={8}
                                  maxLength={2000}
                                />
                              </Field>
                              <div>
                                {incidentUpdateCatalog.config ? <ConfiguredFields config={incidentUpdateCatalog.config} baseKeys={governanceBaseKeys} /> : null}
                                {!incidentUpdateCatalog.canSubmit ? <p role="alert">{incidentUpdateCatalog.message || 'Form configuration is unavailable.'}</p> : null}
                                {retryControl('incident.update', item.id)}
                                <Button type="submit" variant="outline" disabled={!incidentUpdateCatalog.canSubmit}>
                                  Record incident update
                                </Button>
                              </div>
                            </form>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </Panel>
              </TabsContent>
              <TabsContent value="backups">
                <Panel
                  title="Backup verification register"
                  description="Record checks you have actually performed. Saving here does not create, download, or restore a backup."
                >
                  <form
                    data-form-id="staff.governance-backup-verify"
                    onSubmit={(event) => void submit(event, 'backup.verify')}
                    className="grid gap-4 sm:grid-cols-2"
                  >
      <FormGuide formId="staff.governance-backup-verify" />

                    <Field label="Scope">
                      <select name="scope" className={selectClass}>
                        <option value="d1">D1 database</option>
                        <option value="r2">R2 files</option>
                        <option value="full">Full</option>
                      </select>
                    </Field>
                    <Field label="Verification result">
                      <select name="status" className={selectClass}>
                        <option value="verified">Verified</option>
                        <option value="failed">Failed</option>
                      </select>
                    </Field>
                    <Field label="Evidence or export reference">
                      <Input
                        name="evidenceReference"
                        required
                        minLength={4}
                        maxLength={500}
                      />
                    </Field>
                    <Field label="Verification notes">
                      <Textarea
                        name="note"
                        required
                        minLength={8}
                        maxLength={1000}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      {backupCatalog.config ? <ConfiguredFields config={backupCatalog.config} baseKeys={governanceBaseKeys} /> : null}
                      {!backupCatalog.canSubmit ? <p role="alert">{backupCatalog.message || 'Form configuration is unavailable.'}</p> : null}
                      {retryControl('backup.verify')}
                      <Button type="submit" className="max-md:min-h-11" disabled={!backupCatalog.canSubmit}>Record verification</Button>
                    </div>
                  </form>
                  <div className="mt-6 divide-y">
                    {data.backups.length === 0 ? (
                      <Empty>No backup verification evidence recorded.</Empty>
                    ) : (
                      data.backups.map((item) => (
                        <article
                          key={item.id}
                          className="space-y-2 break-words py-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">
                              {item.scope.toUpperCase()} verification
                            </h3>
                            <StatusBadge status={item.status} />
                          </div>
                          <p>{item.evidenceReference}</p>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {item.note}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {date(item.verifiedAt)} (Nepal time)
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </Panel>
              </TabsContent>
            </>
          ) : null}
        </Tabs>
      </fieldset>
      <ConfirmOperation
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) setDecision(null);
        }}
        title={decision?.title ?? 'Confirm operation'}
        description={decision?.description ?? ''}
        pending={pending}
        error={error}
        onConfirm={() => {
          if (decision)
            void save(decision.action, decision.data).then((ok) => {
              if (ok) setDecision(null);
            });
        }}
      />
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const required = Children.toArray(children).some(
    (child) => isValidElement<{ required?: boolean }>(child) && child.props.required,
  );
  return (
    <label className="grid content-start gap-2 text-sm font-medium">
      <span>{label}{required && <span aria-hidden="true"> *</span>}</span>
      {children}
    </label>
  );
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="font-heading text-2xl">{title}</h2>
      <p className="mt-2 mb-6 max-w-3xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
