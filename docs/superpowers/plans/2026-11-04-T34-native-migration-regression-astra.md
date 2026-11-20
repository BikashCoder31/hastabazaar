# T34 programmatic product/native fixture regression evidence

Scope: `tests/form-catalog-programmatic-products.test.ts`, plus investigation of the three native fulfillment setup failures in `tests/form-catalog-programmatic-operations.test.ts`. Canonical checkout and local startup instructions were read. No canonical database, Git state, staging settings, remote service, payment, communication or deployment changed.

## Product fixture correction

The homepage POST now proves the original signed-in authentication subject against the current active Super Admin row after the domain operation and before accepting its result. The old staff stub returned no `authSubject` and fixture users had `auth_subject=NULL`. The route correctly rejected that mismatch with403, including its race error handler. Only the fixture was changed to supply matching fictional authentication subjects. Existing required-field, protected-field denial, exact replay, changed-body conflict, archived-field replay, current suspended-actor denial, zero-effect race and atomic rollback assertions remain.

The mounted fixture supplies the component's required actor identity and a framework-only `next/link` anchor boundary. After an uncertain homepage response, it exercises the current explicit **Retry original action** control. It retains the UUID/version/custom-answer checks and adds exact whole-body equality. Actual command/recovery components are not replaced.

Fresh RED command: `node --import tsx --test --test-concurrency=1 --test-name-pattern='homepage route requires|product receivers classify' tests/form-catalog-programmatic-products.test.ts` — exit1,0pass/2fail, both expected403 mismatches; log `products-red.tap`.

Fresh GREEN command: `node --import tsx --test --test-concurrency=1 --test-name-pattern='^(?!mounted)' tests/form-catalog-programmatic-products.test.ts` — exit0,7pass/0fail/0skip,81.536s; log `products-memory-green.tap`. **Scheduling deviation:** despite the intended memory-only negative filter, the actual TAP selected all seven tests including one esbuild/Chrome mounted case. This was identified after completion and immediately reported to root. The log filename describes the intent, not the observed scope; the observed result includes the mounted case. No further heavy operation was started. Future filters must use positive explicit test names. Read-only scoped `git diff --check` passed.

Artifacts are under `.test-artifacts/t34/native-migration-regression-astra-20261104/`, including before/current source hashes.

## Native0155 investigation pending heavy slot

Historical full-suite cases1638–1640 fail inside `createIncentiveDb` at `0155_product_orderable_price_history.sql` before fulfillment assertions run. Their TAP prints only the outer `Migration ... batch failed` Error. Its native `cause` is not printed, so the actual SQLite failure has not yet been established. All19 migration statements fit a single existing helper batch. Source inspection confirms the incoming FK chain is replaced leaf-first and renamed parent-first; existing populated memory preservation tests cannot establish native D1 acceptance.

No0155 source, operations tests or shared helper changed. The queued diagnostic is `node --import tsx .test-artifacts/t34/native-migration-regression-astra-20261104/reproduce-native.ts`. It invokes only the existing ephemeral Miniflare helper with `d1Persist:false`, prints the full error cause chain, and disposes the fixture. It has not run. Root explicitly retained the heavy slot for the active full suite and will assign a fresh Astra to native diagnosis once that slot is free. The native health bridge owner separately owns0156 and has confirmed no overlapping helper/0155 edit. No native fix or aggregate pass is claimed.

The inspected existing suite TAP and triage snapshot retain no nested native0155 cause. The six relevant original failure excerpts are copied without reinterpretation into `historical-failures.json`. The only production-migration hypothesis mentioned during coordination was explicitly unproven and caused no source mutation; native diagnosis must start from actual cause evidence.
