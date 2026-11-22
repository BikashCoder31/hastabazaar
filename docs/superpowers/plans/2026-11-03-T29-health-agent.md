# T29 health and delivery UI evidence — 2026-11-03

Canonical checkout only: `C:/Users/abinash/Desktop/HastaBazaar`. Read Email delivery sections 1–8, System health sections 1–10 and the T29 preparation. Parent owns 0147/0148 schema, ORM/Maria, scheduler/watchdog and common authorization/catalog plumbing; delivery agent owns transport/retries/business queue projection. No main ledger edits.

## Owned implementation

- `lib/operations/service-health.ts`: sanitized independent service observations; missing expected success or eligible first attempt beyond five minutes needs attention. Missing schedule mapping, stale/unknown evidence and empty nonfunctional worker runs never become green. Functional recipient-only probes remain degraded without manufacturing a provider outage. Probe success does not rewrite a failed worker as a successful run.
- `service-health-repository.ts`: explicit environment and immutable run replay; one continuing High incident; detected/monitoring/resolved with revision and source guards in the same batch as transition notice statements. Recovery needs two distinct consecutive successful functional observations at least 60 seconds apart and clear or decreasing eligible backlog with actual progress. Empty worker success cannot close it. A failed observation inserted at the closure boundary rejects the batch. Page reads never open/close incidents. No acknowledgement mutation or cleanup program was added.
- `email-delivery-overview.ts`: current Super Admin `email.delivery.manage` authority before and after reads, separate sender/evaluator and worker/functional evidence, sanitized DTO. Explicit runtime environment before the canonical resolver; absent/invalid/future expected schedule remains Unknown. No off-platform contact is claimed configured.
- Both existing admin email pages use one shared `EmailDeliveryHealth`, the existing bell/inbox/read protocol, current queue outcomes, cumulative attempts and exceptional Recovery tools. No second bell or backup UI. Business history displays masked recipient and existing protected source destination. Order queue uses durable acceptance/capture/uncertainty/intervention, never attempt-count exhaustion; historical sent rows without transport receipt are explicitly unconfirmed. Exact current transport/configuration backoff excludes first-attempt overdue attention without hiding unrelated/new configuration work.
- Root authorized one narrow `service-health-notifications.ts` repair after a red regression: source creation/currentness requires the latest episode in the exact environment/service and only the sender/evaluator email scope. An old queued recovery cannot claim recovery during a later outage.

Interfaces: `recordServiceHealthObservation(db,input)` (optional `functionalSuccess` defaults to actual positive progress); `readServiceHealth(db,scope)`; `evaluateServiceHealth(db,{environment,serviceKey,expectedSince,now},transitionStatements?)`. Transition hook receives incidentId/environment/serviceKey/episode/outage-or-recovery/observedAt and returns statements for the same atomic batch. `readEmailDeliveryOverview(db,{actorId,environment,expectedSince,now})` is read-only.

## Verification

TDD failures were observed for missing modules, old attempt-count classification, false eligible backlog during provider backoff, false-green empty workers, recipient-only false outage, and superseded recovery still considered current. Fixed only the corresponding owned behavior. Fixtures load actual 0147/0148 DDL; full-source common notice tests load every authoritative migration.

`node --import tsx --test --test-concurrency=1 tests/service-health.test.ts tests/service-health-repository.test.ts tests/email-delivery-overview.test.ts tests/email-delivery-health-render.test.ts tests/email-delivery-pages-render.test.ts tests/order-email-history.test.ts`

22/22, exit 0, 3.31 seconds reported by the runner (3.95 seconds process call). Covers classification, functional evidence, replay/environment isolation, commit race rollback, reserved roles/revocation, sanitized projection, both actual page renders and exact transport-backoff behavior.

`node --import tsx --test --test-concurrency=1 tests/service-health-notifications.test.ts`

Final 2/2, exit 0, 7.63 seconds. Actual common notice adapter and protected staff read route: exactly one outage email/bell; reading does not resolve; first/too-soon functional success only monitors; second sufficiently separated functional success creates one recovery per channel; repeats do not duplicate; obsolete outage is cancelled before handoff; captured recovery never replays. Additional red→green proves prior episode recovery obsolete and non-email service cannot generate email-health notices.

`node --import tsx --test --test-concurrency=1 tests/service-health-notifications-native.test.ts`

1/1, exit 0, 24.91 seconds total; native journey 19.17 seconds. Inspected `createIncentiveDb` applies every actual migration to Miniflare `d1Persist:false`; fictional local-domain actors, captured fake mail only. Existing native guards retained. Native run preceded the final narrow latest-episode predicate, whose memory regression is above; parent explicitly directed no heavy repeat for that predicate.

`node --import tsx --test --test-concurrency=1 tests/service-health-browser.test.ts`

1/1, exit 0, 17.33 seconds. Hidden owned Chrome, every request intercepted, actual health/bell/inbox components, protected read handler and memory source repositories. Read state survives reload and is shared between bell/inbox without resolving outage; one functional run monitors, two separated runs recover once; no browser storage, duplicate events or runtime errors. No application server or provider. Screenshot inspected: `.test-artifacts/t29/email-health-shared-recovery.png`. Unstyled interaction harness, not production CSS visual QA. Sender Working and evaluator Needs attention remain separate. Parent also inspected it.

Scoped `git diff --check` exit 0 (line-ending notices only). No global typecheck/full suite claimed; parent coordinates those. No actual SMTP/network recipient contact, canonical DB change, real scheduler enablement, deployment or new backup program. All native/browser processes and the heavy slot are released.

## Handoff hashes (SHA-256)

- service-health.ts: `9E901A32AB71721EAC90FDBD50D749D4BE544A0A8E52D025DA22ADC2479BB727`
- service-health-repository.ts: `555FDD80D9C852EB4A17A56D684BF7060617C0E7BC3E036DCA68059FD13A043F`
- service-health-notifications.ts: `D96A6FBCC8BBB07B7E0848F313626D8315219B57F8C71B2CB91DC8E29C10AA25`
- screenshot: `59A9B18B5FF661F754ABF2E44C72482148A076E351E046975DA8353D32DC8347`

Remaining integration verification belongs to parent: real orchestrated sender/evaluator/probe observations and independent watchdog, common oversight mapping, global typing/native/Maria and no live enablement claims. Existing exceptional manual result controls still use legacy acceptance-count wording; if capture is included in those counters, wording should distinguish successful processing from actual provider acceptance rather than invent receipt evidence.
