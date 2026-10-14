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
import { queryFieldPresentation } from '@/lib/catalog/shop-query';
import type { PublishedFormConfig } from '@/lib/forms/types';
import type { AdminQueueFilters } from '@/lib/admin/queue-filters';
export function AdminQueueFields({
  id,
  formId,
  filters,
  statuses,
  presentation,
  searchHelp,
}: {
  id: string;
  formId: 'staff.seller-registry-filter' | 'staff.order-queue-filter';
  filters: AdminQueueFilters;
  statuses: readonly string[];
  presentation: PublishedFormConfig | null;
  searchHelp: string;
}) {
  const search = queryFieldPresentation(formId, presentation, 'q', {
      label: 'Search records',
      placeholder: 'Enter a name, reference or contact',
    }),
    status = queryFieldPresentation(formId, presentation, 'status', {
      label: 'Status',
    });
  return (
    <FieldGroup className="sm:flex-row sm:items-end">
      <Field className="sm:flex-[2]">
        <FieldLabel htmlFor={id + '-search'}>{search.label}</FieldLabel>
        <Input
          id={id + '-search'}
          name="q"
          type="search"
          maxLength={120}
          defaultValue={filters.q}
          placeholder={search.placeholder}
          aria-describedby={id + '-search-help'}
        />
        <FieldDescription id={id + '-search-help'}>
          {search.helpText || searchHelp}
        </FieldDescription>
      </Field>
      <Field className="sm:flex-1">
        <FieldLabel htmlFor={id + '-status'}>{status.label}</FieldLabel>
        <NativeSelect
          id={id + '-status'}
          name="status"
          defaultValue={filters.status || 'all'}
          className="w-full"
        >
          <NativeSelectOption value="all">All statuses</NativeSelectOption>
          {statuses.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value === 'awaiting_review'
                ? 'Awaiting review'
                : value === 'awaiting_cod_confirmation'
                  ? 'Awaiting COD confirmation'
                  : value
                      .replaceAll('_', ' ')
                      .replace(/^./, (c) => c.toUpperCase())}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {status.helpText ? (
          <FieldDescription>{status.helpText}</FieldDescription>
        ) : null}
      </Field>
    </FieldGroup>
  );
}
