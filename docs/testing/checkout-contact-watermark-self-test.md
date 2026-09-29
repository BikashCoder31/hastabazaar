# Checkout contact verification, COD confirmation and product watermarks

Date: 2026-09-29. Local scope only. Branch: codex/hastabazaar-v1-2-1-staging. Starting commit: af2b210755df0a47e27958665fb628be14122fa3; original checkpoint 6a5f40dc8c6e985fe75abe5d0db5898b1e39430f remains an ancestor.

## Accepted behavior

- Customers may browse and use the cart before verification. Placing a new order requires an authenticated active customer with verified current email and Nepal mobile number. Existing email ownership proof is reused; unchanged contacts remain verified. Gift-recipient details are separate. Existing successful exact checkout retries still return their original result.
- Codes expire after ten minutes and have five attempts, a one-minute resend delay, account/network rate limits, and a shared delivery cap. CONTACT_DAILY_SEND_LIMIT defaults to 100 per 24-hour window and accepts positive integers up to 10000. Failed configured sends consume budget. Unconfigured delivery fails closed.
- First mailbox verification retains the existing account-takeover protection: revoke old sessions and unproved password credentials, then keep the current browser signed in using a new proven session. The verification panel explains how to set a verified password afterward.
- New first-time COD orders of NPR 5,000 or more require manual confirmation before packing or delivery. First-time means no delivered purchase history; pending/cancelled orders do not waive the check. The threshold includes delivery and discounts, before shopping-credit deduction. Each qualifying pending order receives its own hold.
- Admin or Super Admin with current order-management permission can confirm the buyer/order with a recorded reason. Another Super Admin is not required. Confirmation is audited, bound to the exact actor/order/request/reason, idempotent, and protected against cancellation and permission races. Cancellation remains available. Existing orders and financial snapshots are not rewritten.
- Customer receipts/history/tracking, seller/admin views, and order emails show Awaiting COD confirmation while held. Server checks and database triggers prevent packing, readiness, outbound assignment/pickup/dispatch and delivery during the hold.
- Uploaded JPEG/PNG/WebP product photos receive a subtle baked-in HastaBazaar corner mark on a separate display derivative. Originals remain private and unchanged. Seller photo selection shows a customer preview. Super Admin > Business Settings > Product photo watermark controls enabled state, corner, width (8–35%) and opacity (10–80%). Default: enabled, bottom-right, 18% width, 28% opacity.
- Media authorization is checked before original or cached derivative access. Original bytes, policy/version and renderer version determine cache identity. Processing errors fail closed; query parameters cannot expose originals. Videos and unrelated category/hero/review media retain their existing paths.

## Preservation and local environment

The existing localhost:4173 guarded preview and persistent local D1/R2 stores were reused. No reset, deployment, production migration, live message or payment occurred. All 38 pre-existing modified/untracked files were hashed before editing and remain outside this task's staging scope.

Online SQLite backups preceded additive migrations 0064, 0065 and 0066. Each migration ran transactionally with foreign-key checks and original-row equality: 141, 144 and 145 pre-existing non-ledger tables respectively were unchanged. No verification or hold backfill was performed. The 0066 migration adds explicit non-null confirmation-evidence guards without rewriting 0065 or historical data.

Browser accounts and fixtures are explicitly fictional. The new buyer was created through the registration UI. No verification flags or balances were edited to make acceptance pass. A proposed direct product fixture insertion was rejected by automatic approval review; acceptance uses normal seller submission and staff review instead.

## Verification and review ledger

- Product watermark/configuration/access/bridge tests: 38 passed; meaningful RED failures observed before implementation.
- Contact core, mounted UI, checkout routes and JSON envelopes: 69 distinct tests passed in the final targeted executions. Covers malformed success responses, stale owner responses, wrong/expired/replayed codes, delivery/proof races, legacy receipt retries, gift recipients and transaction rollback.
- Existing checkout fixture adaptation: 21 targeted tests passed, preserving financial/address/referral/return assertions; opt-in fictional proofs only.
- COD core/route/lifecycle tests: 14 passed, plus a source-parity test for MariaDB guard generation. Covers inclusive threshold, pre-wallet total, history at commit time, role revocation, cancellation, replay, immutable evidence, SQL bypass attempts and actual email wording.
- Related delivery/returns/referral regressions after COD integration: 12 passed.
- Independent specification review followed by separate quality/security review passed for contact verification, watermarking and COD confirmation. Review findings were repaired: stale identity state, transactional approval replay authority, pending email wording, nullable SQL evidence, and MariaDB deletion/character-length parity. Root separately reviewed the shared order-batch insertion authored by the contact reviewer.
- Browser contact flow passed: wrong email code rejected, both channels verified, refresh persistence, changed phone revokes only phone proof, and 390px layout without horizontal overflow.
- Browser watermark flow passed: uploaded product returns marked WebP, original-query bypass rejected by serving the same derivative, all 13 original R2 blobs unchanged; seller preview at desktop/mobile; Super Admin opacity changed through the audited UI and restored to 28%.

- Seller multipart regression: an unselected optional file input was rejected after native multipart parsing converted it to an empty string. The fix accepts only that exact empty sentinel for registered file controls; unknown/duplicate controls and nonempty fake file values remain rejected. Three new regression tests and five related form tests passed, followed by independent specification and quality/security review. Normal seller submission, staff review, approval and publication passed in the browser.
- COD browser acceptance passed on fictional order HK-20260929-C9A6449D19 (NPR 5,180). The customer saw the pending hold, seller packing was unavailable and its direct POST returned 409, and customer/seller approval attempts were denied. One Super Admin confirmed through the reason form; exact replay added no duplicate audit and changed replay returned 409. The entire order row remained unchanged by confirmation. Seller packing then succeeded.
- Final preservation comparison: all 38 protected working files retain their initial hashes. All original rows across 140 of 142 original database tables remain present byte-for-byte, including all customer, financial and governance history. Only Cloudflare internal metadata and four existing rate-limit rows changed through normal runtime activity.
- Integrated TypeScript check passed. Full-repository lint reported two pre-existing restrict-template-expressions errors at scripts/staging/local-d1.mjs:58; that file is unchanged from its earlier commit a1ab038 and outside this task.

The full application build completed successfully. Scoped lint passed for every task-owned source and test file. git diff --check passed. The existing preview remains available at http://localhost:4173; no additional server was started.

## Remaining deployment boundaries

Real SMS delivery is not connected. A configured SMS transport adapter and delivery-provider testing are required before enabling this checkout requirement in a live environment. Local codes are available only for guarded loopback fictional accounts and are clearly labelled SIMULATED. No live email or SMS was sent.

Watermarking covers uploaded product-media images, not curated static seed assets. An extreme object-cover thumbnail can crop a corner visually; the full image derivative retains the mark. Native Sharp availability must be verified in the chosen hosted runtime; unsupported runtimes return a controlled error instead of exposing originals.

Generated MariaDB sources were updated, but no MariaDB server migration or native deployment was executed. Existing documented MariaDB readiness blockers remain; local D1 success is not production readiness.
