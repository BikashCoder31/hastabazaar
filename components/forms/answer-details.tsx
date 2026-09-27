import type { StoredFormAnswer } from '@/lib/db/repositories/form-answers';

export function AnswerDetails({ answer }: { answer: StoredFormAnswer }) {
  return (
    <section aria-label="Submitted form answers" className="rounded-2xl border bg-card p-5">
      <h3 className="font-heading text-lg">Submitted answers</h3>
      <dl className="mt-4 grid gap-4">
        {answer.answers.answers.map((field) => {
          const display = field.choiceLabels?.length ? field.choiceLabels.join(', ') :
            Array.isArray(field.value) ? field.value.join(', ') :
              typeof field.value === 'boolean' ? (field.value ? 'Yes' : 'No') : String(field.value);
          return (
            <div key={field.fieldId} className="min-w-0 border-t pt-3 first:border-t-0 first:pt-0">
              <dt className="text-sm font-semibold">
                {field.label}
                {answer.historicalFieldIds.includes(field.fieldId) ?
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">Historical</span> : null}
              </dt>
              <dd className="mt-1 break-words whitespace-pre-wrap text-sm text-muted-foreground">{display}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
