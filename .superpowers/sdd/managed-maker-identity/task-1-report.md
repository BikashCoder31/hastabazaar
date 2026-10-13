# Task 1 report — Managed Maker identity and approval integration

Status: implementation complete; review checkpoint; full suite running after targeted/static checks.

## Changes
- Required personal details retain existing maker-owned profile. Added required government ID type/document, issuer/description for other IDs, optional separately validated 9-digit personal PAN and optional private personal PAN certificate.
- Separate unchecked managed selling agreement and explicit version validation. Server-generated SHA-256 context binds the displayed canonical company identity, operational account, sale-linked model, exact readable terms and authoritative retention rate. Stale accepted context rejects submission. Transaction guards prevent settings publication after the read from silently changing accepted terms.
- New append-only private `managed_maker_application_details` evidence/history table; acceptance actor/time and canonical company/account/model/fee snapshot commit in the same application transaction as identity documents. No acceptance backfill for legacy makers. Public participation responses exclude new private details.
- Current DB Super Admin authority restricts all managed review actions, review-detail page/repository and private document/PAN retrieval. Existing staffMutationGuard appends active-role equality guards, so a Super Admin downgrade at the batch boundary rolls approval back. Approval requires current-version agreement, owner acceptance and latest government evidence.
- Existing owned maker-profile flow now supports multipart requested corrections, required fresh ID upload and explicit current agreement acceptance, private atomic persistence and resubmission for review. Invalid files/consent fail before upload; exact lost-response retries preserve one action and snapshot.
- New Super Admin-controlled operational company-account setting provides stable entity reference, store name, contact email/optional phone and return address; legal identity/PAN stay read-only in `lib/content/company-details.ts`. Registered sellers retain existing requirements and permissions. Registration help distinguishes having business PAN but missing its certificate from having no business PAN.
- Company account displays separately beside existing activation UI. Controller explicitly ruled that real references must not replace fictional SIM references, so those defaults and all activation/simulation/readiness guards remain intact. No deployment, push or merge.
- SQLite0068, matching MariaDB maintenance migration, DB schema model, generated MariaDB schema/recovery SQL and release manifest updated. Seeded new local staging fixture now supplies explicitly fictional ID and current agreement acceptance; existing makers are not retroactively accepted.

## Validation
- Red phase: new focused test file initially 7 feature failures and 1 existing settlement safeguard pass. Later terms-race/correction tests observed missing rejection and missing resubmission before implementation.
- Focused final: `npx tsx --test tests/managed-maker-identity.test.ts tests/managed-maker-identity-client.test.ts tests/form-catalog-seller-data.test.ts tests/seller-application-required-labels.test.ts tests/seller-participation.test.ts tests/seller-participation-repository.test.ts tests/seller-registration-matrix.test.ts` —68 passed,0 failed (23041ms). Log: `.superpowers/sdd/managed-maker-identity/targeted-tests.log`.
- `npm run lint` passed. `npm run typecheck` passed.
- Additional targeted existing activation, settlement, business-setting and release inventory tests were run; relevant behavior passed; earlier replay fixture assumptions were updated for the newly required ID upload and targeted final run confirmed corrected fixtures.
- `node scripts/generate-mariadb-schema.mjs` and `node scripts/generate-release-manifest.mjs` passed:147 tables,147 triggers,50 migrations.
- Full `npm test`: running; exact status, counts and failures will be recorded after completion. Log: `.superpowers/sdd/managed-maker-identity/full-tests.log`; exit marker `.superpowers/sdd/managed-maker-identity/full-tests.exit`.

## Rendered checks
Browser plugin not available; used the existing bundled Playwright/Chrome mounted-component workflow. Application route choice→Managed Maker required government type/ID, optional personal PAN/certificate, two separate unchecked consent fields; selecting other ID makes description required. Personal PAN validates9 digits. Requested-correction form shows evidence controls and resubmission action. Desktop1440×1000 and mobile390×844; no page errors. Screenshot evidence saved outside repo under system temp `hastabazaar-managed-identity-qa/correction-desktop.png` and `correction-mobile.png`. This verifies mounted real-component behavior, not full live-page styling or production activation.

## Limits/concerns
- Real MariaDB service not available in this task: migration/schema/manifest contracts checked; no deployment migration applied to a service.
- Company PAN remains empty because issued PAN has not been provided; display uses canonical registration-in-progress fallback. No fabricated PAN.
- Immutable acceptance/evidence history intentionally remains protected; retention/legal-hold deletion policy remains the existing readiness boundary.
- Production commercial activation stays blocked by existing readiness/simulation guards. The new application acceptance does not certify supplier tax compliance or waive supplier duties.
