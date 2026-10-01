# Customer referrals — local release, 11 September 2026

## Customer experience

Customers now have distinct **My wallet** (`/account/wallet`) and **Refer & earn** (`/account/referrals`) entries in their account navigation and footer, plus prominent overview shortcuts. Refer & earn displays the personal referral code, invitation link, copy controls, device sharing, qualification rules and the latest 100 referral orders with pending/on-hold/earned status. The wallet focuses on available credit and immutable credit activity. Its old `#referrals` anchor remains a link to the new page.

The owner approved **NPR 50 for both the friend's discount and the referrer's reward**. Pages and checkout read the campaign, rather than hard-coding the displayed offer. The minimum remains NPR 1,500 in products, and the reward wait remains at least seven days after delivery and payment collection. Existing self-referral, account/phone eligibility, return/complaint holds and first-order checks remain in place. No deposits, withdrawals or transfers are enabled.

Invitation links use the existing `/r/[code]` handler and HTTP-only referral cookie. A friend signs in and can review/remove the code at checkout. No message is sent automatically. A paused campaign hides sharing controls; recorded reward progress and earned credit remain available. Personal friend/order identifiers are excluded from the progress view.

Concurrent wallet/referral loads exposed a MariaDB deadlock in reward release. The unique reward/order key prevents double credits; only the single idempotent release insert retries `ER_LOCK_DEADLOCK`, with three total attempts. Other errors propagate and wallet spending transactions are unchanged.

## Cumulative deployment package

`outputs/hastabazaar-referrals-50-2026-09-11.zip` contains the complete Babal standalone application, dependencies, this referral update, all six public pages with `support@hastabazaar.com`, product delivery/return disclosures, order emails/tracking and verified photo reviews/seller replies. Its sibling manifest records SHA-256 hashes of every packaged file. Production environment files, uploaded media and local database fixtures are excluded.

**Local only. Do not deploy until the owner requests it.** The support mailbox was created separately in cPanel; send/receive delivery has not been tested. No marketplace application or live campaign setting has been changed for this release.

When deployment is authorised:

1. Back up the existing application, MariaDB database and uploaded/private media. Retain all cPanel environment values and credentials privately. Pause order placement while switching database/application versions.
2. In the existing application database, apply `deployment/babal/mariadb-referrals-wallet.sql` only if that foundational update is not installed. Then apply the pending `mariadb-order-updates.sql`, `mariadb-review-photos-replies.sql` and **`mariadb-referral-offer-fifty.sql`**, in that order. Never import a base/reset schema into production.
3. The fifty-offer migration changes only the default campaign's two future amounts to 5,000 paisa. It preserves enabled/paused state, minimum and wait, all order discounts, redemption snapshots, reward entries and balances. Its audit marker `release-referrals-fifty-20260911` makes re-import leave later Super Admin settings intact. Do not delete the marker or rerun the old wallet migration after configuring a new campaign.
4. Extract the ZIP contents into `/home2/hastabaz/hastabazaar-app`, preserving runtime configuration and uploaded/private media. Use Babal.Host Node.js 22.23.2 and startup `app.cjs`; restart the application.
5. Verify health, password login, Google sign-in, email OTP and existing Super Admin access. Check the separate account entries at desktop/mobile sizes, copying a referral code/link, public referral terms and the Rs.50 offer in Super Admin. Check the controlled friend's eligible checkout discount, COD total and cancellation/credit restoration without falsely marking a real order delivered or paid. Historical referral progress must retain its original amounts.
6. Also verify all six public pages, product district/preparation estimates and return details, order tracking, uploads, review moderation and email queue. Keep backups until verification is complete. Actual delivery of support/order emails and exact hosting runtime behavior require live verification after deployment.

Rollback must retain additive schema and recorded financial data. Once new wallet-funded orders exist, do not revert to an application that cannot refund credit correctly. Keep maintenance active and fix forward, or restore a coordinated application/database backup before accepting further orders. Existing return-policy snapshots and authentication records are untouched.

## Local verification

- 65 automated tests passed, including new offer preservation/replay and bounded deadlock recovery tests. TypeScript passed.
- Disposable MariaDB 11.4.9 integration passed: concurrent reward release and spending, immutable accounting, repeat migrations, new Rs.50 COD referral (NPR 2,000 products + NPR 180 delivery − NPR 50 discount = NPR 2,130 cash), and preservation of old Rs.100 redemptions. Re-import preserves subsequent campaign changes.
- Babal standalone build passed. Built HTTP checks passed for review/photo and reply moderation, tracking privacy, email authorization, wallet/checkout/Admin access and hostile-origin rejection. Login/Google entry and hosting-proxy origin checks passed.
- Isolated Chrome browser checks passed at 1440×1000 and 390×844: separate navigation and active states, overview shortcut, current offer, personal code/link, copy and denied-clipboard fallback, share handoff, progress, wallet separation, paused offers, anonymous protection, secure invitation cookie/terms landing and no horizontal overflow. Sharing was stubbed; no invitation was sent. No browser runtime errors were observed.
- Local runtime was Node.js 24.19.0. Exact Babal.Host Node.js 22.23.2 and live verification are pending. Earlier framework closed-stream server warnings remain documented in `public-information-pages.md`; successful UI checks do not imply a warning-free framework.
