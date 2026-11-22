# Release prep

Started on `admin-redesign` at `650b3aad` after the Seller tools completion marker.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| R1 · Readiness branch reconciliation | Main | Done | `0df90d83` | All nine corrections are present. Typecheck and lint passed. Focused suite reported 50 passed and seven native-only skips. The Unicode filename and Vite pin checks passed. |
| R2 · Release manifest and MariaDB rehearsal | Manifest and rehearsal helpers, main | Done | `Release prep: Release manifest and MariaDB rehearsal` | Regression test failed on the prior inventory and passes with all eight pairs. MariaDB 10.11.19 applied the full set. All existing counts matched. The old application started and served its storefront. |
| R3 · Read-only production schema check | Main | In progress | | Verify the report against a disposable database. |
| R4 · Release notes and local final check | Main | Pending | | Release notes, full suite, local package and production guards. |

## R1 reconciliation

The old commit includes the application snapshot alongside the corrections. The correction names come from its readiness remediation plan.

| Correction in `5176420` | On `admin-redesign` | Current evidence |
| --- | --- | --- |
| Refund timing and commission reversals | Present | `tests/commerce-financial-transitions.test.ts` covers original earnings and one reversal for full and partial refunds, before and after remittance. |
| Financial consistency after partial cancellation | Present | The same tests exercise remaining-parcel payment capture, receipts, registered earnings and managed accrual, including replay and rollback. |
| Hosted staff MFA and durable initialization | Present | `lib/security/hosted-policy.ts` and `tests/hosted-security-policy.test.ts` cover provisioning, restart, wrong key or origin, and missing or restored policy. |
| Host-native recovery of the application, MariaDB, media and keys | Present | `scripts/recovery/` and `tests/native-recovery-package.test.ts` verify the paired recovery package, its provenance and an owned target. |
| Cold catalogue image queue | Present | `lib/products/image-work-queue.ts` and `tests/product-watermark.test.ts` retain the 18-photo, shared-work and failed-job recovery coverage. |
| Unicode names for evidence downloads | Present | `lib/http/content-disposition.ts` retains the encoded UTF-8 filename and safe ASCII fallback. Current evidence handling also checks the file extension and uses an attachment for PDFs. |
| Canonical discovery and indexing protection | Present | `lib/seo/discovery.ts`, middleware and `tests/discovery-routes.test.ts` cover canonical public routes, staging and private paths. The current branch also supports the production host's TLS termination. |
| Required native release acceptance and hosted security | Present | `scripts/verify-staging-native.mjs`, `tests/native-release-results.test.ts` and `tests/deployment-security-readiness.test.ts` retain required scenario counts, rejection of required skips, and the hosted security gate. |
| Patched Vite and lockfile | Present | `package.json` and `package-lock.json` both pin `8.2.4`, the version in `5176420`. |

## For the owner

### MariaDB review and apply commands

The rehearsal used the reviewed production-equivalent schema, the release's 0157–0163 prerequisites and an isolated MariaDB 10.11.19 database. The eight owner files left the same row count in each of the 374 existing tables, with 39 schema-provided configuration rows in total. The pre-redesign application at `3fe4d9a6` started against the upgraded database, returned HTTP 200 on its database-backed storefront and reported zero missing schema requirements. The credential-free rehearsal returned `SECURITY_STATE_UNAVAILABLE` from the aggregate health endpoint.

The rehearsal found that MariaDB treats the original `first_cod_reviews.total_paisa` check as part of the column definition. The 0164 companion now replaces that column definition and adds the two intended checks in the same statement. Use the updated file.

Run the schema report on the intended database first and review the individual findings. The commands below are for an owner-approved database that already has the core release prerequisites. Run only the applicable lines in order. If a file appears partially applied or the core schema differs, resolve the findings before continuing. MariaDB DDL can commit between statements. Leave writers stopped if 0164 fails, capture the error and inspect the resulting schema before retrying.

**0164 requires a writer pause.** Stop the web app, jobs and other writers before that file, and verify the flag, both new checks and the replacement trigger before resuming. The other files use additive changes and have no specific writer-stop requirement. Assess operational lock time before changing a busy database.

| Number | Change | D1 companion |
| --- | --- | --- |
| 0164 | Per-customer cash-on-delivery confirmation | `drizzle/0164_customer_cod_confirmation.sql` |
| 0165 | Delivery failure reasons | `drizzle/0165_delivery_failure_reasons.sql` |
| 0166 | Private seller notes | `drizzle/0166_seller_staff_notes.sql` |
| 0167 | Cancellation causes | `drizzle/0167_cancellation_cause.sql` |
| 0168 | Packed parcel weight | `drizzle/0168_packed_parcel_weight.sql` |
| 0169 | Occasion groups and season windows | `drizzle/0169_occasion_discovery.sql` |
| 0170 | Occasion images | `drizzle/0170_occasion_images.sql` |
| 0171 | Delivery partners | `drizzle/0171_delivery_partners.sql` |

For staging, substitute the approved host and account. The MariaDB client asks for the password.

```sh
apply_staging() {
  mariadb --host='<STAGING_HOST>' --user='<STAGING_USER>' --password \
    --comments --binary-mode=1 --database=hastabaz_staging < "$1"
}
apply_staging deployment/babal/mariadb-customer-cod-confirmation.sql
apply_staging deployment/babal/mariadb-delivery-failure-reasons.sql
apply_staging deployment/babal/mariadb-seller-staff-notes.sql
apply_staging deployment/babal/mariadb-cancellation-cause.sql
apply_staging deployment/babal/mariadb-packed-parcel-weight.sql
apply_staging deployment/babal/mariadb-occasion-discovery.sql
apply_staging deployment/babal/mariadb-occasion-images.sql
apply_staging deployment/babal/mariadb-delivery-partners.sql
```

For production, use the separate production host and account.

```sh
apply_production() {
  mariadb --host='<PRODUCTION_HOST>' --user='<PRODUCTION_USER>' --password \
    --comments --binary-mode=1 --database=hastabaz_marketplace < "$1"
}
apply_production deployment/babal/mariadb-customer-cod-confirmation.sql
apply_production deployment/babal/mariadb-delivery-failure-reasons.sql
apply_production deployment/babal/mariadb-seller-staff-notes.sql
apply_production deployment/babal/mariadb-cancellation-cause.sql
apply_production deployment/babal/mariadb-packed-parcel-weight.sql
apply_production deployment/babal/mariadb-occasion-discovery.sql
apply_production deployment/babal/mariadb-occasion-images.sql
apply_production deployment/babal/mariadb-delivery-partners.sql
```
