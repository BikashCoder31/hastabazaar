# T31 Incoming private journal and native recovery

Canonical checkout only. No canonical data, launch, real bank/mail/payment, deployment or Git state changed. Approved one-eligible-Super-Admin policy and every original money command, reservation, source/funding/party guard remain unchanged.

## Actual defects and bounded correction

Manual Incoming and COD stored complete private drafts/pending wires in sessionStorage. The genuine mounted Finance test reproduced the private marker in browser storage (`finance-private-journal-red.tap`, exit1). Private bank/payer/evidence/handover/cost inputs now remain in actor-owned React page memory. Same-actor A→B→A RAM return works; another actor/source receives no former draft or late callback.

Only versioned actor/action/source/request references survive reload. Cash creation uses the original nonce as its pre-creation source, never its private handover identity. A positive read is backed by the actual immutable native command receipt and its exact result relationships, with current action permission/SA checks. No lookup allocates money or grants current party/funding eligibility. Historical incoming facts remain historical; recovery advises reviewing refreshed balances.

The new read-only API covers all eight Incoming actions. It proves bank credit, allocation, claim review, fulfillment release, actual bank reversal, COD, actual company cash and exception triage. A cost-only COD result points to its actual parcel: it cannot manufacture a paid cash allocation. A native release RED exposed an incorrect action suffix in the new reader, corrected to the existing `fulfillment.released` fact (`incoming-outcomes-release-red-native.tap` → `incoming-outcomes-release-green.tap`). The earlier fixture failure attempted a separate release after automatic release; the final test deliberately retains a real paid order while its customer is unavailable, restores that availability, and executes the actual release.

Legacy private entries are sanitized without adopting their bodies or guessing an actor from a browser key. A defensible nonce remains an unclaimed opaque reference until an actual own native receipt proves actor/action/source. Wrong-actor or absent proof remains unconfirmed, with no new/replacement/replayed operation. The final mounted proof covers recorded actorless recovery, unproved nonce and explicitly different actor.

Current native COD403 plus HTML body and failed refresh left the bank sibling's private fields visible (`finance-current-denial-sibling-red.tap`, exit1). A current-lease-only actor-scoped Incoming denial signal now curtains the parent/child workspace immediately. Retired callbacks cannot emit it; original opaque references and RAM wires are retained.

Read-only Incoming and evidence GETs use existing-only staff intent. Actual pending-invitation evidence GET previously changed users/roles/invitation before returning a missing-bucket503 (`incoming-file-read-identity-confirmed-red.tap`); the new native negative proves no identity/grant mutation. An equally eligible actor switch rejects before reading private POST input. Native mutation authorization remains authoritative.

## Verification

- `node --import tsx --test --test-concurrency=1 tests/incoming-command-outcomes.test.ts`: **6/6**, exit0,20.690s, `incoming-outcomes-current-native-final.tap`. Actual complete-schema SQLite `:memory:` domain commands, not Maria/D1. All eight outcomes, source mismatch, zero-write recovery reads, pending invitation, actual evidence GET and equally eligible actor/body-unread negatives.
- `node --import tsx --test --test-concurrency=1 tests/finance-private-journal-browser.test.ts`: final **1/1**, exit0,21.169s, `finance-current-denial-sibling-green.tap`. Real staff helpers and actor headers, genuine domain APIs, all requests intercepted; no publisher hook stub. Actual bank COMMIT→503→identical RAM retry yields one receipt. Separate actual COMMIT→503→reload uses GET only and yields one additional receipt. Legacy and native malformed-denial/offline-sibling checks pass. Original A/B/source/exact-retry/late-response checks remain.
- Original expanded successful scene before the final denial case: **1/1**,22.800s, `finance-private-journal-expanded-green-2.tap`. Its first strengthened run failed only because the real staff helper needed the standard Next navigation transport stub; retained as `finance-private-journal-expanded-green.tap`.
- Scoped source/client/tests lint **0** (`incoming-private-current-lint.txt` and `incoming-denial-current-lint.txt`); no suppressions.
- All browser contexts and Chrome close in finally; Node exits0. Final mobile screenshot `finance-private-journal-mobile.png`; actual DOM scroll width≤390 and no page errors.

Artifacts above live in `.test-artifacts/t31/`, lint in `.test-artifacts/t34/`. Source hashes: `.test-artifacts/t31/incoming-private-journal-source-freeze.json`.

Evidence correction: the first copied successful test still used `finance-current-scope-mobile.png` and overwrote that PNG. Original TAP/test-source evidence is intact, but that shared PNG is not an old frozen screenshot. Final source uses the unique screenshot path above; no historical image was reconstructed.

## Separate lint overlays

DTO exclusions retain private-field removal via unused aliases; local newly-created Sets iterate directly; payout audit JSON retains identical keys/order; evidence multipart fields are captured once and string/File-narrowed. SQL, money guards and economics are unchanged. Actual affected memory regression **15/15**, exit0,118.272s: `finance-runtime-lint-regression.tap` (exceptions, payout API, recovery dispositions, private evidence, common fee routes). These source edits are explicit overlays, not retroactive native proof.

Common fee hydration now uses the existing opaque external store with a RAM-owned preview nonce, avoiding effect-driven state while retaining uncertain-original recovery. Scoped lint0; its affected mounted regression is still pending. Broader Finance/program/security compiler lint remains open. This note does not close T31/T34, assert native-adapter acceptance, or authorize merge/release/deployment.
