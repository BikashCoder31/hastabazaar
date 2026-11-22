# T03 canonical §7 editor reconciliation

Scope: canonical ordinary-seven question editor and retained controlled-extension history. The seven editable / 57 native-task / one inactive classification is unchanged. No canonical database, publication, launcher, payment, email or deployment action was performed. Video remains deferred.

## Concrete corrections

- New question and choice references are generated once independently of labels. Existing keys, `constructor` identities, choice values, order, archived fields and immutable publications remain intact.
- Question / Guidance / Answer format labels replace technical wording. Placeholders sit in Additional options; numeric bounds and whole-number settings sit in Validation options. Built-in and custom references are under Advanced disclosures.
- Archived questions occupy an accessible collapsed group initially. Explicit Archive and Reactivate preserve input focus. Active questions move past archived history in one action, retaining built-in slots and original saved-history facts.
- Reactivation validates the candidate against the current form definition. The explicitly retired seller application contact-time question stays archived. New save, publish and restore attempts cannot reactivate it; old configurations remain readable, and an original audited saved publication can still be recovered without republishing it.
- The new policy error is a dedicated pre-write validation class. Catalog HTTP handlers return 400 for that class, while uncertain transport/readback failures retain their existing classification. The policy runs after original saved-outcome replay, not before it.

## Canonical §7 audit

| Behavior | Current implementation and proof |
| --- | --- |
| Ordinary wording, compact questions and applicable answer formats | Real mounted editor with Question, Guidance and Answer format assertions; built-in display assertions retained in the legacy suite. |
| Stable references and labeled choices | Native ordinary GET/draft/publish preserves original choice values and generates new references; relabeling leaves identity unchanged. Historical `constructor` regression remains. |
| Additional and Validation options | Mounted disclosures hide placeholders/bounds initially and preserve their stored values. Existing number minimum/maximum, whole-number preview and blank-bound validation checks remain. |
| Required/Optional, fixed/automatic fields | Existing protected-field explanations, native base rules, required/archive warning and preview tests remain. No new mandatory registration question or editable money/identity control was added. |
| Ordering, archive and reactivation | Mounted active-order regression, collapsed archive group, keyboard focus and native policy negatives. No field or prior answer is deleted. |
| Reason, draft, preview, publish and restore | Actual native ordinary journey plus retained conflict/adoption/history/restore/exact-retry tests. The original live publication remains byte-equal after drafting and publication. |
| Controlled native extensions | Actual metadata API and mounted retained-extension journey preserve native choices, require purpose/maintainer confirmation, recover a lost committed draft acknowledgment with the same request and deny an old actor tab. No arbitrary native question creation is enabled. |

## Evidence

All targets use fresh `:memory:` actual-schema fixtures or declared legacy UI fixtures. Browser requests are intercepted; the actual editor and relevant native metadata APIs run. No published-form hook or private authority function is stubbed for the native journeys.

- Stable-ID initial legacy run: `legacy-form-editor-stable-ids-current.tap`, 37/38. The only failure was the stale page fixture's incomplete DB mock after form-health integration. It now uses the actual-schema fixture, genuine health reads and real compatibility rows; its focused rerun passes. Ordinary Admin still redirects before any database/catalog read.
- §7 grouping RED: `form-editor-section7-red.tap`, 0/5. Built-in wording RED: `form-editor-built-in-options-red.tap`, 0/1. Archived-order RED: `form-editor-archived-order-red.tap`, four passing checks and the failing ordering child/parent.
- Actual native retirement RED: `form-editor-retirement-red.tap`, 0/3; each new save/publish/restore could reactivate the retired question.
- Current native/repository GREEN: `form-editor-section7-native-final.tap`, **22/22**, exit 0. Includes original audited historical publication recovery and unchanged original rows. The tiny retained published-receipt fixture now loads the two actual 0151 receipt-column statements; no guard or runtime fallback was weakened.
- Current mounted GREEN: `form-editor-section7-final-browser-green.tap`, **7/7**, exit 0, 34.413 seconds. Includes actual optional ordinary draft/publish, stable IDs/values, disclosures, archive/order/focus, native retired-question GET and forged draft POST 400, retained native extension and old-actor denial. Five subsequent explicit TypeScript callback annotations change no runtime behavior; the later authorization-overlay rerun below includes those annotations.
- Current scoped lint: `form-editor-section7-final-lint.txt`, exit 0, no suppressions.
- Screenshots inspected: `ordinary-form-editor-mobile.png`, `ordinary-form-retirement-mobile.png`, and retained native extension denial image. The 390px scenes show the real question/disclosure/preview/history flow without horizontal overflow; retirement is explicit and the action is disabled.

Artifacts are under `.test-artifacts/t03-followup/`. The final full legacy editor rerun `legacy-form-editor-section7-final.tap` passed **38/38**, zero skips, exit 0, **218.860 seconds**. All browser contexts closed through their existing finally blocks and the Node process exited before the heavy slot transferred to Product.

## Source and verification boundaries

The seller-only metadata policy adds a later transitive change to `lib/db/repositories/form-catalog.ts`. The earlier public154 V8 Maria proof remains evidence for its pinned source hashes; it is not relabeled as a native run of this later editor overlay. All five 0154 guards, its paired SQL/producer, original receipt markers/locks, and assisted-security scope remain unchanged. This bounded §7 evidence does not close the root-owned readiness/launcher or complete T34 journey gates.

## Catalog authorization follow-up

Actual-schema tests use the real staff API helper, a real domain-created pending Super Admin invitation and framework authentication transport only. No permission function is stubbed.

- `form-catalog-native-auth-intent-red.tap`: one pass / three failures. Collection and detail GET without an actor header accepted the pending invitation and returned 200. An old displayed-A mutation returned 403 only after accepting newly authenticated B's invitation and changing users/roles/invitation facts.
- `form-catalog-native-final-authority-red.tap`: actual private draft projection returned 200 after the role changed during its real query; the injected race was asserted and private projection was present. A second eligible Super Admin exists in this fixture.
- `form-catalog-native-head-intent-red.tap`: automatic HEAD read also followed the legacy invitation-acceptance path.
- Catalog reads now use the existing-only staff intent helper and check the same current actor again after asynchronous projection. POST actor intent rejects before invitation acceptance. The additional active Super Admin catalogue gate remains. Shared authentication helpers are unchanged.
- Final native authorization: `form-catalog-native-auth-intent-final.tap`, **6/6**, exit 0, 21.109 seconds. Includes unchanged identity/invitation/catalogue hashes on rejection, matching equally eligible B's real draft save, role removal denial and no private history after the asserted mid-read revocation.
- Retained route regression: `form-catalog-auth-existing-routes-final.tap`, **20/20**, exit 0. The prior 19/20 result is retained: its sole failure expected native checkout and other tasks to remain ordinary editors. The corrected assertion uses the canonical seven literal IDs, plus an actual retained native checkout-history GET, unchanged stored versions and no audit writes.
- Final actual editor/API overlay: `form-editor-catalog-auth-final-browser.tap`, **7/7**, exit 0, **33.277 seconds**. All Chrome contexts closed and Node exited before the heavy slot was released.
- Authorization scope lint: `form-catalog-native-auth-intent-lint.txt`, exit 0; no suppressions.
