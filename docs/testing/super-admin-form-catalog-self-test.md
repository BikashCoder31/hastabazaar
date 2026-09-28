# Super Admin form catalog: disposable browser self-test

Status (28 September 2026): **verification in progress; not accepted as complete**. Tasks 17–21 have independently reviewed commits (Task20 c193ea4; Task21 1fe7446). The guarded local D1 has all 60 migrations and six fictional accounts. Baseline catalog versions and a fictional buyer cart were prepared through local APIs. The reviewed D1 expression-depth fix is committed as 8b2ae7f and the real profile lifecycle now passes, including required focus, saved answer, archival, historical display and forbidden-role checks. A second real staff catalog lifecycle passes exact replay and historical access checks. The latest 54-case matrix passes all 54 cases with no recorded browser errors, unlabeled visible controls, clipped inputs or page-level overflow. Rendered IDs, seller upload names and 232px contact/catalog fixes are verified. Task22 adapter activation, access/history, bounded transport and retry corrections have passed package-level independent reviews. The fresh restarted-server54-case matrix passed; final combined checks passed (1,614 tests, zero failures/skips; type checking, lint and build); remaining family lifecycle evidence is tracked below; the user explicitly approved both Task15 seller-history pages, which now pass independent specification/code review and access/privacy checks. The earlier authority hold is resolved. No production data, configuration, deployment or live external message is involved.

Measured source coverage: **83 JSX form elements in65 files**, plus14 separately inventoried click-driven entry surfaces. The88 registered definitions classify79 recording adapters,7 query adapters and2 protected no-answer controls. The strict scanner reports zero violations and the historical exception ledger is empty; this structural evidence does not substitute for receiver, transaction, privacy or runtime verification.

The flow under test is: Super Admin publishes a required configured field → a fictional account sees it, cannot submit it empty, and saves an answer → Super Admin archives the field → that account still sees its historical label and value, while another account and an ordinary Admin cannot access the protected state.

The Browser plugin/skill is not available in this session. `scripts/form-catalog-browser-check.mjs` uses existing Playwright 1.62.1 and local Chrome/Chromium as the permitted fallback. It never installs dependencies, starts a server, applies migrations, invokes the seed script, or sends mail. `--preflight` is read-only; `--matrix` observes pages; `--flow-profile` intentionally publishes catalog versions and saves one fictional profile answer in this guarded disposable D1. Every browser request to a different origin is blocked. Screenshots and results go only to ignored `.staging/artifacts/form-catalog/`.

## Isolation and schema gate

Run from this isolated staging checkout only. PowerShell session example:

```powershell
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:APP_ORIGIN='http://localhost:4173'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
$env:PLAYWRIGHT_MODULE='C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/form-catalog-browser-check.mjs --preflight
```

The harness calls `assertDisposableStagingContext`, requires this checkout's exact `.staging/staging-environment.json` marker, rejects remote DB/SMTP/R2 bindings, enforces loopback HTTP `APP_ORIGIN`, and opens the single local Miniflare D1 file read-only. The preflight compares every `drizzle/NNNN_*.sql` file to `_hastabazaar_local_migrations`, requires both form tables, and verifies the six active fictional role IDs. A non-ready result exits 2. Neither `--matrix` nor `--flow-profile` will open a browser until this gate passes. Keep payment mode simulated and recipients limited to `@local.hastabazaar.test`; do not set external service bindings.

Before any future local D1 migration, verify the database path is under **this** checkout's `.staging/state`, inspect the pending SQL files and the existing migration ledger, and preserve a consistent recoverable backup of the disposable SQLite state. The four migrations above have already been applied; the following guarded runner pattern is retained for later migrations and must only be used after a new preflight identifies pending files:

```powershell
@'
import {assertDisposableStagingContext,readAndVerifyStagingMarker,resolveDisposableStagingPaths} from './scripts/staging/guards.mjs';
import {applyLocalD1Migrations} from './scripts/staging/local-d1.mjs';
assertDisposableStagingContext(process.env);
const paths=resolveDisposableStagingPaths(process.cwd(),process.env);
await readAndVerifyStagingMarker(paths);
const result=await applyLocalD1Migrations(paths,process.cwd());
console.log({applied:result.applied,total:result.total});
'@ | node --input-type=module
node scripts/form-catalog-browser-check.mjs --preflight
```

This applies only missing SQL migrations in a local SQLite transaction using the existing staging runner; it does **not** execute `npm run staging:seed`. That older seed ends by submitting a seller application without the new `formVersion`/configured answers and must be revised or replaced by a separately reviewed local-only fixture step before reuse. The existing local role accounts avoid that seed path for this QA. After schema readiness, start `npm run dev` with the same guarded environment, run `npm run staging:verify`, and confirm published configurations and fictional records are ready before browser mutation.

## Representative viewport matrix

The `--matrix` mode tests exact widths **232, 390, 722, 1024, 1440, 1920 px**. It requires one fixture entry for each of `public`, `customer`, `account`, `seller`, `rider`, `staff`, `super_admin`, `auth`, and `checkout`; missing entries fail before navigation. For every entry/width it asserts the expected path and heading, a visible target and input, an exact rendered `data-form-id` with a published `formVersion` when a form ID is supplied, associated labels, visible keyboard Tab focus, no clipped controls or page-level horizontal overflow, a nonblank page without a framework error, and no unexplained browser console exception. It saves one viewport screenshot and a machine-readable result row. It does not silently count an access-denied or empty-cart page as a passing form.

The current verified fixture is saved in ignored `.staging/form-catalog-browser-fixtures.json`:

```json
{
  "schemaVersion": 1,
  "surfaces": [
    {"audience":"public","role":null,"path":"/contact-us","heading":"Contact us","formId":"public.contact","formSelector":"form[data-form-id='public.contact']","targetSelector":"form[data-form-id='public.contact']"},
    {"audience":"customer","role":"customer","path":"/account/privacy","heading":"Privacy, with care.","formId":"account.privacy-request","formSelector":"form[data-form-id='account.privacy-request']","targetSelector":"form[data-form-id='account.privacy-request']"},
    {"audience":"account","role":"buyer","path":"/account/profile","heading":"Make yourself at home.","formId":"account.profile","formSelector":"form[data-form-id='account.profile']","targetSelector":"form[data-form-id='account.profile']"},
    {"audience":"seller","role":"seller","path":"/seller/products/new","heading":"Submit a product","formId":"seller.product-submission","formSelector":"form.seller-form","targetSelector":"form.seller-form"},
    {"audience":"rider","role":"customer","path":"/rider","heading":"Rider dashboard","formId":"rider.application","formSelector":"form[data-form-id='rider.application']","targetSelector":"form[data-form-id='rider.application']"},
    {"audience":"staff","role":"admin","path":"/admin/catalog","heading":"Categories and occasions","formId":"staff.catalog","formSelector":"form[data-form-id='staff.catalog']","targetSelector":"form[data-form-id='staff.catalog']","openButton":"Add category"},
    {"audience":"super_admin","role":"super_admin","path":"/admin/forms/account.profile","heading":"account.profile","targetSelector":"#new-field-key"},
    {"audience":"auth","role":null,"path":"/login","heading":"Welcome back","formId":"identity.login-password","formSelector":"form[action='/api/auth/login']","targetSelector":"form[action='/api/auth/login']"},
    {"audience":"checkout","role":"buyer","path":"/checkout","heading":"Let’s bring them home.","formId":"commerce.checkout","formSelector":"form[data-form-id='commerce.checkout']","targetSelector":"form[data-form-id='commerce.checkout']","preparedBuyerCart":true}
  ]
}
```

The rider surface is the real application form visible to a fictional customer applying to become a rider; no assignment is fabricated. Staff opens the existing Add category control without submitting during the matrix. Checkout uses the one prepared fictional buyer cart. The script still requires the exact rendered form ID even when its selector is a class or action. For long text, choices, numeric bounds, private uploads, and conditional controls, retain focused family test evidence and record any additional browser journeys separately.

```powershell
node scripts/form-catalog-browser-check.mjs --matrix
```

## Account-profile lifecycle proof

After `account.profile` is published, run `--flow-profile`. It uses only fictional local roles and a unique `qa_context_<id>` short-text field. The script uses the rendered catalog editor to add it, set it required, save a draft, and publish; checks the buyer form's native missing-answer focus; submits one real profile PATCH; reads local D1 **read-only** to require exactly one answer set linked to `local-test-buyer`; archives and republishes the field; then checks the buyer's historical label/value and `Historical` badge. A seller's profile must not show the buyer value, and ordinary Admin must land on `/staff-access-denied` when opening the editor. A mid-run failure may leave a required test field in the disposable catalog. Inspect the exact key and saved state before retrying. `FORM_CATALOG_QA_RUN_ID` may resume the same eight-character hexadecimal QA identifier only before any answer was committed. A read-only preflight refuses a previously saved run before any catalog or profile mutation; inspect its saved answer and archive that exact field through the editor instead of resubmitting. Archive the field when a new flow completes. Do not use a shared or production catalog.

```powershell
node scripts/form-catalog-browser-check.mjs --flow-profile
```

The final site-wide QA must additionally exercise one **real submission and historical read per family**, not just the nine-page matrix or this one profile flow. Maintain a run ledger with concrete fictional parent IDs and form IDs for: public contact/feedback, registration/sign-in/recovery, customer account/review/privacy, cart/checkout/return/complaint/cancellation, seller application/product/finance/case, rider application/report/remittance/OTP, staff operations/moderation/case/finance, and Super Admin catalog/settings/governance. For each, record missing-required rejection, valid save linked to the exact parent, failed-action zero answers, retry behavior, archived historical labels, and forbidden-role read. Only the concrete completed journeys listed below are verified. Remaining family journeys are **unverified**; the viewport matrix and isolated route tests do not substitute for actual browser submissions and history reads.

Results: `.staging/artifacts/form-catalog/matrix-results.json`, `flow-profile-results.json`, and `<audience>-<width>.png` or `flow-<id>-<state>.png`. Record actual pass/fail, console, clipped controls, exact route, screenshot names, and any blocked adapter in the final QA ledger. No browser screenshots or result files are committed. This is Chrome/Chromium local staging evidence, not physical-device, Firefox, Safari, or production certification.

## Verified local lifecycle evidence

- Profile: `qa_context_1c86ac5d`, answer `1b8ae6a8-35b6-4451-ba72-300635779b83`, exact subject `user/local-test-buyer`. `flow-profile-results.json` reports PASS. The field is now archived and its original label/value remains visible only through authorized history. Screenshots: `flow-1c86ac5d-published.png`, `flow-1c86ac5d-required.png`, `flow-1c86ac5d-history.png`.
- Staff catalog: `qa_staff_faf011f3`, category `9c5f12a7-0947-4d04-a897-1f3e898beaf1`, answer `6be5a1c3-e4d5-42e3-86bb-4966014269a6`. Guarded disposable script `.staging/form-catalog-staff-flow.mjs` publishes a required field through the real Super Admin API, submits a fictional category through the rendered Admin form, repeats the exact request, reads D1 to require exactly one correctly linked answer, archives the field, opens authorized historical context and denies a seller. `staff-lifecycle-results.json` reports PASS; screenshot `staff-lifecycle-faf011f3.png`. This adds one fictional category, not a live business change.

Runtime limitation: the actual-engine evidence uses Miniflare/workerd D1. The separate Babal/MariaDB translator leaves existing SQLite JSON table functions and new materialized-CTE syntax untranslated. Schema parity alone does not establish that runtime path; no MariaDB runtime or production certification is claimed.
Additional local lifecycle evidence (2026-09-28): seller.inventory passed required-field focus, real owner-authorized stock save, exact replay, one answer linked to product f4211763-81b6-447d-8977-4f4fdc420255, archival and historical read, and buyer denial. Answer dc3b9a08-eba3-4f71-9daf-fe5e93e335e7; field qa_seller_47a6f9fa is archived. Evidence: seller-lifecycle-results.json and seller-lifecycle-47a6f9fa.png in ignored local artifacts.

Rider application upload lifecycle remains unverified: the local Cloudflare/Vite worker failed to load the pre-existing native Sharp module (@img/sharp-wasm32/sharp.node), returning HTML 500 before the application handler loaded. Native required-field focus passed, but submission/history/private-media checks did not run successfully. The harmless fictional image was never persisted. Exact temporary field qa_rider_65259343 was archived through the authorized local Super Admin API; read-only D1 confirmed no application or answer was committed for this attempt. No upload inspection, production runtime, or security configuration was weakened. This is a runtime verification limitation, not a passing lifecycle result.

Checkout lifecycle now has actual local D1 proof after preparing the fictional seller agreement through its real loopback UI. Required-field focus passed; the real checkout saved exactly one buyer order (9e995977-cf2d-47c2-85e5-b38d31b0391f) and one exact-parent answer (2c0059d8-dcf9-4743-8eda-f18da94bf8ee). The QA field qa_checkout_44b9c830 was archived through the Super Admin API; the buyer sees the preserved value with a Historical label and the seller role cannot read it. Screenshot checkout-lifecycle-44b9c830.png was visually inspected. Successful navigation prevented Playwright response-body capture, so the recovery first inspected D1 read-only and never submitted again; this run does not prove exact HTTP replay. Evidence: checkout-lifecycle-recovery-results.json. No real payment or external email occurred. The earlier agreement409 attempt committed nothing and its field remains archived.
Customer cancellation actual lifecycle passed after the reviewed native-validation correction: qa_cancel_c28a9e15, event/request3d7a61fe-b3ef-46b8-b0bf-3c2b69b7a6dc and answerff05cda7-8331-44bb-8932-981f40971415 on the same fictional buyer order above. Exactly one confirmation returned200/cancelled; read-only D1 verified one event, one answer and no review. Missing-required focus, current eligible preview, archival, buyer Historical display, seller page/API denial and anonymous direct-answer denial passed. Screenshot cancellation-lifecycle-c28a9e15.png was visually inspected. The private QA state had no recoverable receipt token, so receipt-only UI history remains unverified; no token was logged and no uncertain confirmation was repeated. Evidence: cancellation-lifecycle-results.json.

Public contact persistence/history lifecycle passed with the expected delivery failure, not successful mail delivery: qa_contact_c28b6e19, failed job a3b525ab-f183-4acf-8e53-5a7d238b4216, answer 7fa807d0-d4f8-473c-9983-55742a4fc78a. The guarded runtime has no EMAIL binding, so transport stops before any external send. Exactly one actual form POST returned503/delivery_retryable; read-only D1 verified one failed job, one exact answer, attemptCount1 and sentAtnull. Native required focus prevented an empty submission, the UI truthfully retained the unsent attempt, the exact field was archived, and authorized support history displayed Historical and Not sent. Seller, buyer and anonymous page/direct-answer access were denied. Evidence: contact-lifecycle-results.json and visually inspected contact-lifecycle-c28b6e19.png. No uncertain retry or delivery-success claim.

Registration actual browser lifecycle remains unverified: read-only guarded preflight found the required user_credentials and user_sessions tables absent from the marked local D1; identity.register also has no stored publication in that runtime. No registration POST, account creation, schema change or replacement fixture was attempted. The six identity adapters have actual SQLite route-test coverage, including large encoded answers and protected credential limits, but that does not certify this incomplete local authentication runtime.

## Final reviewed integration checkpoint

The final complete `npm test` run passed **1,614 tests, zero failures and zero skips**, including the newly approved seller case histories and commerce success-contract regressions. `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, the required schema/feedback/coverage checks, and staged/working diff checks passed. The actual local viewport matrix passed **54/54**. Two prior complete-suite runs each exposed a browser-test synchronization race (dialog exit and configuration refresh); their narrow condition-based waits preserve the original assertions, passed independent review, and are included in the passing final run. No production behavior was changed to accommodate those races.

This is a reviewed integration checkpoint, not full plan acceptance. Task15 seller case history and retry corrections have passed their implementation and independent review gates; Task22 retains the concrete rider upload, registration, receipt-only history, remaining family lifecycle and Babal/MariaDB runtime limits described above. No deployment or production certification follows from these results.

## Approved seller case history and retry corrections

Both seller case detail pages now query only their fixed seller-response form and exact authorized case. Each candidate answer is reauthorized against the current seller and original response event/request/actor. Pages return at most 50 answers with a bounded keyset cursor, retain a next link even when all candidates are denied, and return404 for malformed cursors. Archived labels and values remain visible when the response form is disabled. Customer and staff answers are excluded. Eight new page tests and 42 independent history/access/privacy checks passed.

The four commerce client components now validate concrete route success results before clearing request IDs, resetting values, refreshing or navigating. Seven mounted modes cover customer and seller returns/complaints, gift issuance/redemption and checkout, including malformed2xx, lost responses, correctable domain conflicts, stale versions, retained values and valid success. Fresh gift issuance still displays its one-time code; duplicate issuance legitimately returns code:null. RED0/7 became GREEN7/7; the combined commerce suite passed33/33. Two legacy positive fixture payloads were aligned with actual route contracts without changing their assertions. No server financial, ownership, evidence or transition rule changed.

A read-only follow-up found no existing guarded command that closes the rider/registration runtime gaps. The Babal target switches to MariaDB credentials and disables local-test identities, so it is not a replacement for this marked local SQLite runtime. The local schema does not initialize hosted credential/session tables, and mandatory rider media still requires its real decoder. No schema, decoder, binding or production-runtime workaround was introduced to manufacture passing QA.

Actual complaint and seller-response lifecycle passed for case `6c46b9a5-a788-4dbe-b642-81a47ef5bcc8` on the existing fictional canceled order: customer answer `5c2534e8-310d-4e53-8834-4e789938040d`, seller answer `96457395-7231-492c-b6de-1094f45f9bc7`. Exactly one customer POST and one seller POST produced one case, two events, two answers and two audits. Read-only checks verified exact customer parent/request/answer ownership and seller response parent/request/actor linkage. The existing customer creation event/audit intentionally have null actor IDs; no different provenance is claimed. Order/payment state and financial record counts were unchanged.

The first QA run stopped on a locator mismatch before any domain POST and archived its fields. The second saved the customer complaint once, then stopped before the seller POST because input was filled before hydration readiness. Read-only inspection proved zero seller effects; a guarded seller-only continuation used that exact existing case, waited for hydration, submitted once and archived only its own field. No customer action or uncertain seller action was repeated. Both original custom values now display Historical; each owner can read their answer, customer and seller cannot read each other's private answer, and anonymous direct reads are denied. The seller response form is disabled while history remains visible. Seller history has no horizontal overflow at232/390/1024px; the232/1024 screenshots were visually inspected. Evidence: `complaint-lifecycle-results-8f31ac92.json`, `complaint-lifecycle-results-8f31ac93.json`, `complaint-seller-continuation-results.json`, and `complaint-customer-8f31ac93.png` / `complaint-seller-8f31ac93-232.png` / `complaint-seller-8f31ac93-1024.png`. No email queue was flushed or live mail/payment sent. The canceled item cannot exercise a delivered-item return, and receipt-token-only history remains unverified.
