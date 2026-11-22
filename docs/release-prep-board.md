# Release prep

Started on `admin-redesign` at `650b3aad` after the Seller tools completion marker.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| R1 · Readiness branch reconciliation | Main | Done | `Release prep: Readiness branch reconciliation` | All nine corrections are present. Typecheck and lint passed. Focused suite reported 50 passed and seven native-only skips. The Unicode filename and Vite pin checks passed. |
| R2 · Release manifest and MariaDB rehearsal | Release manifest helper | Pending | | Generate the ordered inventory, check schema requirements and rehearse in a disposable MariaDB 10.11 database. |
| R3 · Read-only production schema check | Main | Pending | | Generate and exercise an information-schema-only report. |
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
