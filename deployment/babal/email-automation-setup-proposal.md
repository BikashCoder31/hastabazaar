# Email automation host and independent watchdog setup proposal

Status: **source artifacts and fake-network tests only; not installed or enabled**. No host, endpoint, credentials, external contact, scheduler, provider capacity or deployment has been configured or verified by this work. The canonical local preview and database are untouched. The separate backup program remains deferred.

## What the two processes do

`scripts/run-email-automation.mjs` invokes only the existing authenticated `POST /api/jobs/order-emails`. That one bounded application job runs the sender and due-reminder evaluator; do not install another worker for the same queue. The launcher verifies the returned environment and fresh observation time, and reports unavailable/unverified responses as failures. Its 55-second HTTP bound accommodates the application's normal 45-second run budget. A timeout can leave the application still finishing its already claimed operation; the durable application claims/handoff fences continue to prevent competing sends.

`scripts/email-automation-watchdog.mjs` must run on a **different host and scheduler failure boundary**, using a contact transport independent of the application SMTP service. Once each minute it invokes `POST /api/jobs/email-health` using the separate `EMAIL_WATCHDOG_SECRET`; this endpoint evaluates persisted evidence and cannot manufacture successful sender/evaluator runs. It does not invoke the sender, execute money operations, change business decisions or restart an unspecified host service.

The watchdog's one-minute invocation is supplied by the independent scheduler; the process performs one bounded tick and exits. Five minutes of missing/failed expected external observations opens one retained episode. A valid application response that already contains a persisted open service incident opens the external episode immediately, avoiding a second five-minute delay after the application's own detection. A missed watchdog interval is labeled `expected_health_observation_missing`, rather than asserting that the application was down.

Recovery requires two **distinct, fresh external healthy observations at least one minute apart**, with both exact service keys `email.sender` and `email.evaluator` healthy and no open incident. Failed/partial/stale/wrong-environment responses break that recovery sequence. One outage and one recovery alert are retained per episode/channel; a later real outage receives a new episode. Reading or acknowledging a notice changes none of this.

## Concrete configuration to review later

Create protected JSON mappings only after the intended host, scope, owners and contact have been selected. The examples below deliberately have `enabled: false` and unreviewed mappings; they cannot run. Use the exact runtime environment returned by the API (`production`, or a separately reviewed remote `development` scope). `staging` is not a runtime environment name in this application. Local staging/test endpoints and localhost are rejected.

Application host mapping:

```json
{
  "version": 1,
  "enabled": false,
  "environment": "production",
  "jobUrl": "https://APPLICATION-HOST.invalid/api/jobs/order-emails",
  "allowedAppOrigin": "https://APPLICATION-HOST.invalid",
  "hostMappingReviewed": false,
  "mappingReference": "REPLACE-WITH-REVIEW-REFERENCE",
  "lockPath": "/reviewed/private/email-sender.lock"
}
```

Independent watchdog mapping:

```json
{
  "version": 1,
  "enabled": false,
  "environment": "production",
  "expectedSince": 0,
  "healthUrl": "https://APPLICATION-HOST.invalid/api/jobs/email-health",
  "allowedAppOrigin": "https://APPLICATION-HOST.invalid",
  "statePath": "/reviewed/private/email-watchdog-state.json",
  "lockPath": "/reviewed/private/email-watchdog.lock",
  "boundary": {
    "independenceReviewed": false,
    "evidenceReference": "REPLACE-WITH-BOUNDARY-REVIEW",
    "monitorHostId": "REPLACE-MONITOR-HOST",
    "applicationHostId": "REPLACE-APP-HOST",
    "schedulerBoundaryId": "REPLACE-MONITOR-SCHEDULER",
    "applicationSchedulerBoundaryId": "REPLACE-APP-SCHEDULER",
    "contactIndependentOfApplicationSmtp": false
  },
  "contact": {
    "channelId": "REPLACE-APPROVED-ONCALL-CHANNEL",
    "url": "https://CONTACT-PROVIDER.invalid/REVIEWED-WEBHOOK",
    "allowedOrigin": "https://CONTACT-PROVIDER.invalid",
    "mappingReviewed": false,
    "mappingReference": "REPLACE-WITH-CONTACT-REVIEW",
    "acknowledgement": "http_2xx_acceptance",
    "providerIdempotencyVerified": false,
    "knownNotAcceptedStatuses": []
  }
}
```

`expectedSince` must be the reviewed original enablement epoch in milliseconds, also mapped consistently to the application's expected health start. Do not move it forward or reset retained state to hide an outage. A state/configuration scope mismatch or corrupt state stops processing; review the specific source and destination before correcting it.

Keep credentials out of both JSON mappings, URLs, cron command arguments and logs. The application-host process inherits only its protected `ORDER_EMAIL_JOB_SECRET`; the independent process inherits `EMAIL_WATCHDOG_SECRET` and the selected receiver's `EMAIL_WATCHDOG_CONTACT_SECRET`. Provision their actual values through the reviewed host's protected mechanism. The application endpoint and external webhook must support header-only bearer authentication; otherwise adapt/review that specific provider before enablement. No actual credentials are supplied here.

All URLs must be HTTPS, use their explicitly allowed origin and exact application path, and contain no user information, query string or fragment. Redirects are rejected. Health responses are limited to 32 KiB and ten seconds; webhook requests are limited to ten seconds and discard the response body. Only its reviewed HTTP acceptance contract is used, rather than parsing arbitrary response text as proof. The sender response is limited to 32 KiB and 55 seconds. No provider body or raw exception is logged or forwarded.

## Alert delivery and durable state

The webhook payload contains only a stable technical event reference, environment, episode number, transition, safe reason category, timestamps and the two service keys. It contains no customer/seller identities, mail content, provider response, credentials, document/bank details or private application records. Contact membership, Super Admin/operations ownership, backups and access remain part of the later explicit contact mapping.

Before every external alert invocation, the watchdog atomically persists and fsyncs a `handoff_started` fence. A transport error after possible acceptance or process death leaves that event held as uncertain. An accepted webhook followed by a failed completion write is likewise fenced on restart. It is never blindly resent. A non-2xx response authorizes another attempt **only** when its exact status is listed in reviewed `knownNotAcceptedStatuses` with a concrete `rejectionEvidenceReference`; a generic 500 may follow a successful handler side effect and is otherwise uncertain. Verified HTTP 429/5xx non-acceptance permits a bounded retry after at least five minutes and honors a longer Retry-After. Other verified rejection requires correcting the contact configuration/credential; an altered configuration fingerprint permits another still-relevant attempt automatically. A recovered episode suppresses an unsent obsolete outage warning.

HTTP acceptance is **not** proof that a human read the alert. `X-Hastabazaar-Event-ID` is correlation only. `Idempotency-Key` is sent only if `providerIdempotencyVerified: true` and a concrete `idempotencyEvidenceReference` have been mapped; a key does not itself establish provider deduplication. The code remains conservative about uncertain outcomes even when that support is declared. Resolve an uncertain event only through the chosen provider's supported correlated evidence and a separately reviewed reconciliation procedure; there is no blind replay/reset command.

The configured state directory must already exist on durable local storage independent of the application host. Replacement writes use a mode-0600 temporary file, file fsync, atomic rename and directory fsync; this POSIX durability behavior must be verified on the selected filesystem. Do not run two monitors against separate state copies for the same channel, delete state after a crash, restore an older copy without external reconciliation, or use ephemeral instance storage. The retained state is bounded to 1 MiB and stops for review at that limit rather than silently deleting episode history. Physical loss of all retained state is outside a restart guarantee and requires explicit review, not automatic replay. This state persistence is not a new backup program.

## Concurrency and host evidence

Both actual CLIs require Linux util-linux `flock --no-fork --nonblock --conflict-exit-code 75`. Each normal entry re-executes under the actual OS lock before any HTTP work. A busy process exits 75 without a competing tick. OS ownership is released after process death; there is no orphan owner-file lock or age-based stealing. Non-Linux hosts and missing/unsupported flock fail closed. An internal child invocation is accepted only from its matching launcher parent; it is not a documented operator bypass.

The local Windows tests inject a lock runner and do not prove a Linux kernel, filesystem or cPanel installation. Before enablement, record actual Node 22.13+ and util-linux capability/flags, lock-path sharing across all workers, state-directory permissions/durability, signal/process-group behavior, one-minute scheduler support, process/runtime limits and restart behavior. The independent scheduler should restart each terminated monitor at its next bounded tick; no Codex chat or signed-in browser is involved. An OS/monitor-host failure still needs the selected monitoring host's independent supervision route. Do not claim a self-restarting dead scheduler from these files.

`email-automation-cron.example` contains commented proposals for **two different hosts**, `MAILTO=""`, and protected environment-file paths. It installs nothing. Sender and watchdog safe JSON logs need the later host's monitored retention/access policy; nonzero alert-delivery states are visible as safe phases. No new diagnostic purge or backup schedule is created.

## Verification and release gate

Run only the isolated fake-network test during local development:

```powershell
node --import tsx --test --test-concurrency=1 tests/email-automation-watchdog.test.ts
```

The fake suite covers five-minute external failure, persisted-incident detection, deduplicated recovery after two fresh observations, missed monitor intervals, wrong scope/stale/partial health, durable uncertain alert handoff, acceptance followed by lost state completion, explicit rejection/Retry-After, non-JSON HTTP acceptance, redirect/body/timeout controls, missing credentials, sender response scope and injected lock busy/crash/restart contracts. No actual fetch, filesystem state store, webhook, scheduler, provider or installation is used in these tests.

Local evidence on 2026-11-03: **16/16 tests, exit 0**, saved in `.test-artifacts/t29/watchdog.tap`. Both `node --check scripts/email-automation-watchdog.mjs` and `node --check scripts/run-email-automation.mjs` exited 0; scoped `git diff --check` also exited 0. Initial RED cases demonstrated missing artifacts, non-JSON acceptance being misclassified, and a cached pre-incident observation incorrectly advancing recovery. The passing suite verifies their final behavior and unverified-rejection fencing using fakes. Actual Linux flock/fsync semantics and any real endpoint/contact remain untested enablement gates.

Release remains gated on the actual named application host/scheduler, independent monitor host/scheduler, owner/contact/backup mapping, endpoint credentials and reachability, provider acknowledgement/idempotency/reconciliation contract, measured bounded capacity and first-attempt timing, process concurrency/death behavior, durable state and two real successful observations plus clear/progressing eligible backlog. Review that concrete proposal before any separately authorized installation or live enablement. File existence and fake acceptance are not evidence that those capabilities are configured.
