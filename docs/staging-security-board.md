# Staging security setup

Scope is the isolated staging app. The owner performs host steps in order and reports only names, yes/no answers, or checked output without secrets. Hosting and database state stay unchanged during S1. Release files 0164–0172 belong to the owner’s separate Stage 3. Normal gateway acceptance and its deadline stay in force.

| Task | Owner | Status | Evidence or next step |
| --- | --- | --- | --- |
| S1 · Confirm the cause | Codex and owner | Waiting for host check 1 | Reviewed the exact merged commit and the GitHub retry. The read-only deployment-readiness test passed. The host cause still needs evidence. |
| S2 · Enroll staging | Owner | Waiting for S1 | Follow the restricted bootstrap in order after the host evidence is reviewed. |
| S3 · Plan production | Codex and owner | Written for review | The plan below is conditional on a read-only inventory and separate release approval. |

## S1 · Confirm the cause

- Source commit `0fdc112bce598176c6cb7ec78a1fd1297e990592`. The verified Linux package is `hastabazaar-release-ci-45059021181-1` from [Verify and Package run 45059021181](https://github.com/BikashCoder31/hastabazaar/actions/runs/45059021181). Its [GitHub artifact ZIP](https://github.com/BikashCoder31/hastabazaar/actions/runs/45059021181/artifacts/14769627385) has SHA-256 `1e26ac7a9b25e8775788a6c6cbf84538e8c8b01712ff9c22556ea47dcfa58818`. In S2 validate the release archive against its own `SHA256SUMS` and `inventory.json` as well.
- The first staging deployment hit the gateway deadline. The retry verified the archive, then reported “Staging HTTPS readiness or release identity failed.” The gateway uses its rollback path if it has switched the app. An anonymous HTTPS check returned 401 from Basic Auth. That check did not identify the active release. [Retry log](https://github.com/BikashCoder31/hastabazaar/actions/runs/45059021181/job/137330645886)
- The reviewed gateway validates the runtime and compares it with the staging app’s actual selector settings before switching. That runtime validation includes a canonical `HASTABAZAAR_SECURITY_KEY` and the expected policy root. If the installed gateway has those same guards, reaching the HTTPS check makes a missing runtime key less likely. The directory, policy state, enrolment, actual database schema, and served release still need host evidence. The retry message alone does not distinguish them. [Gateway](../scripts/deployment/staging-gateway.mjs) · [Runtime guard](../scripts/deployment/staging-runtime.mjs) · [Selector guard](../scripts/deployment/staging-selector.mjs)

### What `/health` requires

1. The packaged app must answer on the staging origin. The MariaDB adapter needs `DB_HOST`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`. The staging gateway also expects `DB_PORT` and `DB_POOL_SIZE`. MariaDB must pass the schema and data checks below. The security gate runs only after the schema passes. [MariaDB bindings](../lib/runtime/node-bindings.ts) · [Deployment readiness](../lib/operations/deployment-readiness.ts)
2. Hosted policy uses `HASTABAZAAR_RUNTIME_ENV`, `HASTABAZAAR_SECURITY_KEY`, `HASTABAZAAR_SECURITY_POLICY_ROOT`, `APP_ORIGIN` and, for the media separation check, `MEDIA_ROOT`. The isolated host uses the `production` runtime mode label. The app and gateway need the same canonical base64url key for 32 random bytes. The policy binds the exact HTTPS staging origin and that key. The gateway additionally checks `AUTH_PROVIDER`, `CHECKOUT_CONTACT_POLICY`, `EMAIL_DELIVERY_CONFIGURED` and `NODE_OPTIONS`. When QA mail is enabled, it also checks `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `SMTP_RECIPIENT_ALLOWLIST`, `HASTABAZAAR_STAGING_ADMIN_EMAIL` and `HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL`. Those mail settings are gateway checks and can support first-factor sign-in. [Hosted policy](../lib/security/hosted-policy.ts) · [Gateway runtime](../scripts/deployment/staging-runtime.mjs)
3. `/home2/hastabaz/hastabazaar-staging-security` must be a private real directory, owned by the staging service account, outside the app and media. Expected permissions are `0700` for the directory and `0600` for ordinary, non-symlink policy files. `policy.json` is the authenticated policy. `initialized.json` is the authenticated durable initialization marker. A freshly provisioned pending policy correctly blocks readiness. [Policy validation](../lib/security/hosted-policy.ts) · [Owner bootstrap](hosted-security-bootstrap.md)
4. The initialized policy requires a decryptable `auth-private:manifest:v1` row in `marketplace_settings` and intact protected account records for every account it registers. The database must contain at least one active `super_admin` in `users` and `user_roles`. Every active Super Admin needs a valid registered record with confirmed 2-step enrolment or an existing verified, explicitly disabled record allowed by policy. The owner’s setup uses enrolment. Admin enrolment is optional, and every registered Admin record still has to be intact. `operation_transaction_guards` supports the enrolment writes. [Protected settings](../lib/security/store.ts) · [Readiness policy](../lib/security/hosted-policy.ts)
5. With both checks green, `/health` returns HTTP 200 and `marketplaceReady: true`. A failed check returns HTTP 503. The `release` field comes from the running build’s manifest. The gateway separately compares it to the exact package ID. `/health/live` can succeed while readiness is pending. [Health response](../lib/operations/readiness.ts) · [Health route](../app/health/route.ts) · [Liveness route](../app/health/live/route.ts)

### Exact MariaDB requirements

The manifest sections below are the complete schema inventory used by the code. Counts describe the entries in those sections and are separate from the native job’s count of exact assertions.

| Manifest section | Required inventory |
| --- | --- |
| [`requiredTables`](../deployment/babal/release-manifest.json#L1401) | 168 tables and 1,703 named columns |
| [`requiredTriggers`](../deployment/babal/release-manifest.json#L3442), [`requiredTriggerShapes`](../deployment/babal/release-manifest.json#L235), [`requiredExactTriggerDefinitions`](../deployment/babal/release-manifest.json#L332) | 187 triggers, including 19 shape checks and 12 explicit exact-definition overrides |
| [`requiredChecks`](../deployment/babal/release-manifest.json#L452), [`requiredExactChecks`](../deployment/babal/release-manifest.json#L2) | 65 check constraints, including 54 exact definitions |
| [`requiredUniqueIndexes`](../deployment/babal/release-manifest.json#L346), [`requiredForeignKeys`](../deployment/babal/release-manifest.json#L58) | 21 unique indexes and 19 foreign keys with their specified columns and definitions |
| [`requiredGeneratedColumns`](../deployment/babal/release-manifest.json#L415), [`requiredColumnCollations`](../deployment/babal/release-manifest.json#L420) | One generated column and 30 column collations |

The two data rows checked by schema readiness are `marketplace_fee_waiver_control.default` and `customer_fee_waiver_control.default`. Each table must contain exactly one `id = 'default'` row with a nonnegative safe integer `revision`. The manifest requires the `hastabazaar_schema_versions.applied_at` and `version` columns. This health check does not query individual version rows. The protected manifest and staff records are checked separately by hosted security. [Schema readiness](../lib/operations/readiness.ts) · [Control row rules](../lib/operations/fee-schema-readiness.mjs)

**Readiness does not require any of 0164–0172.** The [owner migration inventory](../deployment/babal/release-manifest.json#L1045) is separate from the base requirements. In particular, the required baseline `first_cod_review_immutable` trigger predates 0164. The 0164 replacement and its `hold_source` and customer flag columns belong to the owner-migration entry. The verified package’s native job initialized the selected pre-owner schema from its pinned SQL and passed the exact constraints and `inspectReadiness` on native MariaDB. The local database-free readiness test also passed and verified that pending or unavailable hosted security blocks an otherwise ready schema. This confirms the dependency order in code and leaves the live staging schema unverified. If staging is missing an older core prerequisite, report the exact finding and stop for separate review. [Native gate](../scripts/testing/verify-current-artifact-native.mjs) · [Readiness test](../tests/deployment-security-readiness.test.ts)

### Host checklist

Each row is a separate owner check. Advance only after recording the previous result. Check 1 is the only step currently open.

| Check | Location | Safe result to report | Status |
| --- | --- | --- | --- |
| 1 · Staging app key name | cPanel → Setup Node.js App → `hastabazaar-staging-app` → Environment variables | Is `HASTABAZAAR_SECURITY_KEY` listed? Yes, no, or panel unavailable. | Ready |
| 2 · Gateway key name | Owner maintenance access, private runtime settings in `/home2/hastabaz/.hastabazaar-deployment/` | Yes or no for the name `HASTABAZAAR_SECURITY_KEY` only. | Waiting |
| 3 · Policy directory | Staging File Manager or Terminal | Directory exists yes/no, contents by filename only, and private ownership and permissions yes/no. | Waiting |
| 4 · Active release and HTTPS | Staging `current` link and authenticated staging `/health` | Link target’s release ID, HTTP status, and `release` field if present. | Waiting |
| 5 · Startup log | Staging Node app log only | Relevant lines without secrets from 22 November 19:43–19:47 UTC, which was 23 November 01:28–01:32 in Kathmandu. | Waiting |
| 6 · Staff | Existing staging staff inventory and each person’s security status | Role, email alias, active yes/no, and 2-step enrolment yes/no or unknown. | Waiting |

The host failure is confirmed only when those results isolate a blocking prerequisite. A missing policy, pending Super Admin, MariaDB failure, or the wrong running release calls for a different next step. Keep the original error evidence and keep S2 on hold until S1 is reviewed.

## S2 · Owner-operated staging setup

Follow the [restricted hosted bootstrap](hosted-security-bootstrap.md). This checklist records milestones only. The owner gets the instructions and expected result for one action at a time after S1.

| Step | Acceptance to record | Status |
| --- | --- | --- |
| 1 · Close access | Basic Auth covers every path. An IP allow-list or an owner-approved equivalent denies outside-network access even with credentials. A separate browser confirms both restrictions. If the host cannot provide the controls, stop for the owner’s choice. | Waiting |
| 2 · Stop staging | Staging Node app stopped. GitHub staging deployments paused for the maintenance interval. | Waiting |
| 3 · Place the verified package privately | Original target recorded. Exact package from run 45059021181 checked against digest, inventory, release manifest and file hashes. Only the staging `current` link is changed. | Waiting |
| 4 · Configure the key if missing | Generate privately only for a reviewed first installation with no existing protected state. Owner configures the matching key in the app and gateway, without printing it. | Waiting |
| 5 · Provision and check | Fresh provisioning is allowed only after confirming the directory is absent and the database has no protected security records. The read-only check reports pending and exit 2. Unavailable or conflicting state stops this path. | Waiting |
| 6 · Start inside the access controls | `/health/live` succeeds. `/health` remains HTTP 503 while security is pending. | Waiting |
| 7 · Enroll each active Super Admin | Each uses their own first factor and authenticator at `/account/security` and stores recovery codes privately. | Waiting |
| 8 · Restart and verify | Read-only security check reports initialized, ready, exit 0, zero pending and no reason codes. HTTPS health returns 200 with `marketplaceReady: true` and `hastabazaar-release-ci-45059021181-1`. Fresh sign-in and access restrictions are verified. | Waiting |
| 9 · Retry the failed staging deployment | Only after the owner reports setup complete. Retry only the failed staging job on run 45059021181, check its receipt and repeat the staging health check. The gateway receipt confirms whether production’s release stayed unchanged. | Waiting |

## For the owner

### Production release evening plan

- **Before the evening.** Complete and time the staging rehearsal. Prepare the exact verified production candidate, its checksums and previous release target, production-only HTTPS maintenance access, a distinct key if this is an approved first setup, and a separate protected policy location. Verify owner access to the first factor, authenticator and private recovery storage. Use the approved backups and tested rollback plan. Use a read-only staging and production schema inventory through their separately authorized operators, with special attention to the existing core prerequisites. Confirm privately whether production already has a policy directory or any `auth-private:` records. Store no values in this board.
- **Choose the provisioning mode from that inventory.** Preserve complete existing policy and key state and use the read-only readiness check. A genuine first hosted security setup uses `--provision-new-host` only after separate approval to provision the retained installation and verification that both the policy directory and all private security rows are absent. The fresh-staging approval does not extend to the existing production marketplace. Use `--recover-existing-host` only for a separately reviewed recovery with intact encrypted manifest and account records, the original matching key, and an approved new policy location. That flag cannot initialize an empty or corrupt security store. The actual mode remains open until that inventory is verified. [Hosted security and recovery](admin-security-and-transfer.md#hosted-security-provisioning-and-readiness)
- **During maintenance.** Restrict outside access and stop the app, scheduled jobs and other writers. Take and verify a fresh backup before any database change. If the owner schedules the separate Stage 3 MariaDB work in this window, review compatibility with the rollback release, apply only the approved companions in order, and verify the schema before continuing. 0164 requires writers stopped. Security readiness itself can be validated before Stage 3 if the base schema is ready. Place the verified candidate with the old target recorded, provision or recover only under the approved mode, and start the candidate privately. Enrol each active Super Admin, restart, and verify security readiness, protected staff sign-in, and HTTP 200 with the intended release ID before reopening traffic. [Migration review and application order](release-prep-board.md#mariadb-review-and-apply-commands)
- **Time allowance.** Reserve an additional 30–45 minutes for the security setup and verification after backup and any schema work. This is a planning allowance. Replace it with the observed staging rehearsal time. Allow more time if mailbox access, host controls or recovery needs review.
- **If enrolment fails.** Keep public traffic restricted and stop the candidate. Preserve the external key and policy files, encrypted records and useful logs. Check that the prior app is approved for the current schema and initialized security state before restoring its release link and restarting it. If compatibility is uncertain or the prior app cannot preserve the enrolled protection, keep the service stopped and use the approved recovery procedure. Leave schema, accounts and policy records in place during an application rollback. [Rollback safeguards](hosted-security-bootstrap.md#4-restart-and-enter-normal-release-acceptance)
