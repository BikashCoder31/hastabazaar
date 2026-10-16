# Commission workspace

Staff manage earnings, order breakdowns, scheduled fee schedules, cancellations and rate history at `/admin/commission`. `commercial_policy.manage` is required. The API at `/api/admin/commission` supports only scheduled changes and future cancellations; it does not immediately overwrite the launch rate.

## Deployment prerequisite

For D1, apply `drizzle/0069_commission_workspace.sql` through the normal migration runner. For the existing MariaDB marketplace, apply `deployment/babal/mariadb-commission-workspace.sql` after the previous commission policy migration. The new tables are required before serving this version of checkout or the staff/seller workspaces. This change does not deploy or change a live commission rate.

## Rates and acceptance

The 9% launch rate remains the fallback. A schedule requires a future effective date at least 15 days after publication, a rate from 0–100% with up to two decimals, and a recorded reason. Only one future schedule can be outstanding. Staff review the generated versioned fee schedule before publishing it. Changes and cancellations use transaction guards and a revision to reject stale browser submissions.

Sellers see an in-app notice throughout their workspace. They read the immutable fee schedule and explicitly accept it as a supplement to the referenced seller agreement. This is an in-app notice, not an email delivery confirmation. The stored acceptance records its version, seller, actor and time. A future effective date never overrides an unaccepted seller's terms: the latest effective accepted schedule applies per seller, otherwise the launch rate applies.

Checkout snapshots the applied rate and schedule ID on each order item and snapshots per-seller rate/acceptance data in the order terms. Existing orders and downstream ledger/refund calculations retain their original snapshots. A cancelled future schedule is retained in history, together with its reason, actor and time.

## Earnings

Earned commission is the sign-adjusted sum of recorded `commission` seller-ledger entries; refund reversals use recorded `commission_reversal` entries. Net earned is earned less reversals. Pending commission uses eligible, unearned order-item snapshots; cancelled/closed items do not inflate pending revenue. Rows group each order by seller, retaining mixed stored rates when present. Partial refunds are aggregated once per item before order totals are grouped.

Date filters describe an order-placement cohort in Nepal time. Totals show the current ledger earnings for that cohort, with search, seller and status filters applied consistently across all result pages. They are not a statement of cash collected during the selected dates. Items ready for ledger accrual are identified as pending until recorded by the existing earnings process.
