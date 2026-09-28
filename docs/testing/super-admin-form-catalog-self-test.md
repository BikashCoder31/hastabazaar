# Super Admin form catalog: local integration and browser QA

Status (28 September 2026): **all required local verification gates passed**. Tasks1–21 are complete. Task22 has closed the source inventory and verified the local journeys below, with different-author specification and code reviews. This report distinguishes local D1 verification from the observed MariaDB runtime failures. No production migration, configuration change, deployment, push, real payment or live external message was performed.

## Scope and coverage

The measured inventory contains **83 JSX form elements in65 files**, plus14 separately inventoried programmatic entry surfaces. The88 definitions classify79 recording adapters,7 query adapters and2 protected no-answer controls. The strict scanner reports zero violations and the frozen exception baseline is empty. Family receiver tests cover required/unknown/stale answers, protected fields, bounded bodies, failed-operation rollback, idempotency, parent ownership, current staff authority, historical snapshots and privacy behavior. Structural registration alone is not counted as working persistence.

All work and local QA use the existing isolated `codex/hastabazaar-v1-2-1-staging` checkout. The original17 modified and5 untracked responsive-media paths remain outside the task commit. Commits61c1422,537f009,dcfaaaf and3cfd893 remain ancestors. The actual environment supports four concurrent agents total; implementation and different-author specification/code reviews used that limit.

The approved acceptance journey is: publish a required field as Super Admin → reject a missing answer → save through the real receiver → verify the exact parent/request/actor → archive the field → read its original label/value as the authorized owner → deny a foreign reader. Query controls instead prove real result/count behavior and zero answer storage.

## Guarded local runtime

Use only this marked disposable checkout, loopback HTTP, fictional `@local.hastabazaar.test` identities, capture mail mode and simulated payments. The staging guards reject remote database/mail/storage credentials. The Vite worker uses local DB and MEDIA bindings with `remoteBindings:false` and no EMAIL binding. No email queue is flushed; existing routes return before transport when no mail binding exists.

```powershell
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:APP_ORIGIN='http://localhost:4173'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
$env:PLAYWRIGHT_MODULE='C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:FORM_CATALOG_BROWSER_ORIGIN='http://localhost:4173'
node scripts/form-catalog-browser-check.mjs --preflight
```

The preflight verifies the exact checkout/marker, the sole local D1 file, all60 migration ledger entries, form tables and the six existing fictional role accounts before opening a browser. The earlier form-catalog migrations were applied only to this local state after a recoverable backup. Do not reuse the old staging seed blindly: its seller application does not supply the new configured-form envelope. Local accounts and legitimate UI/API prerequisites were used instead.

The Browser plugin was unavailable, so the frontend-testing fallback used installed Playwright and local Chrome. Browser contexts block requests and sockets outside the exact loopback origin. Scripts, private receipt state, screenshots and JSON evidence stay in ignored `.staging`; passwords, tokens and image capabilities are not printed or committed. After an uncertain response, inspect the exact local record before proceeding; never repeat a domain action to manufacture evidence. Pause browser mutations before changing Vite configuration because its watcher restarts the server.

### Local authentication prerequisite

`scripts/staging/hosted-auth-readiness.mjs` defaults to read-only `--plan`. Its explicit `--apply --confirm-local-hosted-auth-schema=HASTABAZAAR-LOCAL-STAGING` mode verifies the exact checkout, marker, complete migration ledger, real path containment and existing compatible parent/schema. It creates only the missing hosted credential/session tables, faithfully matching the existing MariaDB generator's columns, defaults, keys and indexes. It creates no authentication fixture rows and does not change canonical migrations or production setup. A coherent, exclusive recovery snapshot precedes the atomic DDL transaction; incompatible existing objects fail closed and repeated readiness preserves credentials/sessions.

The actual one-time application created both missing tables with zero auth rows. Backup: `.staging/recovery/before-hosted-auth-f8ea9843-e3ef-4132-a70f-f871d82b114e.sqlite`. The subsequent real registration created its own credential and session through unchanged application code. The helper uses bound VACUUM INTO for a coherent pre-DDL WAL snapshot on the supported Node22.13 API. Ten focused tests cover guard/schema/backup/rollback/idempotency/password/session and API compatibility; ordinary tests use their module's repository for recovery paths and retain the actual CLI's exact-checkout restriction.

### Local rider image decoder prerequisite

The default Cloudflare local worker could not load the existing native Sharp dependency. The explicit **serve-only** `HASTABAZAAR_LOCAL_RIDER_DECODER=1` opt-in runs the unchanged `prepareRiderEvidence` pipeline in the native Node Vite process, reached by the worker over the same strict127.0.0.1 listener. It is rejected for builds, production and hosted targets. Exact checkout/marker, capture/simulation, loopback origin and absent remote bindings are required.

The endpoint requires an ephemeral per-process server capability, exact path/host/local peer, no browser Origin/fetch-site headers, accepted MIME and finite5MiB declared/streamed input. It limits concurrent decodes. The existing decoder still enforces actual format, single frame,20MP limit, orientation,4096px resize, JPEG reencoding and metadata stripping. The worker bounds the response and refuses redirects. Private R2 storage, route authorization and parent/answer writes are unchanged. The capability is absent from actual served client modules. Video/single-file behavior is checked against the unchanged originals.

Tests use an internal loopback transport fixture with a separate Vite cache; the real configuration entry always retains its guards. Actual workerd→native decoding, EXIF/orientation, malformed/type/animated/oversized images, redirect/output rejection and client capability isolation passed independent review. Restart the preview with the opt-in only after other browser journeys have stopped. This proves the approved local prerequisite, not an unmodified production worker deployment.

## Actual family evidence

| Family | Verified local behavior and evidence |
| --- | --- |
| Public feedback | One contact POST returned the expected503 before transport because EMAIL is absent. One failed delivery job and linked answer persisted; required focus, archived restricted history and foreign-role denials passed. This is truthful unsent persistence, not successful mail delivery. |
| Identity | One real registration POST/303 created one user, credential, current hosted session and exact answer. Missing-required focus, password-confirmation hydration, secret exclusion, archival, owner Historical and foreign-reader denials passed. |
| Customer/account | Real profile PATCH, exact owned answer, archival and Historical display passed; seller and ordinary Admin boundaries passed. Account/review/privacy receiver and erasure/hold tests cover the other branches. |
| Seller | Real inventory update and exact replay created one answer. Customer complaint plus one seller response, and customer return plus one seller response, preserve separate private histories and financial boundaries. |
| Rider | One real application/upload returned201 with exact profile, application, answer, event and audit. Required rejection, archival, owner history, private-media denial, EXIF removal and corrected orientation passed. |
| Commerce | Real checkout, cancellation, complaint, delivered-item return, owner historical answers and receipt-token-only private-answer denials passed. Delivery used legitimate simulated fulfillment APIs; no refund or payout decision was made. |
| Staff | Actual catalog category creation/exact replay/archival/history passed. Legitimate staff dispatch/delivery committed their configured context with the order transition; authorization/financial/race tests remain in the full suite. |
| Super Admin | Actual catalog add/require/draft/publish/archive operations drove these journeys; protected publication and foreign-reader boundaries were verified. The six-width matrix exercises the actual editor. |
| Query/system | The named minimum-price criterion changed both product results and counts; invalid and archived keys fail closed, and query submission stores no answer. Fixed system controls remain classified as protected/no-answer. |

### Exact records and artifacts

- Profile `qa_context_1c86ac5d`: answer `1b8ae6a8-35b6-4451-ba72-300635779b83`, subject `user/local-test-buyer`; `flow-profile-results.json` and profile screenshots.
- Staff catalog `qa_staff_faf011f3`: category `9c5f12a7-0947-4d04-a897-1f3e898beaf1`, answer `6be5a1c3-e4d5-42e3-86bb-4966014269a6`; `staff-lifecycle-results.json`.
- Seller inventory `qa_seller_47a6f9fa`: product `f4211763-81b6-447d-8977-4f4fdc420255`, answer `dc3b9a08-eba3-4f71-9daf-fe5e93e335e7`; `seller-lifecycle-results.json`.
- First checkout: order `9e995977-cf2d-47c2-85e5-b38d31b0391f`, answer `2c0059d8-dcf9-4743-8eda-f18da94bf8ee`; `checkout-lifecycle-recovery-results.json`. Successful navigation lost the response body; read-only recovery proved one order/answer and no second submission occurred. Exact HTTP replay was not claimed for that run.
- Cancellation on that order: event `3d7a61fe-b3ef-46b8-b0bf-3c2b69b7a6dc`, answer `ff05cda7-8331-44bb-8932-981f40971415`; `cancellation-lifecycle-results.json`. Exactly one confirmation, event and answer; no review/financial duplication.
- Contact `qa_contact_c28b6e19`: failed job `a3b525ab-f183-4acf-8e53-5a7d238b4216`, answer `7fa807d0-d4f8-473c-9983-55742a4fc78a`; `contact-lifecycle-results.json`. Attempt count1, sentAtnull, Historical and Not sent visible to authorized support only.
- Complaint `6c46b9a5-a788-4dbe-b642-81a47ef5bcc8`: customer answer `5c2534e8-310d-4e53-8834-4e789938040d`, seller answer `96457395-7231-492c-b6de-1094f45f9bc7`; `complaint-seller-continuation-results.json`. One case/two events/two answers/two audits; financial state unchanged. Existing customer creation event/audit actor columns are null; answer ownership and exact request/parent linkage were verified without inventing different provenance.
- Registration `38b1a7d9`: user `424dbe7b-b982-4ee6-b236-814982c4147f`, answer `23c123b0-260b-4744-972a-f60a2e66c9b6`; `registration-lifecycle-results.json` and `registration-lifecycle-38b1a7d9.png`. The actual current session hash and password proof were checked privately; no local-test identity was used for registration.
- Return fixture: order `61b6ee7d-e376-44fc-ab74-27176a07790e` / `HK-20260928-C15AD4DF77`, checkout answer `62f3d79e-9635-4669-9907-5d93bbcf1808`; return `a289caa8-d954-4850-a8b4-5f37a182b511`, customer answer `e4863db1-8077-4a18-97ca-45c488d492e9`; `return-receipt-return-only-2-results-9e995a01.json`. One checkout, two legitimate seller transitions, one dispatch, one delivery and one return across inspected continuations. Delivery legitimately recorded simulated COD capture, receipt and sale/commission/reserve ledger entries; the later return left them unchanged. Both owner histories are Historical. Receipt-only context can read the exact receipt but neither private value nor answer API, including an explicit token-cookie API request. Seller cannot read either customer snapshot. Widths232/390/1024 passed.
- Seller return response: answer `b782e88b-f404-4166-afae-1106e02a2587` on that exact return; `seller-return-response-results-9e995a01.json`. One request_information recommendation, own required-field rejection, archived seller Historical after the form disappears, reciprocal customer/seller and receipt denials, unchanged finances, widths232/390/1024.
- Rider `rider_91a6dc83`: application `29969642-7776-443d-8f4d-9b339fdf1652`, answer `6d6020bd-8884-47f8-9b62-d3146a5cec3b`; `rider-application-lifecycle-results.json`. Exactly one201 and submitted profile; exact parent/actor/request, one event and catalog audit. Archived owner Historical and answer API200; owner/Super Admin private JPEG200, no EXIF and correct16×24 orientation. Customer/seller/anonymous history, answer and media denied; financial state unchanged. Widths232/1024 passed; the separate customer matrix fixture remains unapplied.
- Query `9d81be25`: `query-final-results.json`. `minimum_price_npr` is a fixed named adapter, not an arbitrary decorative field.100NPR includes the exact100NPR fixture with count1;100.01NPR excludes it with count0. Required focus, forged negative input, Admin editor denial, archive removal/old-key rejection and zero answer sets passed. The criterion is archived.

All temporary lifecycle fields above were archived. Failure JSON/logs are preserved separately. Locator mistakes, pre-hydration clicks, an inappropriate controlled-input wait, config-watch restart and networkidle waits were corrected only in ignored QA harnesses after read-only state inspection. No uncertain domain action was repeated. Optional return evidence was omitted; its upload validation is covered by dedicated tests, not falsely claimed as a return-browser upload.

## Integration fixes verified during QA

Seller return/complaint histories authorize the seller's exact case before a fixed-form bounded query, then reauthorize each answer against the original event/request/actor. They return at most50 answers with a keyset cursor, preserve pagination even when candidates are denied, and return404 for malformed cursors. Archived history remains visible after the response form is disabled; customer/staff answers are excluded. Eight page tests and42 independent access/privacy checks passed.

Commerce clients validate concrete success contracts before clearing opaque attempts or values. Seven mounted modes cover malformed2xx, lost responses, domain conflicts, stale versions, retained inputs and confirmed success. Fresh gift issuance displays its one-time code; duplicate issuance correctly permits code:null. The original RED0/7 became GREEN7/7 and the combined suite passed33/33.

Actual dispatch revealed a D1 metadata mismatch: its status-update trigger makes `meta.changes`2, while SQL `changes()` remains1. The post-batch check now rejects zero/missing changes rather than requiring metadata exactly1. The in-transaction exact-row/status/request guard, authority, answer, receipt and financial SQL remain unchanged. A native Miniflare proof plus real trigger-bearing dispatch/delivery/replay and zero-row rollback tests passed19/19 under different-author review. The already-committed dispatch was never repeated after its original false409.

The final managed-program browser regression originally read the reload DOM before React restored the saved attempt. Its test now awaits the visible form/reset control and completed response state instead of fixed80ms sleeps, and proves exact stored-key removal after confirmed success. All five decision/retry/privacy assertions remain; application scheduling and component behavior are unchanged.

Task12 polish carried forward: inventory lost-response/reload now retains its product-scoped opaque attempt; exact replay, warned reset and strict success are tested. Declared/streamed oversize now returns413 with zero writes. Remaining minor UX limits are fixed JSX order for seller built-in controls, safe conflicts when refreshed publication/content differs from an uncertain prior attempt, and a product attempt key retained across an account switch that may require explicit reset. Ownership remains enforced; no live reorder or automatic recovery is claimed.

## Six-width browser matrix

`node scripts/form-catalog-browser-check.mjs --matrix` checks232/390/722/1024/1440/1920px for public, customer, account, seller, rider, staff, Super Admin, auth and checkout:54 cases. It requires the intended heading/path/form, the exact current published version where applicable, visible inputs and associated labels, keyboard Tab focus, no clipped controls/page-level overflow, and no unexplained browser exception. Empty carts, denied pages and absent forms do not count as passes.

Fixtures are the real contact page; customer privacy; buyer profile; seller product creation; a still-unapplied fictional customer's rider application; Admin catalog dialog; Super Admin profile editor; anonymous login; and the prepared fictional buyer cart. The rider lifecycle uses a different eligible buyer so it does not remove the matrix's customer application form. Fixture state is ignored `.staging/form-catalog-browser-fixtures.json`; screenshots and `matrix-results.json` are under `.staging/artifacts/form-catalog/`.

The fresh final matrix passed all54/54 cases with zero issues on28 September2026; `matrix-final-20260928-results.json` preserves that exact run. The final combined suite also passed with zero failures and skips. This is local Chrome/Chromium evidence, not physical-device, Firefox, Safari or production certification. Representative actual journeys per family are combined with per-adapter receiver/history/access tests; no claim is made that every financial or operational branch received a real browser transaction.

## MariaDB runtime findings

The design requires maintained MariaDB schema parity, which is checked separately from runtime certification. After the user started Docker, a new task-owned MariaDB10.11.19 container was created from the official image, bound only to127.0.0.1:13316 with fresh private credentials and disposable memory-backed data. Existing Docker containers were not modified.

The canonical base schema import failed at an ALTER TABLE for absent `rider_profiles`; the form-catalog migration itself subsequently applied against its existing canonical parent tables. A real `saveFormDraft` call through the unchanged Babal node binding failed with FormCatalogConflictError, with zero committed versions and audits. Separate read-only probes of the exact repository historyCompatible and validAgainstVersion SQL through the unchanged translator also returned native ER_PARSE_ERROR; catalog, answer and request-audit counts remained zero. Thus **Babal/MariaDB runtime readiness is not established and must not be inferred from schema parity or passing local D1 tests**. Exact separate setup/fixture failures and the scoped runtime result are retained in `mariadb-runtime-results.json`. No production schema/translator/configuration was changed to hide this limitation.

## Final verification commands

Run after final source changes; set FORM_CATALOG_BROWSER_ORIGIN to the guarded preview above so the real layout check is executed, and inspect every exit code and complete result before acceptance:

```powershell
npx tsx --test tests/form-catalog-coverage.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
npx tsx --test tests/form-catalog-schema.test.ts tests/form-catalog-feedback.test.ts
git diff --check
node scripts/form-catalog-browser-check.mjs --matrix
```

Use the decoder opt-in only in its local preview process, never in the build environment. Final verification on28 September2026: **1,633/1,633 tests passed, zero failures and zero skips** (`task-22-final-tests-accepted.log`, exit0); fresh TypeScript and lint passed after the final test correction, and the unchanged application build passed. Coverage/schema/feedback passed41/41, the explicitly enabled real layout test passed2/2, the fresh browser matrix passed54/54, and git diff --check passed. The initial full run had one fixture-readiness failure and one missing-origin skip; its separate log is retained and is superseded by the corrected complete run. Different-author source SPEC and CODE reviews found no Critical/Important issue; exact branch/ancestor and protected-work checks precede the scoped task commit. These results establish the approved local Task22 acceptance only; the MariaDB failures above remain unresolved.
