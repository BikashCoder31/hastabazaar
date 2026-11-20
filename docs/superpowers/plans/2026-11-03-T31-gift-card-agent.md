# T31 retained Gift cards — A06/C10

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. This slice follows Fees/programs §9–12, Email §5/D22 and the approved paired-screen C10 requirements. Root owns the overall T31 ledger. No canonical database, schema, live payment, mail provider, launcher or Git mutation was used.

## Original source and recovery

`GiftCardForm` is keyed by the authenticated actor and issue/redemption mode. The native APIs use the shared reject-only actor-intent convention. Account redemption resolves a present intent without provisioning another account. Existing Super Admin issuance authority, positive safe money range, single-use redemption, balanced immutable wallet entry and exact form replay remain authoritative.

`use-gift-card-command` retains the exact original JSON only in RAM. Session storage contains actor/mode/request metadata. Reload can only GET the original native result. Unknown transport, malformed success and unclassified409 remain owned and block a replacement. A definite first pre-write denial can clear its unclaimed marker; a post-batch access classification remains unconfirmed and curtains the private view. Issuance denial does not emit or consume customer-account denial events.

The old actorless issuance UUID is inspected read-only. It is never assigned to a guessed issuer or resubmitted with reconstructed values. Another staff account receives an unconfirmed result; the actual original issuer can confirm its native record. Invalid references stay blocked with Help guidance.

The read-only issue and redemption GETs bind current authority to exact original gift/audit facts and, for redemption, its immutable wallet entry. Their final SQL checks current active identity/role and the original receipt. Responses contain only request status and safe original reference/value. They never read or return the bearer code or code hash. First-response codes remain RAM-only and cannot be recovered from history.

Admin and wallet pages now mount the actual actor and link exact `giftId` records to real `gift-record-…` anchors. The safe staff record can be read beyond its latest100 list; private answer history remains bound to its original issuer. Customer history stays owned. A final role/identity/profile/source proof follows all private history awaits.

## Common operational outcomes

Native issue/redemption batches append `business.gift.issued` and `business.gift.redeemed` through the existing common factory. Actual party and every currently eligible Super Admin receive one copy per channel, including the acting SA. The owner's historical `gift:<id>:issued|redeemed` in-app request identity remains stable; retries leave existing read state untouched. Historical rows are not reset or retrospectively fanned out.

Currentness uses the exact native gift/audit and redemption entry plus current recipient authority, including immediately before fake handoff. Safe summaries distinguish the original issuance/redemption from the current wallet balance and contain no code/hash, custom answers or other customer identity. Links resolve the real protected original record.

## Executed evidence

- Actor-intent RED: old issuer intent created credit as another current SA201; old buyer intent redeemed into another account200. Both now403 without financial writes.
- Native lost-ack RED: actual atomic issue/redemption committed, then their acknowledgement failed; both formerly409, now explicitly unconfirmed503. Original facts remain recoverable.
- Mounted RED: actual issuer prop change retained123.45 in the other actor's form. Actual form/API GREEN1/1,10.49s, `.test-artifacts/t31/gift-source-browser-current.tap`; exact RAM retry and native reload recovery for both modes, no private browser storage, mobile width. Screenshot `gift-card-mobile.png` inspected.
- Domain/capture13/13, `.test-artifacts/t31/gift-native-domain-final.tap`: native audit/wallet proof, own/foreign source, final role read race, native caps/replay, eligible-SA delivery, revoked queued recipient suppression and no resend after captured acceptance. Fake capture only.
- Actual atomic role races2/2, `gift-atomic-authority-current.tap`: loss at the real issue/redemption batch rolls back financial and notice writes and returns scoped403/unconfirmed.
- Actual page/source scope2/2, `gift-page-scope-current.tap`: exact older record outside latest100, final role revocation, unowned customer source denial.
- Existing native forms/privacy/access regression6/6, `gift-form-native-regression-current.tap`: original custom answers and native gift commitments/replays remain linked.

## Final local checkpoint

- Final combined isolated memory17/17 PASS, exit0,64.44s: `gift-native-final-memory.tap`.
- Disposable native D1 money race1/1 PASS, exit0,16.93s: `gift-native-d1-final.tap`. The inspected memory fixture was copied with `d1Persist:false`; every original native trigger was restored before the actual competing redemptions. One liability, one winner/entry,10 original dedup notices and FKcheck0. Worker disposed.
- Expanded actual mounted/API browser1/1 PASS, exit0,10.76s: `gift-expanded-browser-final.tap`. In addition to the original cases: legacy actorless reference stays read-only under another SA, actual issuer can recover the original record, invalid/extra-key marker blocks replacement, first-response secret stays out of storage and disappears on actor switch.
- That expansion exposed a meaningful retired-first403 RED (`gift-retired-denial-red.tap`): the native request was rejected before writing, but its old actor marker survived scope retirement. The correction removes only the matching old actor/mode/request marker on explicit native `access_denied_before_write` and no earlier uncertainty; no new-view state/callback runs. Unknown and post-batch403 remain owned.
- Existing Gift-only form browser regressions4/4 PASS, exit0,30.90s: `gift-existing-browser-final.tap`. Custom required answer, exact frozen RAM payload through malformed successes/network/unclassified409, GET-only reload recovery, fresh correction after proven invalid code, and true stale-version hold.
- Root typecheck's duplicate/code narrowing diagnostics were corrected with a validated native result constructor, plus exact browser callback parameter types. Root owns the final combined typing result.

Gift production source is frozen for root's final integration check. All test Chrome, Node and disposable native workers exited. The source changes introduce no new financial decision, permission, schema or task store. T31 as a whole remains under root's ledger.
# Render-state lint follow-up (2026-11-04)

The hook now renders explicit opaque request/has-wire state rather than reading mutable refs during render. Current actor/mode hydration is independent of callback identity; the denied callback is updated in an effect. Native money/receipt/API logic is unchanged. Scoped oxlint passes without suppression. The current actual Gift actor/mode/exact retry/reload/browser scene passed in `owned-controls-remaining-browser.tap` (the full group is **10/10**, 49.67s); Chrome closed normally.
