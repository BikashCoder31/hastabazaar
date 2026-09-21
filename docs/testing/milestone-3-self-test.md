# Hastabazaar v1.2.1 — Milestone 3 self-test package

Status: disposable local staging only. All accounts, products, issuer references, agreements, invoices, payments and settlements must remain fictional and visibly **SIMULATED — NOT VALID FOR PRODUCTION**. Production deployment, production migrations, real messages, funds and live commercial agreements remain unapproved.

## What Milestone 3 completes

- R01–R15 staging functionality, including suspension/deletion preflight, seller/maker identity, materials/stories, saved addresses and another recipient, customer counts/privacy-limited analytics, open-box policy, rider finance, automatic outbox processing, savings, Recently Viewed and official social links.
- Offline invoice barcode plus QR rendering and append-only simulated credit/debit documents.
- Fixed supplier-price purchasing: proposal, distinct possession/quality/title-risk records, documented acceptance, obligation at acceptance, rejection/cancellation, defect adjustments and maker-checker payment. No automatic 9% applies.
- Prospective Managed Maker → Registered Seller application, review and future-effective transition without changing stable seller/product identity or historical order/issuer/finance records.
- One authoritative independent-seller commission setting, 15-day minimum future notice, exact setting-version/language acceptance, and retirement of the duplicate editor.

The complete settings inventory is [`configuration-inventory.md`](./configuration-inventory.md); requirement evidence is [`r01-r15-traceability.md`](./r01-r15-traceability.md); the category-specific, adviser-pending retention proposal is [`retention-readiness-proposal.md`](./retention-readiness-proposal.md).

## Start safely

In PowerShell window 1:

```powershell
Set-Location 'C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala'
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:NODE_ENV='development'
$env:APP_ORIGIN='http://localhost:3000'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
$env:ORDER_EMAIL_JOB_SECRET='local-staging-only-job-secret-1234567890'
npm run staging:verify -- --initialize
npm run dev
```

In window 2, set the same variables, then run:

```powershell
npm run staging:verify
npm run staging:seed
npm run staging:demo
```

Open [http://localhost:3000/local-testing](http://localhost:3000/local-testing). The loopback-only switch creates HttpOnly local-test sessions; it is not a production login or bypass.

| Role | Fictional identity | Main M3 checks |
| --- | --- | --- |
| Managed Maker | `customer@local.hastabazaar.test` | profile/drafts, fixed supply, route-transition request |
| Buyer | `buyer@local.hastabazaar.test` | saved addresses, recipient, Recently Viewed, order/cases/invoices |
| Rider | `rider@local.hastabazaar.test` | mobile open-box, OTP, COD, partial remittance |
| Registered Seller | `seller@local.hastabazaar.test` | independent commission/renewal compatibility |
| Admin | `admin@local.hastabazaar.test` | delegated operations and maker-checker denial checks |
| Super Admin | `superadmin@local.hastabazaar.test` | settings, review, governance and finance decisions |

## Owner checklist and expected results

### A. Business Settings and history

1. As Super Admin, open `/admin/business-settings` and inspect every control in the configuration inventory.
2. Preview and publish a simple content/operational value. Propose a controlled financial value, then try self-approval and approval by a second test reviewer.
3. Schedule a future commission change less than 15 days away, then at least 15 days away.
4. Open `/admin/commission` and confirm it is read-only and links to Business Settings.

Expected: unknown keys/fields reject; controlled self-approval rejects; too-soon commission rejects; current, scheduled and immutable history remain visible. Old orders and balances never change.

### B. Customer and catalogue

1. Save, select, edit for one order, and delete an address. Confirm old orders retain their address snapshot.
2. Switch between “For myself” and “For someone else.” Use a recipient without email, then an optional delivery-only recipient email. Confirm it grants no account/invoice access.
3. View more than 12 products, revisit one, sign in/out on a shared browser and clear history.
4. Open a discounted product and verify original price, current price, percent saved and exact NPR saved.
5. Confirm product materials/origin story appear only when supplied; maker public pages show city only and hide private addresses/terms.

Expected: guest Recently Viewed stays local and never merges; account histories do not leak; stale/unavailable products resolve to current safe state; checkout prefill never silently edits the profile.

### C. Seller governance and records

1. As Super Admin, suspend the fictional seller. Check search, recommendations, cart, checkout and a direct product URL.
2. Confirm buyer access and historical orders remain. Test controlled existing-obligation modes; unsafe/fraud reasons must require a decision instead of automatic fulfilment.
3. Run deletion preflight. Confirm it deletes nothing and lists protected orders, invoices, refunds, settlements, evidence and unresolved holds.
4. Reactivate prospectively and confirm no historical record changed.

Expected: public purchase paths fail closed without publishing the private reason; seller-role restriction does not remove ordinary buyer capability.

### D. Open-box, rider finance and email

1. Configure fictional clay category, a test district and trained-rider eligibility. Assign a parcel and inspect the snapshotted policy.
2. On mobile rider UI, test inspected acceptance, protected inner seal, declined inspection and evidence-backed whole-parcel refusal. Later open an item-specific wrong/damaged complaint.
3. Test expired/reused/attempt-limited OTP and recipient/material-address invalidation. OTP without full COD must not deliver.
4. Submit partial and final remittance. A different finance reviewer verifies actual receipt; customer payment remains paid while rider cash is outstanding.
5. Interrupt/restart processing and inspect `/admin/business-emails` and `/admin/order-emails` for lease recovery, bounded retries, failure state and stale/expired suppression.

Expected: collection, rider-held cash, company receipt, seller/maker amount and rider compensation are separate. One coordinated outbox prevents duplicate sending and uses capture-only recipients.

### E. Invoices, adjustments and analytics

1. Create a fictional mixed-issuer order and complete delivered-and-paid conditions.
2. Confirm the order summary is not presented as one tax invoice; each simulated issuer group has its own immutable invoice, Code 39 barcode and QR.
3. Create a permitted simulated credit/debit document. Confirm it appends and cannot edit the original invoice or financial ledger.
4. Open `/admin/analytics`. Compare authoritative customer/order/payment/refund counts with labelled estimated browser sessions. Keep first-party analytics disabled unless explicitly testing it.

Expected: QR/barcode payloads grant no authorization and expose no OTP/private address. Analytics stores no checkout payload, IP, user-agent, ad ID or cross-site identifier.

### F. Managed Maker percentage model

Repeat the Milestone 2 journey and verify:

- NPR 1,000 eligible base → NPR 90 platform retained → NPR 910 maker entitlement;
- maker-funded discount reduces the base; platform-funded discount is recorded separately and does not;
- expected, earned, held, eligible and paid remain distinct;
- partial/full refunds and post-payout disputes append linked adjustments;
- duplicate delivery/refund/remittance/payout requests do not duplicate money;
- a configuration change while an older order is open does not rewrite that order.

### G. Fixed supplier-price model

1. Activate the fictional maker with **Fixed supplier price** on its Super Admin review page.
2. As Maker, open `/seller`, choose a fictional product and propose quantity 2 at NPR 500 per unit using simulated agreement/beneficiary references.
3. As Super Admin, separately record possession, accepted quality, ownership/risk term records and evidence. Accept quantity 2.
4. Confirm NPR 1,000 becomes owed immediately at acceptance and no 9% is deducted; later customer resale creates no second supplier obligation.
5. On other disposable proposals, test rejection and cancellation. On an accepted one, append a defect adjustment, including after simulated payment.
6. Prepare payment; approve with a different Super Admin test account; mark it simulated paid. Reuse request IDs to verify idempotency.

Expected: inspection fields do not claim legal title/risk allocation. Original obligation and payment remain immutable; post-payment defects show a linked recoverable amount instead of overwriting history.

### H. Managed Maker → Registered Seller

1. As Managed Maker, open `/seller`, expand the transition form and enter fictional registration/PAN or VAT evidence references and simulated agreement version.
2. Confirm editing profile tax fields alone does not switch route.
3. As a different Super Admin, request changes/reject on disposable requests; approve another with a future effective time.
4. Run the guarded scheduled job after the effective time:

   ```powershell
   Invoke-WebRequest -Method Post -Uri 'http://localhost:3000/api/jobs/order-emails' -Headers @{ Authorization = 'Bearer local-staging-only-job-secret-1234567890' }
   ```

Expected: the current route remains Managed Maker until the approved effective time. Then the same seller/profile/products/reviews continue prospectively as Registered Seller; old orders, invoices, refunds and payouts retain their original model/issuer/terms.

## Automated verification recorded on 2026-09-21

| Command/check | Actual outcome |
| --- | --- |
| `npm test` | **360/360 passed** |
| `npm run lint` | Passed with zero findings |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed; both new managed-program APIs and pages compiled. Existing vinext middleware deprecation warning remains non-blocking. |
| `npm run schema:babal` | Passed; MariaDB schema and reset import regenerated |
| `npm run build:babal` | Passed; **123 tables, 57 triggers, 36 migrations** in manifest |
| `npm run staging:verify` | Isolation, marker, local D1/R2 names, Node, mail capture, simulated payments and loopback application all **Pass** |
| `npm run staging:seed` | 55/55 local migrations tracked; six fictional accounts seeded; immediate rerun applied **0** migrations |
| `npm run staging:demo` | Passed: NPR 1,000 → NPR 90 retained → NPR 910 paid simulated entitlement; one issuer group |
| Production release/hosting | **Not Verified**; no production connection attempted |
| MariaDB server import | **Not Verified** in this checkpoint; generated SQL/build passed, but no approved isolated MariaDB service was available |

Focused financial evidence also covers seller/maker-funded and platform-funded discounts, half-up reconciliation, partial/full refunds, post-payout adjustments, duplicate requests, open-order configuration changes, and fixed-price acceptance with no 9% deduction.

## Reset only disposable staging data

Stop the local server, then run:

```powershell
npm run staging:reset -- --confirm-reset=HASTABAZAAR-LOCAL-STAGING
npm run staging:verify -- --initialize
```

The reset refuses production/remote bindings, missing or mismatched markers, path escape, symlinks, a running server and missing exact confirmation. It moves only marked `.staging` state/media/mail to recoverable `.staging/recovery`; it never cleans the repository or original checkout.

## Production-readiness gates only

- Read-only evidence for deployed release, schema/runtime/database versions, storage, backups, scheduler, SMTP and D1/R2 involvement remains unavailable; repository/build evidence is not reported as production verification.
- Company registration/issuer identity fields remain deliberately unchanged and unpublished.
- Supplier eligibility, title/risk, tax/withholding, service-tax treatment, statutory retention, actual rider arrangements/cash limit/receiving account, reviewed English/Nepali agreements and controlling language remain pending live decisions.
- Hosted staging requires verified isolated databases/media/queues/recipients/payments plus access control; `noindex` alone is insufficient.
- No ordinary R01–R15 functionality is reclassified as a production dependency; any defect found in owner testing remains development work for Milestone 4.
