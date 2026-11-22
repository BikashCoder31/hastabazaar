# T31 C11 security workspace — investigation checkpoint

Canonical checkout only. No canonical data, real transport, account bootstrap, live grant or MFA business policy change. The bounded actor-scope correction is implemented and locally verified; root-owned global integration/typecheck and the wider T31 remain open.

## Confirmed native mismatch

`lib/security/request.ts` resolved a real current hosted session but ignored the original screen's `X-Hastabazaar-Actor`. `securityStatus` returned no internal account ID, and `components/security/security-workspace.tsx` sent no intent. The existing fresh-password and signed state guards correctly authenticated B; they did not bind a screen that still intended A.

Actual disposable `:memory:` authentication fixture: A/B are existing staff accounts with real password hashes, real primary hosted sessions and the same legitimately allowed fictional password. An A intent through B's actual session returned B status200 and setup200 and changed B's signed security account. Expected403/no B change failed. Artifact `.test-artifacts/t31/security-actor-intent-red.tap`. No activation, recovery-code consumption, bootstrap, email or role grant was involved.

## Narrow backend correction

`securityActor` now rejects only a present, nonmatching canonical internal actor intent after native session/account resolution and before rate/fresh-password/store actions. Absent-header compatibility remains; the header grants no authority. Status adds trusted `user.id` and rechecks the native current actor/session/role after its asynchronous private reads.

- `node --import tsx --test tests/security-actor-intent.test.ts`: **2/2**, exit0,0.864s in `.test-artifacts/t31/security-native-scopes.tap`. Wrong A intent cannot read/change B, correct B intent still starts its own pending setup, A/roles remain unchanged, and an actual role removal interleaved after credential read denies the final status without changing signed account data.
- `node --import tsx --test --test-name-pattern='changing a saved credential|post-rollout Admin' tests/admin-security-negative.test.ts`: **2/2**, exit0,1.168s in `.test-artifacts/t31/security-native-existing-guards.tap`. Existing credential-race rollback and post-rollout Admin setup rules remain enforced.

## Actual mounted RED and bounded UI correction

`tests/helpers/security-intent-fixture.ts` reuses the inspected disposable authentication schema and actual password-only proof statements; both ordinary Admin sessions are verified by native `staffSessionIsVerified`. No fabricated role/fresh-password predicate. Setup under an already-authorized optional session must retain its existing cookie, as the existing native contract requires.

`tests/security-scope-browser.test.ts` mounts the actual workspace and actual status/setup routes, intercepts every network request, and uses real browser HttpOnly cookies. It is prepared to check old-A/current-B rejection, no B mutation, immediate private curtain, focus-time scope recheck, a delayed but already-committed A setup result, clean B reload and correct B setup. Only pending setup is exercised; factor activation/recovery/bootstrap/mail are outside this test. The first meaningful mounted RED reproduced missing intent, Bsetup200 and a changed B signed account. An earlier harness selector ambiguity was corrected by targeting the actual fixed setup-password field; it was not a production defect.

The UI now binds its first validated native status internal ID, sends that reject-only intent on all subsequent security GET/POST requests, and refuses a different successful status ID. Known401/403/current-account denial synchronously retires that original view, clears private fields/keys/recovery state, and requires an explicit clean reload. Focus/pageshow/visibility checks revalidate the bound actor. Generation and unmount guards prevent late original responses/feedback from restoring retired private state. Password/codes stay in RAM; no storage, business MFA/session lifetime, factor-claim or native cookie policy changed.

- Actual browser `node --import tsx --test tests/security-scope-browser.test.ts`: **1/1**, exit0,7.468s case /8.609s process, `.test-artifacts/t31/security-scope-browser-green.tap`; meaningful RED retained in `security-scope-browser-red.tap`. It checks actual native HttpOnly cookie changes, no B mutation, private curtain, focus denial during an already-committed A setup, late-response suppression, unchanged native authorized-session cookie behavior, clean B reload/own setup and no browser storage/390px overflow. The denied screenshot `security-denied-mobile.png` was inspected: generic safe copy only, no private controls. Chrome/context closed in finally, Node exited, heavy slot explicitly released to Gift.
- Final focused native three-file command with the actor/current-role/credential-race/post-rollout/access test-name filter: **5/5**, exit0,3.723s in `.test-artifacts/t31/security-final-memory.tap`. No bootstrap action/mail was selected.
- The older `admin-security-ui.test.ts` status fixture now includes the required trusted internal ID. Its broad backup/security browser suite is not claimed as run; the actual native scope journey above is the acceptance evidence.

Root owns final typecheck and the complete T31 verdict. This is bounded Security actor/privacy closure, not a broader MFA business-policy audit or a deployment claim.
