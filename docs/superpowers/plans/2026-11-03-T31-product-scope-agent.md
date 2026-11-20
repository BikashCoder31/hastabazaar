# T31 Product source and actor boundaries

Scoped implementation in the canonical checkout only. No canonical database,
schema migration, provider delivery, launcher bypass, deployment or Git mutation.
Seller Home/Requests evidence remains in the separate Seller workspace note.

## Implemented source contracts

- Product assistance, whole-product review, availability/stock, concerns,
  publication-owner, retained-file and legacy-stock controls use actor + exact
  native source keys. Retired React scopes cannot apply a late response or call
  a newly mounted source's refresh callback.
- Shared command retries retain the byte-identical original body in page memory.
  New session storage writes contain only opaque actor/source/request/action
  references. An encountered old full-body entry is converted without restoring
  its private fields. Reload performs an authorized native receipt GET; missing
  receipt remains explicitly unconfirmed and never starts a new attempt.
- Original price proposals already retained by the native domain have a separate
  explicit same-request retry. This preserves retention-before-sending recovery
  without recovering a private browser payload or creating a replacement ID.
- New admin/seller product-command-outcomes GET routes return only requestId and
  recorded/unconfirmed. Native receipt actor, action and original source must
  match. An old decision cannot be rebound to a later real case for that product;
  retained media recovery also binds its exact original file ID.
- X-Hastabazaar-Actor uses the shared reject-only authenticated actor-intent
  convention. It grants no permission. Access denial hides old private controls;
  current-source checks and native mutations retain their own authority guards.
- Optional first-draft intake stays optional. Its actual autosave and mounted
  editor cannot save actor A's private fields under B, and same A can recheck and
  retry the original in-page save.
- Assistance/publication/availability/concern private readers finish with captured
  current authority and native source proofs. Assistance, publication and concern
  detail pages perform public query/category awaits before the final private read.

## Exact Product parties and notices

`lib/products/party-scope.ts` provides trusted-SQL predicates for the current
profile owner and the original owner retained by the ONE product publication
link and intake draft. Independent staff authority, selected concern coverage and
availability staff controls reuse these predicates in preflight and atomic guards.
This is not a blacklist of historical editors, buyers or unrelated owners. An
unlinked legacy product has no retained original owner proof in that source;
its known current-owner boundary remains, with no invented provenance.

Only the Product priority/availability branches of the common notification
factory/catalogue changed. New eligible-staff copies exclude the same parties.
Currentness checks the exact current native marker and party in one final SELECT
after request hashing, so an already-issued staff copy becomes stale if its
recipient becomes personal. Fake delivery exercises the real sender with capture
transport; no provider is contacted. Root owns shared priority queue/assignment
and legacy-page composition integration.

## Meaningful verification

- Mounted actor/source, late committed response and private storage RED cases
  preceded fixes. Current actual component/API browsers: **5/5**, exit 0,
  26.41s; `.test-artifacts/t31/product-final-browser-current.tap`.
- Actual optional new-editor journey includes delayed A request authenticated as
  B, private curtain, zero wrong-owner drafts, same-A readonly recheck and exact
  retry, then actor-switch reset. Mobile screenshots inspected: no horizontal
  overflow. Publication fixture screenshot does not prove R2 blob rendering.
- Private native source/role races and retained-party findings reproduced before
  fixes. Product owner corrected in metadata then promoted to SA previously
  gained independent availability/concern read and triage: RED 3/3.
- New concern generation and stale queued notice delivery: RED 2/2 -> GREEN 2/2,
  `.test-artifacts/t31/product-party-notices-green.tap`.
- Actual assistance server page downgrade during its last category await:
  meaningful RED -> GREEN 1/1, `product-page-read-red/green.tap`.
- Final affected domain/HTTP aggregate: **54/54**, exit 0, 178.64s,
  `.test-artifacts/t31/product-final-domain-current.tap`.
- Inspected :memory: fixture -> `nativeFinanceClone`, disposable D1
  `d1Persist:false`, every native trigger restored: **1/1**, exit 0, 24.49s,
  `.test-artifacts/t31/product-party-native-current.tap`. Actual publication,
  report/triage, pause, retained-SA denial, new-copy exclusion, fake captured
  delivery suppression, personal-party change at commit rollback/no receipt,
  independent withdrawal/replay and preserved separate hold/FKs all pass.

Existing publication browser file contains **five** original journeys. The full
run passed four; its stock-only fixture initially rejected the new outcome GET.
After routing that actual native GET and correcting the obsolete expectation of
a second physical POST, the focused stock journey passed **1/1**, exit 0, 80.18s:
`product-stock-browser-regression-final.tap`. The other four passed in
`product-publication-browser-regression-current.tap`. Thus all five original
journeys pass, including verified native file-copy/blob acknowledgement recovery,
retained price before sending, approve-only/publisher-only separation, physical
pack transfer/mapping, and original in-page draft across a 409/current-case check.
Mobile stock/file screenshots inspected; Chrome and all native fixtures closed.

Root subsequently authorized one exact adjacent intake notice closure. Its native
decision-commit test reproduced current-owner staff enqueue (meaningful RED), then
passed with direct case -> draft -> profile original/current party predicates.
Current-marker staff suppression and fake delivery also pass (**2/2**,
`product-intake-party-green.tap`). This supports assistance without a product link.
Matching additional disposable D1 case **1/1**, exit 0, 22.24s,
`product-intake-party-native-final.tap`: actual decision at party-change commit,
eligible staff copies, stale issued notice/fake handoff suppression, original
first-requested clock and FK preservation. Fixture and worker closed. No schema
change; Product source frozen after this authorized closure. Global typing remains
root-owned. Additional C11 work has its own evidence.


### 2026-11-04 protected-reference/lint follow-through (verification pending)

Actual browser quota RED is retained at `.test-artifacts/t31/product-reference-storage-red.tap`: failure saving the opaque recovery marker still sent one native Product POST. Its committed source also contaminated two later source-reuse scenarios; those are documented as fixture cascades, not separate production findings. The quota scene now has its own genuine fourth submitted Product source.

The hook now observes only a validated opaque projection via `useSyncExternalStore`, stores private wire/body only in token-keyed RAM, and requires a saved matching opaque reference before POST. Legacy private values are scrubbed to opaque metadata without copying them into React state. Invalid/incompatible metadata blocks replacement. Exact in-page wire retries, prior uncertainty across later4xx, strict native success contracts, readonly native outcome recovery, exact original-key removal and retired callback fences remain. Pending controls additionally expose an explicit readonly outcome check without requiring private-draft loss through reload.

`ProductScopeBoundary` is mounted by original actor/source wrappers. A current native denial retires affected private parent content immediately, including nested drafts/evidence when router refresh is unavailable. Propagation remains within physically nested same-actor/same-workspace Product scopes; Seller contexts reuse the existing matching Seller access event, never a customer/staff role inference. Retired denials cannot refresh or curtain a new actor/source. Native source authority remains server enforced.

Lint corrections remove obsolete private-payload mirror effects, bind stock/mapping/base/candidate confirmations to exact native revisions, use independent asynchronous read scopes, and derive render flags from state instead of refs. The intake autosave keeps its original exact pending payload/flight refs in event paths; stable callbacks and the `applyConfirmed` name preserve the existing native flow. Authenticated images use unoptimized framework Image with original protected URLs, with fixture assertions for actual native authorized image bytes and denied unrelated-owner reads.

A further meaningful mounted RED, `.test-artifacts/t31/product-legacy-confirmation-red.tap`, shows a checked legacy confirmation silently following a new native fingerprint on the same actor/product. Confirmation now binds that exact fingerprint. Public-base and replace-candidate confirmations bind their exact immutable/version/revision keys; private text remains retained.

The first broad hydration batch (`product-hydration-scope-current-browser.tap`) is explicitly NOT final-source evidence: parent-boundary edits continued after it launched. It failed7/10, chiefly missing framework-only fixture aliases and a retained test that incorrectly expected later409 to clear a prior unknown. All failed logs remain. That expectation now requires the original marker/request/action/source, byte-identical RAM retry, readonly unconfirmed outcome with zero extra POST, retained private input and native3-event count. Fixture CSS keeps actual app/globals content and scans app/components/hooks/lib plus host classes, excluding generated artifacts. No native business/authority route is stubbed by these framework aliases.

Production and harness files were frozen before the coherent `product-hydration-frozen-browser.tap` run. Its result must be recorded separately when complete. Scoped nonvideo runtime/harness lint is clean. The sole explicit pre-existing diagnostic is `components/products/product-publication-facts.tsx:9` uploaded-product video without captions, distinct from deferred T32 registration-guide video. No invented caption, suppression or video change was made.


### Frozen verification closure and documented recovery overlay

The frozen six-file browser batch completed15/17 (132.97seconds), with one actual failing child plus its parent: the quota test's serialized nested function referenced tsx's unavailable `__name` helper before clicking. All nine other native journeys and six source children passed. Only that fixture routine moved into its actual esbuild bundle; production did not change. The focused source rerun then passed8/8,19.76seconds,zero skips,exit0 (`product-reference-source-frozen-browser.tap`). Together these establish the17 base checks on the captured runtime candidate. The failed frozen log remains retained; no entire batch pass is falsely claimed.

Root approved a further bounded overlay after a readonly wording audit. Meaningful RED (`product-recovery-historical-denial-red.tap`,48.40seconds) showed: (1) a separately authorized actual publisher completed the900 publication while the original reviewer's approval reply was unknown, but its saved-result GET still described approval as awaiting publication; (2) an actual native403 with malformed transport body left current private parent content mounted. The original native action/reference was preserved throughout.

The overlay uses historical confirmation for exact retained retries and saved-outcome GET, while fresh successful POST retains its action-specific copy. Current known401/403 retires private content regardless of body decoding; mutation references remain uncertain when a malformed body cannot prove rejection-before-write. Readonly current-view fetches apply the same current-scope denial before decoding. No native policy, permission, receipt, economic source or backend SQL changed.

Focused actual owner-price/publication plus source/browser overlay GREEN:12/12,zero skips,exit0,54.37seconds (`product-recovery-historical-denial-green.tap`). This includes an independent publisher-only UI changing800→900 while original approval is pending, historical GET confirmation/current published source/no extra publication decision, exact retained owner RAM retry, and malformed native403 POST/current-viewGET/original-outcomeGET. The latter retains the byte-identical opaque marker after an actual lost commit and never resubmits private fields. Parent evidence is hidden even with no usable refresh; retired denial preserves the new actor/source. Native guards and original clocks remain unchanged.

All Chrome contexts/processes closed normally. Production and harness are frozen. `product-runtime-source-freeze.json` captures the19-file base; `product-runtime-recovery-overlay.json` records only the approved runtime differences. Existing native D1 checkout1/1 with five real late-source rollbacks, focused memory7/7 and opaque-reference unit1/1 remain valid.

Screenshots inspected: current390px Product source controls have correct new actor/source, clear inputs and no horizontal overflow. That source fixture's second cover is metadata-only and its broken image is not claimed as media-success evidence. Actual protected image success/denied-owner proof runs in the full native intake journey with genuine uploaded PNG bytes. The current intake mobile screenshot is readable and preserves original assistance clocks/continuation.

Remaining explicit diagnostic: pre-existing uploaded-product video captions at `components/products/product-publication-facts.tsx:9`. No fabricated caption, suppression, media expansion or T32 guide-video work. All other owned Product runtime/harness lint diagnostics are zero. Final combined typing/integration checks remain Root-owned; this note does not close all T31.
