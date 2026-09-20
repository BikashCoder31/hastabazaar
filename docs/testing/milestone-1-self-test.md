# Hastabazaar v1.2.1 — Milestone 1 self-test package

Status: local staging only. Production deployment, production migrations, real email delivery, real payments, live agreements, and commercial activation are not approved.

## What Milestone 1 contains

- A recoverable preserved source baseline and isolated Git worktree.
- Fail-closed disposable local staging with separate D1/R2 state, captured-mail mode, simulated-payment mode, fictional recipients, and a recoverable reset.
- Versioned Super Admin Business Settings and Program Management with effective dates, controlled financial/sensitive approval, history, previews, and Applications Only mode.
- Shared Registered Seller and Managed Maker onboarding/profile foundations.
- Exact Yes/No PAN/VAT entry; PAN-only and VAT evidence are separate; Managed Makers need no fake tax identifiers.
- Public maker city and identity separated from private operational addresses and verification evidence.
- Optional craft-specific experience, social links, profile image, maker video, and product-specific video support using the existing bounded upload validators.
- Pending applicants can edit the maker profile and prepare private product drafts; publication, orders, and commercial activation remain blocked.
- Super Admin review shows route, progress, outstanding responsibility, private evidence/media, public preview, agreement state, and activation readiness. “Approved for Activation” does not grant the seller role or enable selling.

## Safe local access

Use the isolated worktree:

```powershell
Set-Location 'C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala'
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:NODE_ENV='development'
$env:APP_ORIGIN='http://localhost:3000'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
npm run staging:verify -- --initialize
npm run dev
```

Keep that terminal open. In a second PowerShell window, set the same six environment variables and run:

```powershell
npm run staging:verify
npm run staging:seed
```

Open [http://localhost:3000/local-testing](http://localhost:3000/local-testing). The local role switch creates no password and exposes no credential. It is unavailable in production builds and accepts only loopback requests.

Fictional identities:

| Switch | Fictional identity | Purpose |
| --- | --- | --- |
| Customer | `customer@local.hastabazaar.test` | Managed Maker applicant/requester |
| Seller | `seller@local.hastabazaar.test` | Registered Seller workspace |
| Admin | `admin@local.hastabazaar.test` | Operational permission checks |
| Super Admin | `superadmin@local.hastabazaar.test` | Settings and application reviewer |

Every seeded business record is marked `SIMULATED — NOT VALID FOR PRODUCTION`. No company-registration placeholder is published, no live issuer is asserted, and no production readiness gate is bypassed.

## Owner checklist

### 1. Environment and settings

1. Run `npm run staging:verify`.
2. Expect Pass for runtime isolation, marker, local DB/R2 bindings, Node, captured mail, and simulated payments.
3. A stopped local server is honestly reported as Not Verified. Production hosting remains Not Verified because no production connection is attempted.
4. Switch to Super Admin and open `/admin/business-settings`.
5. Confirm current/draft/scheduled values, impact text, preview, effective date, and history are visible.
6. Open `/admin/programs`; confirm both implemented target models are listed but remain Applications Only in Milestone 1.
7. Confirm the Managed Maker field is named **platform retention rate**, with the 9% staging demonstration clearly separate from independent-seller commission. Fixed supplier-price purchasing must not show an automatic 9% deduction.

### 2. Managed Maker journey

1. Switch to Customer and open `/sell/application`.
2. Expect the seeded “Fictional Mithila Clay Studio” application, Managed Maker route, Applications Only, maker readiness, product readiness, and an outstanding-action explanation.
3. Edit the shared maker profile. Leave experience, social links, and media blank; saving must still work.
4. Add valid optional craft-specific experience and one allowed social URL; refresh and confirm it persists.
5. Open `/sell/application/products/new`, save a draft, and confirm no public product is created.
6. Try a normal product submission/purchase route while pending; the server must continue to deny publication and selling.

### 3. Super Admin review

1. Switch to Super Admin and open `/admin/sellers`.
2. Open the fictional Managed Maker application.
3. Confirm selected route, application stage, Applications Only, outstanding responsible party, public preview, private operational address, documents/media, agreement state, and legal seller/invoice issuer/payout beneficiary fields are distinct.
4. Request a correction with a reason; switch back to Customer and confirm the next action is explained.
5. Return as Super Admin and use **Approve for Activation** only after restoring the expected review stage.
6. Confirm this changes maker readiness only: it must not publish products, grant the seller role, assign an issuer, or accept orders.
7. Reject a disposable re-seeded application with a reason and confirm the applicant cannot self-approve or reactivate it.

### 4. Registered Seller compatibility

1. Switch to Seller and inspect profile/products/workspace pages.
2. Confirm the preserved registered-seller fixture still works and uses its independent-seller path.
3. Open the public maker page only for an active fixture and confirm city/town—not the private workshop address—is shown.
4. Confirm historical seller/product structures were preserved by additive migration; no existing order, invoice, agreement, payout, or balance is rewritten.

### 5. Permissions and negative cases

1. Switch to Admin and attempt Super Admin Business Settings/Program Management URLs; access must be denied.
2. As Customer, attempt staff review/API URLs; access must be denied.
3. Submit a Managed Maker request containing a tax placeholder or registration value; server validation must reject it.
4. Submit a Registered Seller request without the document required for its selected PAN-only/VAT status; it must be rejected without demanding unrelated evidence.
5. Reuse stale profile version data or duplicate an application; expect a conflict, not an overwrite.
6. Confirm optional video/social/experience fields never become approval failures by themselves.

## Recoverable disposable reset

Stop the local server first. Then use the same guarded environment variables and run:

```powershell
npm run staging:reset -- --confirm-reset=HASTABAZAAR-LOCAL-STAGING
npm run staging:verify -- --initialize
```

The reset does not recursively delete project data. It refuses production/remote bindings, a running staging server, an invalid marker, path escapes, symlinks, or missing exact confirmation. It moves only `.staging/state`, `.staging/media`, and `.staging/mail-capture` into a timestamped `.staging/recovery` folder. Re-run the server and `npm run staging:seed` for fresh fictional data.

## Automated verification commands and recorded results

| Command | Recorded outcome |
| --- | --- |
| `npx tsx --test tests/staging-reset-guard.test.ts` | 4/4 passed |
| `npx tsx --test tests/seller-*.test.ts tests/business-notifications.test.ts` | 41/41 passed |
| `npm test` | 294/294 passed |
| `npm run lint` | Passed with zero findings |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; local/Cloudflare-target routes compiled |
| `npm run build:babal` | Passed; standalone Babal target generated without deployment |
| `node scripts/generate-mariadb-schema.mjs` | Passed; empty-import and recovery schemas regenerated |
| `npm run staging:verify -- --initialize` | Isolation checks passed; stopped app and production reported Not Verified |
| `npm run staging:seed` | 46/46 local D1 migrations applied; four identities and one Managed Maker application seeded; second run applied 0 migrations and remained idempotent |
| Loopback customer/Super Admin page check | HTTP 200; Applications Only, Managed Maker, and both program models present |
| `npm run staging:reset -- --confirm-reset=HASTABAZAAR-LOCAL-STAGING` | Passed; disposable state moved to a timestamped recovery folder |

## Verification matrix and limitations

| Area | Status | Redacted evidence / limitation | Design consequence |
| --- | --- | --- | --- |
| Candidate source baseline | Pass | Main `ca433018`; verified archive SHA-256 recorded in the approved design | Original dirty checkout remains untouched |
| Local runtime | Pass | Node `v22.23.1`; loopback health returned HTTP 200 | Local self-test supported |
| Local database | Pass | Isolated Miniflare D1 under `.staging/state`; 46 migrations tracked | No production DB contact |
| Local object storage | Pass | R2 binding is local, remote bindings disabled, state under `.staging/state` | No production bucket contact |
| Video validation | Pass | Existing bounded MP4 parser tests; maker uploads reuse it | Actual owner playback/moderation remains a manual self-test |
| Local reset/recovery | Pass | Exact marker/confirmation/path tests plus recoverable reset run | Disposable staging can be safely recreated |
| Local mail | Pass (configuration) | Capture-only guard; fictional recipient domain; SMTP variables forbidden | Automated delivery processing is Milestone 2; no real emails |
| Local payments | Pass (configuration) | Simulated mode required | Financial lifecycle implementation is Milestone 2 |
| Babal/MariaDB compatibility | Pass (build/schema) | Additive MariaDB schema regenerated; standalone Babal build passed | D1 compatibility is retained; neither DB path is removed |
| Deployed release | Not Verified | No authorized production release identifier supplied or inspected | Production readiness remains blocked |
| Production schema/runtime/database | Not Verified | Read-only redacted production summary or authorized access unavailable | Do not infer live behavior from repository code |
| Production storage/backups | Not Verified | Provider configuration and backup evidence unavailable | Hosted staging/production storage remains blocked |
| Production scheduler/background jobs | Not Verified | Hosting capability evidence unavailable | Milestone 2 must select a supported mechanism after verification |
| Production SMTP/provider limits | Not Verified | Provider, sender identities, quotas, and scheduler status unavailable | No real notifications or backlog replay |
| Production D1 involvement | Not Verified | No production binding evidence | D1 removal is not proposed |
| Production R2 involvement | Not Verified | No production binding evidence | R2 is evaluated separately from D1 |

The exact missing production input is an authorized read-only inspection path or a redacted operator-provided summary covering deployed release ID, migration/schema version, runtime versions, database engine/version, object storage, backup/restore evidence, scheduler capability, SMTP provider/limits/sender identities, and D1/R2 use across production, staging, previews, tests, and recovery. Do not send credentials in chat.

## R01–R15 continuity

The authoritative mapping remains in [`docs/superpowers/specs/2026-09-21-hastabazaar-v1.2.1-staging-design.md`](../superpowers/specs/2026-09-21-hastabazaar-v1.2.1-staging-design.md). Milestone 1 completes foundations for R01, R03, R04, R06, and R15; R02 and R05–R14 remain explicitly scheduled for Milestones 2–3. Saved addresses, ordering for another person, checkout prefill, customer counts, optional product materials/stories, seller identity, and invoice barcode/QR have not been dropped.
