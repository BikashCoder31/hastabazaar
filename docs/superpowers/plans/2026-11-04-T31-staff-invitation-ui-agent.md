# T31 Staff invitation UI — local evidence

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. Isolated in-memory fictional sources, intercepted browser routes at the approved localhost origin, captured invitation mail only. No canonical database, provider send, migration or deployment.

## Changes

`StaffInvitationManager` receives the already authorized internal actor ID and keys its private subtree by that actor. The new `use-staff-invitation-command` retains the exact original private wire in RAM only. Session storage contains a validated actor/operation/UUID and immutable revocation target; no email, grants, form answers or private reason. Opaque storage must succeed before a new write. Current actor headers accompany native requests, and committed-scope callbacks cannot clear a later actor's inputs. Known current access denial immediately curtains the actual Team parent, independently of refresh.

Unknown outcomes keep their original request and RAM body through later 400/409 and malformed 200 responses. Reload offers read-only original-outcome recovery, without reconstructing private inputs. No reset/replacement action discards unknown work. Native creation result validation distinguishes recorded creation from email delivery and current invitation status. Revocation uses the exact retained target; by-ID recovery states only current status, without attributing an uncertain revocation. A valid pending target can be explicitly retried after current native status proof. Legacy actorless UUIDs are read-only probes, never adopted into a new actor/body; another current actor's unconfirmed result retains that reference.

Confirmation captures actual DOM email, role, selected permissions and configured answers before opening review, preserving browser autofill and exact reviewed input. The Team page supplies its trusted actor ID. Existing secure invitation/acceptance/grant rules and backend remain owned by the backend agent.

## Verification

- Meaningful original mounted RED: `.test-artifacts/t31/staff-invitation-native-actor-red.tap`, native POST recorded an invitation without the displayed actor header (17.37s). An earlier CSS/setup failure is retained separately and is not behavior evidence.
- Initial actual native/browser GREEN: `.test-artifacts/t31/staff-invitation-actor-green.tap`, 1/1, zero skips, exit 0, 35.73s. Native commit/lost503, exact later409 and malformed200 retries, one invitation/mail capture, reload GET-only, actor change, create/DELETE denial parent curtain and late original reply isolation.
- Native API/retained access group: `.test-artifacts/t31/staff-invitation-native-final.tap`, 39/39, zero skips, exit 0, 20.40s.
- Expanded actual browser in `.test-artifacts/t31/staff-invitation-overlay-legacy-green.tap`: invitation journey PASS 14.95s. Includes genuine saved revocation/lost503, reload by-ID GET without another DELETE, and actorless legacy UUID withheld from another SA then confirmed by its original actor. No extra creation or mail. Styled 390px screenshot `.test-artifacts/t31/staff-invitation-mobile.png` inspected: readable controls, explicit exact-access descriptions, no document overflow.
- Same batch focused old invitation retry branch PASS 7.66s with `FINANCE_RETRY_MODE=invitation`: original custom answer/version assertions, exact RAM retries and reload GET-only. Other six legacy Finance branches were not selected or claimed.
- That serial batch is **not** an all-green aggregate: retained autofill normal/autofill failed on an obsolete `Form catalog` navigation label after their hydration assertions passed; mismatch control passed. Actual current native label is `Form Management`; the test-only expectation is corrected. Final retained rerun GREEN: `.test-artifacts/t31/staff-permission-actor-red-autofill-final.tap`, 4/4 including parent, 8.60s, normal/autofill unchanged hydration and intentional mismatch control. The unrelated new permission fixture in that same file timed out before behavior assertions and is not invitation or permission acceptance evidence.
- Owned runtime and three fixture files scoped lint: exit 0, no suppressions introduced. Source hashes: `.test-artifacts/t31/staff-invitation-ui-source-freeze.json`.

All tested browser contexts/Chrome processes and Node workers were closed. Backend factual creation/replay and by-ID status contracts are documented separately in `2026-11-04-T31-staff-invitation-backend-agent.md`. No unverified provider delivery claim is made.

Invitation UI source freeze: all bounded owned invitation cases are now verified. Further StaffPermissionManager work is separate ownership; it does not change the frozen invitation runtime.

## Approved configuration-read overlay

The frozen invitation command protocol was retained. Its form loader now passes the trusted actor ID and local Team denial callback. The bounded opt-in native configuration boundary and actual JSON/HTML denial4-case proof are documented in `2026-11-04-T31-staff-permission-ui-agent.md`. Existing no-header404 concealment remains unchanged. An explicit form refresh is available only when no original action is pending. The current actual invitation journey also passed in `staff-access-current-coherent-browser.tap`; later config/retained/native proof overlays are recorded separately rather than relabeling its failed mixed aggregate as a pass.
