# Section 1 independent confirmation — 12 September 2026

Requested follow-up: confirm the section 1 release by actually testing it. **Passed locally, including native Linux execution. Not deployed.** This supplements [the implementation report](section-one-security-2026-09-12.md); its earlier statement that Linux native execution was pending is superseded for the local Ubuntu environment only.

## Release under test

`outputs/hastabazaar-security-section-one-2026-09-12.zip`

SHA-256: `e5f33a0e29d23717c1be7c9447cb898af4219efda79de9b0ca55f7f54f489f2f`.

All **3,316 ZIP entries** were independently read, hashed against the saved manifest and extracted into a separate test directory. No runtime source changes or ZIP replacements were made during this retest.

## Fresh test results

| Check | Result and scope |
| --- | --- |
| Exact packaged Linux image dependencies | PASS: Ubuntu WSL, Linux x64, glibc 2.43, actual Node.js **22.23.2**, Sharp 0.35.2/libvips 8.18.3. Native module loaded and converted EXIF-bearing JPEG to metadata-free WebP. Corrupt and over-20MP input rejected. Node archive SHA-256 verified against the official versioned Node distribution checksum list. |
| Extracted production application | PASS: **15 acceptance groups**, fresh synthetic MariaDB database, SMTP disabled. The exact extracted app ran on Windows; a separate Windows native-image dependency overlay was used only for that Windows process. The Linux image check used the actual Linux dependencies inside the unchanged extracted release, with no overlay. |
| Existing staff continuity | PASS: a synthetic existing Admin retained the same password hash after first OTP verification; old session denied; existing password still routed through `/auth/continue` to Admin; verified session could access Admin. No real privileged account was used. |
| Customer transition and recovery | PASS: first mailbox proof invalidated the unverified password; a seeded synthetic reset challenge completed through the real HTTP endpoint; old verified session was revoked; new password granted account access; reset replay was denied; subsequent OTP verification retained the verified password and current password session. No reset email was sent. |
| Other security/browser cases | PASS: invitation proof/expiry/revocation/unrelated mailbox, header-rotation throttling, cross-origin rejection, inactive seller checkout, review upload/privacy, oversized body rejection, desktop 1440px/mobile 390px pages, actual lazy-loaded photo, seller routing and simulated map permission/denial. |
| Regression suite | PASS: **88/88 tests**, zero failures or skips. |
| Fresh native MariaDB commerce | PASS: repeated additive migrations, referral snapshot preservation, credit/ledger idempotency, concurrent overspend rejection, COD stock/payment behavior, cancellation restoration, dispatch/email-queue and private tracking tests. Synthetic local databases only; no email transport. |
| Concurrent status closure | PASS: seller suspension, owner deactivation and product archive each rejected the racing checkout and preserved stock/order counts. |
| Anonymous live GET checks | PASS: `/health`, `/login`, `/forgot-password`, `/shop` returned 200; `/rider` returned 307 to `/login`. Health reported marketplaceReady=true. No new CSP header was present, consistent with section 1 remaining undeployed. No live sign-in, POST, email, migration or customer-record change. |

Evidence is saved under `outputs/section-one-2026-09-12/retest/`: `artifact-verification.json`, `linux-image-test.json`, `integration.json`, `integration.txt`, ten browser screenshots, `tests.txt`, `mariadb-commerce.txt`, `concurrency.txt` and `live-read-only.json`. Reproduction harness: `scripts/verify-section-one-retest.mjs`; Linux probe: `outputs/section-one-2026-09-12/retest/linux-image-test.mjs`.

Two initial probe assumptions were corrected without changing application code: Sharp must resolve via its package entry point, and successful password login first redirects to `/auth/continue` before role routing. Final checks resolve/follow these actual interfaces. Earlier failure files, if present, are retained as superseded diagnostic evidence.

## What this does and does not confirm

This confirms that the saved release artifact works in the tested local environments, including its actual native Linux image dependencies and the previously described password transition. It does **not** confirm Babal's precise glibc/CPU/dependency-symlink configuration or authenticated production behavior after installing the new migration. The live health result belongs to the existing deployed release and does not validate section 1's schema.

Babal runtime preflight, the additive migration under maintenance, deployment and designated-account production acceptance remain pending explicit authorization. Real Google OAuth/inbox delivery was not tested. Existing customer data, uploaded media, recorded rewards/discounts, return snapshots and live staff access were not touched. Deposits and withdrawals remain disabled. The loopback synthetic database is stopped after the tests; test files remain local and outside the release.
