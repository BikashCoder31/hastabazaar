# Seller registration recovery

**Goal:** Let sellers submit an incomplete application, prepare private product listings, and complete their details from the dashboard for Super Admin review. Preserve incomplete registration progress and distinguish account errors from genuine published-form changes.

**Architecture:** Account-owned drafts and a separate versioned registration intake retain partial answers privately. CAS revisions prevent stale overwrites. `/api/seller-registrations` accepts blank fields, validates supplied values and private documents, and records the submitted application without inventing identity, consent or approval. Completion is evaluated separately and Super Admin approval checks the latest intake and exact documents transactionally. Existing strict application APIs retain their historical contract. Draft access expires 30 days after the last saved edit; periodic cleanup removes expired private bytes. No personal answers or documents are placed in browser storage.

**Execution:** Implement in the canonical checkout, preserving existing edits. Initial implementation used disposable fixtures. On 2026-10-29 the user explicitly authorized a local database backup, the prepared updates, and live local registration checks. Apply only the two reviewed additive migrations below; preserve runtime settings. Do not deploy, purchase SMS or send real messages.

## Review focus

- A contact HTTP 409 must not disable the form as stale; explicit `stale_version` still does.
- Account changes, cross-origin writes and other users' file references must fail closed.
- Partial answers, files, conditional route fields and configured fields must survive navigation; consent must be reviewed again.
- A lost save response, upload failure or stale second tab must never claim unsaved changes are saved or overwrite a newer revision.
- Draft deletion follows confirmed submission only; uncertain submission keeps its exact retry reference and content.
- Expired files cannot be downloaded, reattached or resurrected during cleanup.

## Tasks

1. Reproduce the false stale warning; classify only explicit stale-version conflicts and provide an in-place form-configuration refresh.
2. Keep signed-in email verification; remove phone OTP. Phone is optional but must contain exactly 10 digits when supplied, with a country selector defaulting to Nepal. Never record the phone as verified.
3. Add account-owned draft schema, bounded field/file validation, CAS repository, authenticated no-store API, private file retrieval and bounded expired-object cleanup. Prepare additive D1 and MariaDB upgrade SQL for review, without applying it.
4. Add serialized automatic saving, explicit save status/retry, restore, file replace/remove and navigation warnings. Remove required controls from the registration UI and relax required custom answers only for account-owned registration intake writes; other forms keep their checks.
5. Move bank details, public maker profile/media and product descriptions to the dashboard. Enforce independent bank review before payout and a server-side 7-day public-profile edit cooldown. Keep product publishing and commercial activation approval gates.
6. Verify with synthetic database and mounted-browser fixtures, typecheck, scoped lint, and read-only local preflight. Prepare additive migrations without applying them to the active database.

## Local installation (completed 2026-10-29)

Target: `C:/Users/abinash/Desktop/HastaBazaar/.staging/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`.

The preview was stopped, a consistent SQLite backup was made and verified, and the two authorized migrations were applied transactionally at 2026-10-29T11:49:27.685Z. All 163 existing tables retained their original content, apart from the two expected migration-ledger additions. The three new tables were empty immediately after migration. Integrity was `ok` and foreign-key violations remained zero.

Applied only `drizzle/0076_seller_application_drafts.sql` and `drizzle/0077_seller_registration_intakes.sql`, recording them in the existing `_hastabazaar_local_migrations` ledger. Unrelated ledger gaps were left untouched. The preview was restarted with `npm run dev` at http://localhost:3018. The read-only preflight passed again after live QA: 89/89 forms, sign-in schema ready, local staging with captured email and simulated payments.

Backup: `C:/Users/abinash/Desktop/HastaBazaar/output/seller-registration-upgrade-2026-10-29T11-49-27-463Z/before-seller-registration.sqlite`.

SHA-256: `db6441394bf6a3022199d00cceac2a798e15565f2588fd0804269ff714b86f99`. The same ignored folder contains `backup-manifest.json` and `upgrade-result.json`. Backup verification compared existing table contents, not just row counts.

Equivalent MariaDB SQL is prepared in `deployment/babal/mariadb-seller-application-drafts.sql` and `deployment/babal/mariadb-seller-registration-intakes.sql`; no remote database or deployment has been touched. Database schema declarations and portability classifications include these private durable records and draft upload keys. Do not regenerate unrelated schema snapshots as part of installation.

After an authorized deployment, configure the existing private scheduler to POST `/api/jobs/seller-drafts` with the existing maintenance bearer credential in the Authorization header. Run at least daily, repeating while `deleted` reaches the batch limit (20). Never put the credential in a URL. Expiry immediately blocks draft/file access even if physical cleanup is delayed; cleanup retries interrupted deletes from the ledger. No schedule was installed by this change.

The embedded Nepali video predates this simplified flow; a Nepali notice explains optional fields, no phone OTP, dashboard sections and approval. The video has not been re-recorded for these changes.

## Verification

- Mounted Chrome fixture: empty optional controls, Nepal default, invalid supplied phone, autosave, reopen, custom answer and private file restoration, confirmed submit and draft deletion. Uses synthetic HTTP responses, not the active database.
- Actual optional API with in-memory database: email verification errors remain distinct; blank application accepted; exact retry; cross-origin rejection; owner-only retrieval; dashboard update with 10-digit phone and no phone-verification record.
- Repository integration: incomplete submission, completion, required custom questions relaxed only for intake, stale-version rollback, exact evidence checks, Super Admin authority revoked during approval, and concurrent submission returning the winning reference.
- Bank tests exercise missing/pending payout rejection, ownership and staff review. Profile tests cover first save, exact seven-day boundary and the alternate shop-name editor.
- Existing seller data suite: 46 tests passed. Existing real disposable D1 form-answer tests: 3 passed with loopback access. Broader payout/participation/portability tests passed; older expected bank-document counts were updated for the deferred-bank contract.
- Typecheck and scoped oxlint are run against the changes. The normal local preflight is read-only; the new tables were additionally verified by migration checks and live registration testing.

## Live local verification after installation

- Two clearly named fictional local QA accounts were created through the normal account UI. Email verification used local mail capture; no real email or SMS was sent. Synthetic identity and bank documents are explicitly marked as simulated. These test records remain available locally.
- The complete live registration run passed 22 checks: optional controls, Nepal default, validation of an entered phone, private document/answer restoration after navigation, mobile layout, specific email-verification error without stale-form lockout, verification and submission on the same page, incomplete application acceptance, dashboard rendering and persisted later edits. No browser runtime errors were recorded.
- Eight additional live dashboard checks passed: persisted product description, first profile save, disabled editing during the seven-day cooldown and after reload, bank details submitted later with pending review status, mobile layout, private product draft editor access before approval, and no browser runtime errors.
- The focused API/repository/draft/bank/cooldown suite passed all 10 tests during installation. Super Admin approval and payout restrictions were tested in disposable fixtures; live QA did not approve a seller, publish a product or process a payout.
- Browser scripts, JSON results and desktop/mobile screenshots are stored outside the repository in `C:/Users/abinash/.codex/visualizations/2026/10/28/01a1837a-444b-78e0-852a-f6886db1404e`. Session files in that folder are private test credentials and must not be shared.

Repeat focused flow checks with `node --import tsx --test tests/seller-registration-api.test.ts tests/seller-registration-intake-store.test.ts tests/seller-registration-browser.test.mjs tests/seller-draft.test.ts tests/seller-bank-details.test.ts tests/seller-public-profile-cooldown.test.ts`.
