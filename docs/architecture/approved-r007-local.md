# R007 approved gift cards — local implementation, 13 September 2026

The owner-approved recommendation is implemented: Super Admin chooses a positive value, a cryptographically random bearer code is redeemable once by an active signed-in customer, there is no expiry and no additional business issuance cap. Integer paisa is bounded by Number.MAX_SAFE_INTEGER; the parser handles decimal rupees with BigInt so no fractional paisa or floating-point rounding is accepted. The previous delivery-rate amount cap was explicitly not reused. Gift credits are shopping-only in the existing wallet; no deposit, withdrawal or cash-out workflow was added. Referral eligibility and reward release rules are unchanged.

## Stored value and authority

- lib/db/repositories/gift-cards.ts issues 192-bit random codes with HG prefix, stores only their SHA-256 digest and returns the code once. History, notification, audit, logs and replay responses never expose it. Issuance retry with the same actor/request/amount returns the safe record with code:null; changing that request's amount is rejected. An ambiguous lost first response can therefore leave an issued code unavailable; it cannot be recovered from the hash. The UI states this accurately instead of issuing a replacement silently.
- Super Admin is rechecked through the current staff mutation guard both before issuance and in its transaction. Ordinary Admins cannot receive this capability. Redemption checks active customer role again in the transaction.
- Redemption conditionally claims the unredeemed card, proves that exact claim, and inserts one unique gift_card wallet ledger entry with equal/opposite platform attribution. Existing wallet balance trigger updates the sole balance. A wallet row lock and upper-bound predicate prevent concurrent gifts from exceeding safe integer money. Duplicate same-user/request replay succeeds without a second credit; another user or request cannot redeem again.
- Gift-card issuance fields and redeemed records are protected by update/delete triggers. Ledger entries remain immutable; a new source guard requires a matching redeemed gift, recipient and amount. No fake order is created: gift entries have null order_id and a unique gift_card_id.

## Source and interfaces

New files: lib/db/repositories/gift-cards.ts; lib/marketplace/money-display.ts; components/commerce/gift-card-form.tsx; app/admin/gift-cards/page.tsx; app/api/admin/gift-cards/route.ts; app/api/account/gift-cards/route.ts; drizzle/0036_gift_cards.sql; deployment/babal/mariadb-gift-cards.sql; tests/gift-cards.test.ts; scripts/verify-gift-cards-native.ts; this report.

Modified: lib/db/repositories/wallet.ts (LEFT JOIN shows orderless gift activity); app/account/wallet/page.tsx (redemption, label, exact paisa display); lib/admin/navigation.ts (reserved gift-card link); lib/operations/notification-links.ts (safe issuer/redeemer destinations). Currency display preserves the last paisa even at the maximum safe amount.

Both POST endpoints require authenticated identity and trusted same-origin mutation requests, parse at most 2 KiB, return no-store responses and redact unexpected errors. Customer redemption is limited to 20 attempts per account per 15 minutes through the existing persistent limiter. Code input disables autofill and uses password display; the issued code is shown only in component state. Clipboard copy is an explicit issuer action. No secret is put in URLs or persistent browser storage.

In-app messages are inserted in the same source transaction: safe issuance acknowledgement to the issuer with admin.invite and /admin/gift-cards; redemption success to the recipient with /account/wallet#credit-activity. No gift email or SMS is queued or sent.

## Migration and verification

0036 preserves existing wallet entries, balance, foreign keys, balance/update/delete triggers and cancellation/refund restoration triggers. SQLite rebuilds the ledger with the expanded source shape; MariaDB modifies it additively. MariaDB's old inline kind CHECK is removed by MODIFY COLUMN when its constraint name is kind; a named kind constraint is then added. Subsequent applications replace that named check safely. Native testing found this inline-CHECK difference, and the corrected migration passed both initial and repeated application.

- Focused SQLite tests: 5/5 passed, covering exact positive money parsing, SA-only issuance, hash-only storage, one-time display/replay, immutable single-entry credit, inactive users, overflow rollback, simulated permission/claim races, role-scoped navigation/links and exact maximum display.
- Native hosted-adapter test: 5 groups passed on a new synthetic gift_cards_<timestamp> database and generated local user on 127.0.0.1:13316. Verified preservation of pre-existing referral ledger/balance, actual concurrent redemption with one winner, repeated migrations, immutable records, absence of plaintext secrets/other channels, exact maximum balance and overflow rollback. The script drops only its own generated database and user. Evidence: outputs/approved-four-2026-09-13T05-17-00-125Z/native-gift-cards.json.
- Focused lint passed after semantic output/event typing corrections. TypeScript found only the coordinator's then-in-progress rider test signature mismatch; this is not a clean final cumulative TypeScript claim. Combined build/browser verification awaits the coordinator's coherent rider source build.

No production data, live migration, deployment, real email, deposit, withdrawal or partial-cancellation behavior was changed. This report is local implementation evidence, not deployment readiness.

## Final integrated acceptance update

Final gift browser acceptance passed; exact-value issuance, reserved access, one-time code display and single wallet redemption. Evidence gift-browser/integration.json and gift-browser-final.txt. No real messages or deployment. See approved-four-local-2026-09-13.md for final-source boundaries.
