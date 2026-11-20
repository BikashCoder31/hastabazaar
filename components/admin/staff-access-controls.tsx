'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  STAFF_ACCESS_RIGHTS,
  BUILT_IN_STAFF_ACCESS_TEMPLATES,
  parseSavedStaffAccessTemplate,
} from '@/lib/staff/access';
import type { Permission } from '@/lib/marketplace/permissions';
import type { StaffPermissionPreset } from '@/lib/db/repositories/staff-permissions';

export function StaffAccessControls({
  permissions,
  onChange,
  presets,
  templateId,
  onTemplateChange,
  disabled,
}: {
  permissions: readonly Permission[];
  onChange: (permissions: readonly Permission[]) => void;
  presets: readonly StaffPermissionPreset[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const focusNext = useRef<Permission | null>(null);
  const controls = useRef(new Map<Permission, HTMLInputElement>());
  const saved = presets.flatMap((preset) => {
    const parsed = parseSavedStaffAccessTemplate(preset);
    return parsed ? [parsed] : [];
  });
  const templates = [...BUILT_IN_STAFF_ACCESS_TEMPLATES, ...saved];
  const template = templates.find(
    (item) => `${item.source}:${item.id}` === templateId,
  );
  const matches = STAFF_ACCESS_RIGHTS.filter((right) =>
    `${right.label} ${right.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  useLayoutEffect(() => {
    if (focusNext.current) {
      controls.current.get(focusNext.current)?.focus();
      focusNext.current = null;
    }
  }, [permissions]);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${id}-template`}>Job template</Label>
        <select
          id={`${id}-template`}
          className="min-h-11 w-full rounded-md border bg-background p-2"
          value={templateId}
          disabled={disabled}
          aria-describedby={`${id}-template-help`}
          onChange={(event) => {
            const next = templates.find(
              (item) => `${item.source}:${item.id}` === event.target.value,
            );
            onTemplateChange(event.target.value);
            if (next) onChange(next.permissions);
          }}
        >
          <option value="">Choose a starting point</option>
          <optgroup label="Built-in job templates">
            {BUILT_IN_STAFF_ACCESS_TEMPLATES.map((item) => (
              <option key={item.id} value={`built-in:${item.id}`}>
                {item.name}
              </option>
            ))}
          </optgroup>
          {saved.length ? (
            <optgroup label="Saved templates">
              {saved.map((item) => (
                <option key={item.id} value={`saved:${item.id}`}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <p id={`${id}-template-help`} className="text-sm text-muted-foreground">
          {template?.description ??
            'Start with a job template, then adjust the work areas below.'}{' '}
          Templates change this draft only. Nothing changes until you confirm
          Save permissions.
        </p>
        {saved.length < presets.length ? (
          <p className="text-xs text-muted-foreground">
            Some saved templates are unavailable because their access could not
            be verified.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-2">
          <Label htmlFor={`${id}-search`}>Search work access</Label>
          <Input
            id={`${id}-search`}
            type="search"
            className="min-h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a work area"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-filter`}>Show access</Label>
          <select
            id={`${id}-filter`}
            className="min-h-11 w-full rounded-md border bg-background p-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All access</option>
            <option value="allowed">Allowed</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        These switches show your draft. Checked means allowed. Changing a switch
        keeps that work area visible.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['allowed', 'blocked'] as const).map((group) => {
          if (filter !== 'all' && filter !== group) return null;
          const rights = matches.filter(
            (right) =>
              permissions.includes(right.permission) === (group === 'allowed'),
          );
          return (
            <fieldset
              key={group}
              disabled={disabled}
              className="min-w-0 rounded-xl border p-3"
            >
              <legend className="px-2 font-semibold">
                {group === 'allowed' ? 'Allowed' : 'Blocked'} ({rights.length})
              </legend>
              <div className="space-y-3">
                {rights.map((right) => (
                  <div
                    key={right.permission}
                    className="rounded-lg border bg-background p-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        id={`${id}-${right.permission}`}
                        ref={(element) => {
                          if (element)
                            controls.current.set(right.permission, element);
                          else controls.current.delete(right.permission);
                        }}
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={permissions.includes(right.permission)}
                        aria-describedby={`${id}-${right.permission}-help`}
                        onChange={(event) => {
                          focusNext.current = right.permission;
                          if (filter !== 'all') setFilter('all');
                          onTemplateChange('');
                          onChange(
                            event.target.checked
                              ? [...permissions, right.permission]
                              : permissions.filter(
                                  (p) => p !== right.permission,
                                ),
                          );
                        }}
                      />
                      <div className="min-w-0">
                        <label
                          htmlFor={`${id}-${right.permission}`}
                          className="flex min-h-11 cursor-pointer items-center text-sm font-medium"
                        >
                          {right.label}
                        </label>
                        <p
                          id={`${id}-${right.permission}-help`}
                          className="mt-1 text-sm leading-6 text-muted-foreground"
                        >
                          {right.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!rights.length ? (
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? 'No matching work areas in this section.'
                    : group === 'allowed'
                      ? 'No work areas are allowed in this draft. Account and customer access stay available.'
                      : 'All listed work areas are allowed in this draft.'}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {!matches.length ? (
        <output className="block text-sm">
          No work areas match your search.
        </output>
      ) : null}
      <aside
        aria-label="Locked Super Admin actions"
        className="rounded-xl border bg-muted/40 p-4 text-sm"
      >
        <h3 className="flex items-center gap-2 font-semibold">
          <LockKeyhole aria-hidden="true" className="size-4" />
          Super Admin only · locked
        </h3>
        <p className="mt-2 leading-6 text-muted-foreground">
          These actions cannot be included in an Admin template or switched on
          here.
        </p>
        <ul className="mt-2 grid list-disc gap-x-8 gap-y-1 pl-5 text-muted-foreground sm:grid-cols-2">
          <li>Invite staff and change staff access</li>
          <li>Suspend sellers</li>
          <li>Approve high-value refunds and seller payouts</li>
          <li>Record payout payments</li>
          <li>Change business settings, fees and tax settings</li>
          <li>Manage payment and shipping account details</li>
          <li>Publish legal content</li>
          <li>Open the full action audit</li>
        </ul>
      </aside>
    </div>
  );
}
