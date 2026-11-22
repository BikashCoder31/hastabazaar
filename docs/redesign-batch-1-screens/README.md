# Batch 1 responsive preview

Checked the local preview at 390, 768, 1024 and 1440 px. Each screenshot shows the first 900 px of the page so the fixed navigation stays in view. The check measured layout below the fold as well.

78 routes and route variants had screenshot evidence, with 156 first-viewport captures, eight additional record captures, and 312 viewport measurements. The Browser plugin was unavailable, so Playwright used isolated Super Admin and Seller fixture sessions with read-only browser requests.

## Fixture coverage

- The existing verification guard redirects `/admin/legal-policies` and `/admin/legal-policies/active` through sign-in. The fixture could not render those pages.
- The bare `/admin/riders/form-history` and `/seller/form-history` URLs require a history kind. The fixture-linked variants rendered and are listed below.
- `/admin/cases/intake` now loads the standard order lookup when no lookup presentation is published. A read-only test found an existing order. Simulated configuration errors for the protected complaint and return forms left submission disabled.
- `/seller/products/intakes` and `/seller/products/new` logged a development hydration warning during the sweep. Their settled page content rendered.

## Layout findings

- `/admin/governance` had horizontal scrolling within content at 390 px. Follow-up in Team and access (V).
- `/admin/loyalty` had horizontal scrolling within content at 390, 768, 1024 px. Follow-up in All offers (X).
- `/admin/promo-codes` had horizontal scrolling within content at 390, 768, 1024 px. Follow-up in All offers (X).
- `/admin/system-health/incidents` had horizontal scrolling within content at 390 px. Follow-up in System health and backups (Y).

Some older workspaces still have controls below the 44 px target. During this sweep, the Mark as read button measured 40 px tall in both notification workspaces, the Admin referral tabs measured 40 px tall, and some Seller form disclosures measured 24 px tall.

## Record layouts checked below the fold

| Section | Records shown in each layout | Phone | Tablet |
| --- | --- | --- | --- |
| Business activity | 100 | [390](admin--activity--records-390.png) | [768](admin--activity--records-768.png) |
| Registered customers (email addresses masked in these captures) | 2 | [390](admin--analytics--records-390.png) | [768](admin--analytics--records-768.png) |
| Business email records | 43 | [390](admin--business-emails--records-390.png) | [768](admin--business-emails--records-768.png) |
| Order email history | 5 | [390](admin--order-emails--records-390.png) | [768](admin--order-emails--records-768.png) |

## Super Admin

| Route | Preview | Phone | Tablet |
| --- | --- | --- | --- |
| `/admin` | Good morning, Nisha | [390](admin-390.png) | [768](admin-768.png) |
| `/admin/accounting` | Accounting | [390](admin--accounting-390.png) | [768](admin--accounting-768.png) |
| `/admin/activity` | Business activity | [390](admin--activity-390.png) | [768](admin--activity-768.png) |
| `/admin/analytics` | Commerce & financial analytics | [390](admin--analytics-390.png) | [768](admin--analytics-768.png) |
| `/admin/backup-transfer` | Backup & Transfer | [390](admin--backup-transfer-390.png) | [768](admin--backup-transfer-768.png) |
| `/admin/business-emails` | Email delivery | [390](admin--business-emails-390.png) | [768](admin--business-emails-768.png) |
| `/admin/business-settings` | Business settings | [390](admin--business-settings-390.png) | [768](admin--business-settings-768.png) |
| `/admin/cases` | Care | [390](admin--cases-390.png) | [768](admin--cases-768.png) |
| `/admin/cases/intake` | Record a supported customer request | [390](admin--cases--intake-390.png) | [768](admin--cases--intake-768.png) |
| `/admin/catalog` | Categories and occasions | [390](admin--catalog-390.png) | [768](admin--catalog-768.png) |
| `/admin/commission` | Commission | [390](admin--commission-390.png) | [768](admin--commission-768.png) |
| `/admin/commission/terms` | Selling fee follow-up | [390](admin--commission--terms-390.png) | [768](admin--commission--terms-768.png) |
| `/admin/delivery-rates` | Delivery rates | [390](admin--delivery-rates-390.png) | [768](admin--delivery-rates-768.png) |
| `/admin/exceptions` | Exception follow-up | [390](admin--exceptions-390.png) | [768](admin--exceptions-768.png) |
| `/admin/fee-waivers` | Customer service fee waivers | [390](admin--fee-waivers-390.png) | [768](admin--fee-waivers-768.png) |
| `/admin/feedback` | Contact and feedback submissions | [390](admin--feedback-390.png) | [768](admin--feedback-768.png) |
| `/admin/fees` | Fees, programs & promotions | [390](admin--fees-390.png) | [768](admin--fees-768.png) |
| `/admin/form-submissions` | Restricted identity request history | [390](admin--form-submissions-390.png) | [768](admin--form-submissions-768.png) |
| `/admin/forms` | Form Management | [390](admin--forms-390.png) | [768](admin--forms-768.png) |
| `/admin/forms/[formId]` | Apply to sell · linked from `/admin/forms` | [390](admin--forms--formid-390.png) | [768](admin--forms--formid-768.png) |
| `/admin/gift-cards` | Gift cards | [390](admin--gift-cards-390.png) | [768](admin--gift-cards-768.png) |
| `/admin/governance` | Marketplace controls | [390](admin--governance-390.png) | [768](admin--governance-768.png) |
| `/admin/homepage` | Hero slides | [390](admin--homepage-390.png) | [768](admin--homepage-768.png) |
| `/admin/loyalty` | Daily loyalty points | [390](admin--loyalty-390.png) | [768](admin--loyalty-768.png) |
| `/admin/not-in-use` | Not in use yet | [390](admin--not-in-use-390.png) | [768](admin--not-in-use-768.png) |
| `/admin/notifications` | Your work notifications | [390](admin--notifications-390.png) | [768](admin--notifications-768.png) |
| `/admin/order-emails` | Order emails | [390](admin--order-emails-390.png) | [768](admin--order-emails-768.png) |
| `/admin/orders` | Orders | [390](admin--orders-390.png) | [768](admin--orders-768.png) |
| `/admin/orders/[id]` | Order HK-20261016-6BFC9C93DF · linked from `/admin/business-emails` | [390](admin--orders--record-390.png) | [768](admin--orders--record-768.png) |
| `/admin/payments` | Incoming payments | [390](admin--payments-390.png) | [768](admin--payments-768.png) |
| `/admin/payments/payouts` | Payout transfers | [390](admin--payments--payouts-390.png) | [768](admin--payments--payouts-768.png) |
| `/admin/payments/recoveries` | Seller recovery | [390](admin--payments--recoveries-390.png) | [768](admin--payments--recoveries-768.png) |
| `/admin/payments/refunds` | Refunds & funding | [390](admin--payments--refunds-390.png) | [768](admin--payments--refunds-768.png) |
| `/admin/payouts` | Money | [390](admin--payouts-390.png) | [768](admin--payouts-768.png) |
| `/admin/privacy` | Data-rights requests | [390](admin--privacy-390.png) | [768](admin--privacy-768.png) |
| `/admin/products` | Catalog | [390](admin--products-390.png) | [768](admin--products-768.png) |
| `/admin/products/[id]` | QA Clay Cup 20261016 - SIMULATED · linked from `/admin/business-emails` | [390](admin--products--record-390.png) | [768](admin--products--record-768.png) |
| `/admin/products/intakes` | Intake and first reviews | [390](admin--products--intakes-390.png) | [768](admin--products--intakes-768.png) |
| `/admin/products/publications` | Approved versions awaiting publication | [390](admin--products--publications-390.png) | [768](admin--products--publications-768.png) |
| `/admin/programs` | Program Management | [390](admin--programs-390.png) | [768](admin--programs-768.png) |
| `/admin/progress` | Recorded work progress | [390](admin--progress-390.png) | [768](admin--progress-768.png) |
| `/admin/promo-codes` | Promo codes | [390](admin--promo-codes-390.png) | [768](admin--promo-codes-768.png) |
| `/admin/referrals` | Referrals & shopping credit | [390](admin--referrals-390.png) | [768](admin--referrals-768.png) |
| `/admin/review-tasks/[id]/history` | Work assignment history · linked from `/admin/sellers` | [390](admin--review-tasks--record--history-390.png) | [768](admin--review-tasks--record--history-768.png) |
| `/admin/reviews` | Product reviews | [390](admin--reviews-390.png) | [768](admin--reviews-768.png) |
| `/admin/riders` | Rider operations | [390](admin--riders-390.png) | [768](admin--riders-768.png) |
| `/admin/riders/form-history?kind=application` | Rider applications answer history · linked from `/admin/riders` | [390](admin--riders--form-history--application-390.png) | [768](admin--riders--form-history--application-768.png) |
| `/admin/riders/form-history?kind=code` | Code verifications answer history · linked from `/admin/riders` | [390](admin--riders--form-history--code-390.png) | [768](admin--riders--form-history--code-768.png) |
| `/admin/riders/form-history?kind=remittance` | Rider remittances answer history · linked from `/admin/riders` | [390](admin--riders--form-history--remittance-390.png) | [768](admin--riders--form-history--remittance-768.png) |
| `/admin/riders/form-history?kind=report` | Rider reports answer history · linked from `/admin/not-in-use` | [390](admin--riders--form-history--report-390.png) | [768](admin--riders--form-history--report-768.png) |
| `/admin/seller-documents/[id]/review` | Government ID · abc1 · linked from `/admin/business-emails` | [390](admin--seller-documents--record--review-390.png) | [768](admin--seller-documents--record--review-768.png) |
| `/admin/sellers` | Sellers | [390](admin--sellers-390.png) | [768](admin--sellers-768.png) |
| `/admin/sellers/[id]` | Sellers · linked from `/admin` | [390](admin--sellers--record-390.png) | [768](admin--sellers--record-768.png) |
| `/admin/shipping` | Labels, pickups, claims & reconciliation | [390](admin--shipping-390.png) | [768](admin--shipping-768.png) |
| `/admin/staff-form-history` | Staff form history | [390](admin--staff-form-history-390.png) | [768](admin--staff-form-history-768.png) |
| `/admin/system-health` | System health & records | [390](admin--system-health-390.png) | [768](admin--system-health-768.png) |
| `/admin/system-health/incidents` | Incidents | [390](admin--system-health--incidents-390.png) | [768](admin--system-health--incidents-768.png) |
| `/admin/system-health/records` | Records & audit | [390](admin--system-health--records-390.png) | [768](admin--system-health--records-768.png) |
| `/admin/team` | Team & business policies | [390](admin--team-390.png) | [768](admin--team-768.png) |

### Detail routes without a linked fixture record

- `/admin/cases/complaints/[id]`
- `/admin/cases/returns/[id]`
- `/admin/financial-notices/[type]/[id]`
- `/admin/operational-notices/[type]/[id]`
- `/admin/order-responses/[id]`
- `/admin/payments/exceptions/[id]`
- `/admin/payments/orders/[id]`
- `/admin/payments/recoveries/[id]`
- `/admin/payments/recoveries/claims/[id]`
- `/admin/payouts/[id]`
- `/admin/products/[id]/availability`
- `/admin/products/[id]/concerns`
- `/admin/products/concerns/[id]`
- `/admin/products/intakes/[id]`
- `/admin/products/publications/[id]`
- `/admin/reminders/[id]`
- `/admin/seller-document-change-requests/[id]`
- `/admin/seller-profile-corrections/[id]`
- `/admin/seller-protected-changes/[id]`
- `/admin/team/tasks/[id]`

## Seller Studio

| Route | Preview | Phone | Tablet |
| --- | --- | --- | --- |
| `/seller` | Good morning, Janakpur Craft Studio | [390](seller-390.png) | [768](seller-768.png) |
| `/seller/analytics` | Sales & inventory | [390](seller--analytics-390.png) | [768](seller--analytics-768.png) |
| `/seller/cases` | Returns | [390](seller--cases-390.png) | [768](seller--cases-768.png) |
| `/seller/finance` | Earnings | [390](seller--finance-390.png) | [768](seller--finance-768.png) |
| `/seller/finance/recoveries` | Your recovery statements | [390](seller--finance--recoveries-390.png) | [768](seller--finance--recoveries-768.png) |
| `/seller/form-history?kind=payout-request` | Payout requests answer history · linked from `/seller` | [390](seller--form-history--payout-request-390.png) | [768](seller--form-history--payout-request-768.png) |
| `/seller/form-history?kind=review-reply` | Review replies answer history · linked from `/seller/reviews` | [390](seller--form-history--review-reply-390.png) | [768](seller--form-history--review-reply-768.png) |
| `/seller/form-history?kind=shipping-action` | Shipping actions answer history · linked from `/seller/shipping` | [390](seller--form-history--shipping-action-390.png) | [768](seller--form-history--shipping-action-768.png) |
| `/seller/form-history?kind=shipping-request` | Shipping requests answer history · linked from `/seller/shipping` | [390](seller--form-history--shipping-request-390.png) | [768](seller--form-history--shipping-request-768.png) |
| `/seller/notifications` | Notifications | [390](seller--notifications-390.png) | [768](seller--notifications-768.png) |
| `/seller/orders` | Orders | [390](seller--orders-390.png) | [768](seller--orders-768.png) |
| `/seller/products` | Products | [390](seller--products-390.png) | [768](seller--products-768.png) |
| `/seller/products/intakes` | Saved product workspaces | [390](seller--products--intakes-390.png) | [768](seller--products--intakes-768.png) |
| `/seller/products/new` | Add product | [390](seller--products--new-390.png) | [768](seller--products--new-768.png) |
| `/seller/profile` | Shop profile | [390](seller--profile-390.png) | [768](seller--profile-768.png) |
| `/seller/registration` | Registration & documents | [390](seller--registration-390.png) | [768](seller--registration-768.png) |
| `/seller/requests` | Requests & help | [390](seller--requests-390.png) | [768](seller--requests-768.png) |
| `/seller/reviews` | Customer reviews | [390](seller--reviews-390.png) | [768](seller--reviews-768.png) |
| `/seller/shipping` | Shipping coordination | [390](seller--shipping-390.png) | [768](seller--shipping-768.png) |

### Detail routes without a linked fixture record

- `/seller/cases/complaints/[id]`
- `/seller/cases/returns/[id]`
- `/seller/finance/recoveries/[id]`
- `/seller/finance/recoveries/claims/[id]`
- `/seller/financial-notices/[type]/[id]`
- `/seller/order-responses/[id]`
- `/seller/orders/[id]`
- `/seller/products/[id]/answers`
- `/seller/products/[id]/availability`
- `/seller/products/[id]/concerns`
- `/seller/products/[id]/edit`
- `/seller/products/concerns/[id]`
- `/seller/products/intakes/[id]`
- `/seller/reminders/[id]`
- `/seller/requests/changes/[id]`
