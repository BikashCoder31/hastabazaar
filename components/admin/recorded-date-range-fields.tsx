'use client';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { QueryFieldPresentation } from '@/lib/catalog/shop-query';
import {
  adToBs,
  bsToAd,
  bsDaysInMonth,
  bsMonths,
  bsFirstYear,
  bsLastYear,
  nepaliDigits,
  formatBsDate,
  type DateCalendar,
} from '@/lib/dates/nepal-calendar';

function CalendarDateField({
  name,
  id,
  field,
  calendar,
  value,
  onChange,
  emptyDateHelp,
}: {
  name: 'from' | 'to';
  id: string;
  field: QueryFieldPresentation;
  calendar: DateCalendar;
  value: string;
  onChange: (value: string) => void;
  emptyDateHelp: string;
}) {
  const bs = adToBs(value),
    [year, month, day] = (bs ?? '').split('-').map(Number);
  const [draft, setDraft] = useState<{
    year: number;
    month: number;
    day: number;
  } | null>(null);
  const selected = draft ?? {
    year: year || 0,
    month: month || 0,
    day: day || 0,
  };
  const days = bsDaysInMonth(selected.year, selected.month);
  function select(part: 'year' | 'month' | 'day', next: number) {
    const changed = { ...selected, [part]: next };
    const available = bsDaysInMonth(changed.year, changed.month);
    if (available && changed.day > available) changed.day = available;
    if (changed.year && changed.month && changed.day) {
      const converted = bsToAd(
        `${changed.year}-${String(changed.month).padStart(2, '0')}-${String(changed.day).padStart(2, '0')}`,
      );
      if (converted) {
        onChange(converted);
        setDraft(null);
        return;
      }
    }
    setDraft(changed);
    onChange('');
  }
  const unsupported = Boolean(value && !bs);
  const incomplete = Boolean(draft && (draft.year || draft.month || draft.day));
  const describedBy =
    id + '-equivalent' + (field.helpText ? ' ' + id + '-help' : '');
  return (
    <Field className="min-w-0">
      {calendar === 'ad' ? (
        <>
          <FieldLabel htmlFor={id}>
            {field.label}{' '}
            <span className="font-normal text-muted-foreground">(AD)</span>
          </FieldLabel>
          <Input
            id={id}
            type="date"
            name={name}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
          />
        </>
      ) : (
        <fieldset className="min-w-0" aria-describedby={describedBy}>
          <legend className="mb-2 text-sm font-medium">
            {field.label}{' '}
            <span className="font-normal text-muted-foreground">(BS)</span>
          </legend>
          <input type="hidden" name={name} value={value} />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,.8fr)] gap-2">
            <div className="min-w-0">
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor={id + '-year'}
              >
                Year
              </label>
              <NativeSelect
                id={id + '-year'}
                aria-label={field.label + ' BS year'}
                value={selected.year || ''}
                className="w-full"
                required={incomplete}
                disabled={unsupported}
                onChange={(event) => select('year', Number(event.target.value))}
              >
                <NativeSelectOption value="">Year</NativeSelectOption>
                {Array.from(
                  { length: bsLastYear - bsFirstYear + 1 },
                  (_, index) => bsLastYear - index,
                ).map((number) => (
                  <NativeSelectOption key={number} value={number}>
                    {nepaliDigits(number)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-0">
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor={id + '-month'}
              >
                Month
              </label>
              <NativeSelect
                id={id + '-month'}
                aria-label={field.label + ' BS month'}
                value={selected.month || ''}
                className="w-full"
                required={incomplete}
                disabled={unsupported || !selected.year}
                onChange={(event) =>
                  select('month', Number(event.target.value))
                }
              >
                <NativeSelectOption value="">Month</NativeSelectOption>
                {bsMonths.map((label, index) => (
                  <NativeSelectOption key={label} value={index + 1}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-0">
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor={id + '-day'}
              >
                Day
              </label>
              <NativeSelect
                id={id + '-day'}
                aria-label={field.label + ' BS day'}
                value={selected.day || ''}
                className="w-full"
                required={incomplete}
                disabled={unsupported || !days}
                onChange={(event) => select('day', Number(event.target.value))}
              >
                <NativeSelectOption value="">Day</NativeSelectOption>
                {Array.from({ length: days }, (_, index) => index + 1).map(
                  (number) => (
                    <NativeSelectOption key={number} value={number}>
                      {nepaliDigits(number)}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </div>
          </div>
          {unsupported ? (
            <output className="mt-2 block text-sm text-muted-foreground">
              BS conversion is available for 1975–2099 BS. Select AD to edit
              this date.
            </output>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => {
              setDraft(null);
              onChange('');
            }}
          >
            Clear {name === 'from' ? 'start' : 'end'} date
          </Button>
        </fieldset>
      )}
      <FieldDescription id={id + '-equivalent'} aria-live="polite">
        {incomplete
          ? 'Choose a complete BS date or clear this date.'
          : value
            ? calendar === 'ad'
              ? formatBsDate(value)
                ? `Nepali equivalent: ${formatBsDate(value)}`
                : 'BS conversion unavailable for this AD date'
              : `Gregorian equivalent: ${value} AD`
            : emptyDateHelp}
      </FieldDescription>
      {field.helpText ? (
        <FieldDescription id={id + '-help'}>{field.helpText}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function RecordedDateRangeFields({
  from,
  to,
  initialCalendar = 'ad',
  fromField,
  toField,
  children,
  emptyDateHelp = 'No date selected; the standard reporting default applies.',
}: {
  from: string;
  to: string;
  initialCalendar?: DateCalendar;
  fromField: QueryFieldPresentation;
  toField: QueryFieldPresentation;
  children?: ReactNode;
  emptyDateHelp?: string;
}) {
  const [calendar, setCalendar] = useState(initialCalendar),
    [start, setStart] = useState(from),
    [end, setEnd] = useState(to);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Field className="min-w-0 sm:max-w-xs">
          <FieldLabel htmlFor="report-date-calendar">Date calendar</FieldLabel>
          <NativeSelect
            id="report-date-calendar"
            name="calendar"
            value={calendar}
            className="w-full"
            onChange={(event) =>
              setCalendar(event.target.value === 'bs' ? 'bs' : 'ad')
            }
          >
            <NativeSelectOption value="ad">
              Gregorian / English (AD)
            </NativeSelectOption>
            <NativeSelectOption value="bs">
              Nepali Bikram Sambat (BS)
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <p className="text-sm text-muted-foreground">
          Reporting timezone: Nepal time (UTC+05:45)
        </p>
      </div>
      <FieldGroup className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CalendarDateField
          key={'from-' + calendar}
          name="from"
          id="report-from"
          field={fromField}
          calendar={calendar}
          value={start}
          onChange={setStart}
          emptyDateHelp={emptyDateHelp}
        />
        <CalendarDateField
          key={'to-' + calendar}
          name="to"
          id="report-to"
          field={toField}
          calendar={calendar}
          value={end}
          onChange={setEnd}
          emptyDateHelp={emptyDateHelp}
        />
        {children}
      </FieldGroup>
      {start && end && start > end ? (
        <p role="alert" className="text-sm text-destructive">
          The end date must be on or after the start date.
        </p>
      ) : null}
    </div>
  );
}
