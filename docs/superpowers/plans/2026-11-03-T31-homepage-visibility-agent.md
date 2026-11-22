# T31 homepage product visibility — scoped evidence

Canonical checkout: `C:/Users/abinash/Desktop/HastaBazaar`. No canonical database, migration, provider, deployment, live service or Git mutation. Every fixture uses inspected `:memory:` sources; browser traffic is fully intercepted. Video remains deferred.

## Implemented boundary

- Existing Super Admin + `admin.invite`, native published-product/deletion, protected form, audit and atomic repository guards remain. No publication, pricing, discount, seller-model or approval rule changed.
- The rendered trusted actor is sent as reject-only actor intent. An actual old-A/current-B POST previously committed under B; it now rejects before form/body mutation. Current role loss during the native batch rolls back and returns an unconfirmed invocation/403, rather than claiming that the original could never have committed.
- Added readonly GET for the original exact actor/product/request and retained audit/form-answer receipt. It returns original recorded hidden/version/time only, never private reason, custom answers or resubmission body. A later visibility decision does not erase the original result. Another product or actor cannot recover it. Final current identity/role, product and original receipt facts are rechecked together. Opaque request identity uses exact HEX equality for Maria CI parity.
- UI scope is actor + product. An unsent draft stores its original desired Hide/Show and expected version when explicitly opened. A same-product version update retains the text, freezes original intent and disables submit until explicit current-source review. No new expected version or opposite action is silently adopted.
- Shared homepage command hook has an optional isolated product pointer/key and custom native recovery renderer; existing Hero/Occasion marker formats/defaults remain. Private wire exists only in RAM. Reload/legacy UUID allows original GET only. Byte-identical RAM retry is retained. There is no unknown-attempt reset or reconstruction of private inputs.
- Error status alone never clears uncertainty. Non-auth failures need explicit `phase:'rejected_before_write'` and no prior uncertainty. Any invoked mutation/ACK/readback failure is `outcome_unconfirmed`; original unknown survives later4xx. Existing first proved pre-write auth denial handling remains. Ordinary readonly preflight version/action conflicts occur before invocation, retain the draft and permit explicit current review. Current-form refresh is available only after a proved pre-write stale-form rejection; it preserves same-source text/custom fields.
- Retired actor/product responses cannot clear or refresh another private draft. Known denial curtains the private control. No reason/custom answers enter session storage. Product-control and dialog actions have 44px minimum targets and a scrollable mobile dialog.

## Actual evidence

- Meaningful native actor RED: `.test-artifacts/t31/homepage-visibility-intent-red.tap`, actual old-A/current-B POST returned200, expected403.
- Original helper missing-module RED: `homepage-visibility-outcomes-red.tap`.
- Native final6/6 PASS22.56s: `homepage-visibility-native-final.tap`. Actual protected forms/repository/API; original exact replay, role-at-batch rollback, real COMMIT followed by transport failure mapped409 with unconfirmed phase, original GET +one replay effect, later original history, current-role read race and two genuinely published product scopes. Additional exact-request proof focused3/3 PASS10.73s: `homepage-visibility-outcomes-final.tap`.
- Actual browser first5scenes +parent6/6 PASS18.73s: `homepage-visibility-browser-current.tap`.
- Final actual browser +retained homepage-only client regression8/8 PASS28.62s: `homepage-visibility-final-browser.tap`. Six actual scenes: stale actor403; byte-identical RAM retry/one native audit; reload old actorless opaque UUID/GET only; same-product unsent version change/manual current review; retired actor callback; retired product callback. Retained client case covers malformed200, original unknown followed by explicit rejected4xx, exact retry, proved stale-form refresh and retained required custom answer.
- Actual CSS,390px no overflow; `homepage-visibility-mobile.png` inspected. All browser contexts/Chrome/Node closed. Native tests retain actual original audit/form receipts and clocks. No provider send.
- Root independently verified shared Hero/Occasion/content/upload14/14 after the hook phase/default-compatible extension (`homepage` source only; no changes to those producers by this agent).

## Final handoff

Runtime/source frozen for root typing. Shared hook SHA256 `6B65BD2CBD4F3D5481330BF1758FC2A05140DFEFECD14E944E93254206031324`; control `AD4D945E6ABE35707B6822F5FEA7CDCC45E254DF0AFD33CDF5DB2CA0B1AAA823`; native reader `052669E79B472397B9DA0FCB36D6E5C24BBA61A824A5A5292A5698EA40073D80`.

Root supplies the trusted actor prop at the production page. Root owns final global typing and T31 ledgers. This note does not claim whole-T31 completion or a new Maria/native D1 runtime run for this visibility slice.
# Lint-safe hydration follow-up (2026-11-04)

The shared hook now hydrates opaque references through `useSyncExternalStore`, with exact original-key/UUID removal and separate RAM metadata for render. The first combined checks exposed two regressions introduced in this refactor: missing hook-generated nonces for Hero/Occasion, and a four-group UUID validator rejecting genuine five-group IDs. Both failed artifacts remain retained. Nonce generation was restored and one tested validator now serves both `run()` and the external selector. The fixture waits for native POST are bounded and retain a DOM/screenshot diagnostic on failure.

Current actual content/upload and visibility browser checks pass **22/22**, zero skips, 43.05s (`homepage-reference-current-browser.tap`). The genuine hook-generated nonce is explicitly checked on POST; original COMMIT acknowledgement loss, exact retry, GET-only reload, native source/version changes and late actor/product callbacks all pass. The retained homepage-only configured branch passes **1/1**, 4.97s (`homepage-legacy-lint-current-browser.tap`). All browsers/processes closed normally. The current mobile visibility screenshot was inspected: correct new product/title and retained new draft, readable modal and no horizontal overflow.
