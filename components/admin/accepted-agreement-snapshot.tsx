export function AcceptedAgreementSnapshot({ json }: { json: string }) {
  let snapshot: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      snapshot = parsed as Record<string, unknown>;
  } catch {
    /* Preserve unfamiliar historical records below. */
  }
  const terms =
    Array.isArray(snapshot?.terms) &&
    snapshot.terms.every((term) => typeof term === 'string')
      ? (snapshot.terms as string[])
      : [];
  const rate = snapshot?.platformRetentionBps;
  const hasRate =
    typeof rate === 'number' &&
    Number.isInteger(rate) &&
    rate >= 0 &&
    rate <= 10000;
  return (
    <div className="flex flex-col gap-3">
      {terms.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            Accepted version:{' '}
            {typeof snapshot?.version === 'string'
              ? snapshot.version
              : 'See recorded agreement version'}
          </p>
          {hasRate ? (
            <p className="font-semibold">
              Recorded platform retention: {rate / 100}%
            </p>
          ) : null}
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            {terms.map((term, index) => (
              <li key={index} className="text-sm leading-6">
                {term}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          A readable summary could not be displayed for this historical record.
          Inspect the original snapshot before deciding.
        </p>
      )}
      <details className="rounded-lg border p-3">
        <summary className="min-h-7 cursor-pointer text-sm font-semibold">
          Original recorded snapshot
        </summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
          {json}
        </pre>
      </details>
    </div>
  );
}
