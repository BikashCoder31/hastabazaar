# Hastabazaar v1.2.1 — Milestone 2 self-test package

Status: disposable local staging only. All issuers, agreements, destinations, products, orders, invoices and payments are fictional and marked **SIMULATED — NOT VALID FOR PRODUCTION**. Production deployment, production migrations, live messages, real money, company details and commercial activation remain unapproved.

## What Milestone 2 adds

- A sale-linked Managed Maker demonstration using a 9% **platform retention rate** and the maker’s reconciled 91% entitlement.
- A separately implemented fixed supplier-price calculation with no automatic 9% deduction.
- Immutable order-item commercial snapshots and append-only entitlement/adjustment records.
- Program, maker and product readiness checks plus local-simulation activation; production activation stays fail-closed.
- Parcel-specific, expiring, single-use email OTP for the Managed COD demonstration. OTP alone cannot complete an unpaid COD handover.
- Separate customer payment, rider-held cash, remittance, company reconciliation, maker earning, payout eligibility and payout completion facts.
- Maker-checker approval for remittance and payouts, linked refund/dispute adjustments and duplicate-request protection.
- Issuer-grouped simulated invoice records with stable barcode/QR payloads and protected customer access.
- Coordinated capture-only email delivery, including claim/retry and expired/obsolete-message behavior.
- Separate fictional applicant, buyer, rider, registered-seller, Admin and Super Admin identities.

## Start safely

Use the isolated worktree in two PowerShell windows:

```powershell
Set-Location 'C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala'
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:NODE_ENV='development'
$env:APP_ORIGIN='http://localhost:3000'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
npm run staging:verify -- --initialize
npm run dev
```

In the second window, set the same variables and run:

```powershell
npm run staging:verify
npm run staging:seed
npm run staging:demo
```

`staging:demo` is a guarded, deterministic repository-level proof. It writes only `.staging/managed-maker-demo-result.json`; it cannot use production bindings. Expect NPR 1,000.00 eligible base, NPR 90.00 retained, NPR 910.00 maker entitlement, one simulated issuer invoice and a paid simulated payout.

Open [http://localhost:3000/local-testing](http://localhost:3000/local-testing) for the browser journey.

| Local role | Fictional email | Main purpose |
| --- | --- | --- |
| Managed Maker applicant | `customer@local.hastabazaar.test` | Application, profile, drafts, maker finance |
| Buyer | `buyer@local.hastabazaar.test` | Checkout, receipt, inspection/OTP, invoice history |
| Rider | `rider@local.hastabazaar.test` | Mobile parcel, proof and COD handover |
| Registered Seller | `seller@local.hastabazaar.test` | Compatibility regression |
| Admin | `admin@local.hastabazaar.test` | Operations review and finance preparation |
| Super Admin | `superadmin@local.hastabazaar.test` | Controlled settings, activation and independent approval |

No passwords are distributed: the loopback-only role switch creates an HttpOnly local-test session. The rider is a pre-approved fictional fixture; this does not bypass production rider review.

## End-to-end browser checklist

### 1. Configure the simulation

1. As Super Admin, open `/admin/business-settings` and `/admin/programs`.
2. Confirm the Managed Maker setting says **platform retention rate**, is 900 basis points, and previews 9% retained / 91% maker entitlement. Confirm independent-seller commission is a different setting.
3. Confirm Wednesday payout processing, Tuesday 17:00 cutoff, Asia/Kathmandu, zero automatic reserve and no arbitrary platform payout minimum.
4. Publish only local-simulation settings using the controlled reviewer flow. Change a future-effective value and confirm current values/history remain intact.

Expected: ordinary content can publish simply; financial/sensitive changes require the configured change process and audit reason. Unsupported or incomplete models never appear as live-capable choices.

### 2. Application, review and activation

1. As Managed Maker applicant, open `/sell/application`; inspect the seeded “Fictional Mithila Clay Studio” request.
2. Edit optional craft experience, social/video data and city, then save. Clear the optional values and save again; submission must remain valid.
3. Prepare a product draft. It must remain private.
4. As Super Admin, open `/admin/sellers`, review the applicant, request a specific correction, and confirm the applicant sees who must act and what to do next.
5. Complete review, accept only a clearly simulated agreement, approve the product, then activate the sale-linked simulation with fictional seller/issuer/beneficiary references.

Expected: program, maker and product readiness are independent. The applicant cannot self-approve, assign issuer roles or publish by changing a request. Production activation remains unavailable.

### 3. Buyer order and order-time snapshot

1. As Buyer, open the approved fictional product, add it to the cart and check out with simulated COD.
2. Use a product value of NPR 1,000 with no maker-funded discount for the exact reference case.
3. Place the order, then return as Super Admin and change the future retention setting.

Expected: the placed item still shows its original 9% retention snapshot and NPR 910 expected entitlement. The new setting applies only to its intended future effective scope.

### 4. Rider, inspection, OTP, payment and remittance

1. As Admin, open `/admin/orders`, assign the parcel to `rider@local.hastabazaar.test` and enable the approved clay/open-box test context.
2. As Rider on a narrow/mobile viewport, open `/rider` and start the assigned parcel.
3. As Buyer, open the protected order page and request the parcel code. Inspect `.staging/mail-capture` rather than any real mailbox.
4. Try an expired code, a wrong code up to the configured limit, and a reused successful code. Change material recipient details and confirm the prior challenge is invalidated.
5. Record whole-parcel refusal/wrong/damaged outcomes on one disposable order. On a fresh order, record the actual inspection, the full simulated COD collection and handover.
6. Confirm OTP without full COD cannot mark the order delivered. Confirm duplicate handover submission does not duplicate delivery or earnings.
7. As Rider, submit a partial remittance; as Admin, inspect the outstanding balance. Submit the remainder, then use a different authorized reviewer to approve reconciliation.

Expected: inspection, OTP, payment, delivery, cash held, remittance and reconciliation remain separate. A customer payment to the authorized rider is not reversed because remittance is pending. Entitlement earns from delivered-and-paid facts, not indefinitely from rider remittance.

### 5. Invoice, entitlement and payout

1. As Buyer, open order history. Confirm issuer-grouped simulated invoices are separate from the combined order summary and visibly non-tax/non-production records.
2. Confirm the invoice reference and invoice-view QR payload do not expose an OTP/address or grant access by themselves.
3. As Maker, open `/sell/application`; confirm calculated, earned, held/eligible and paid values are distinct and the expected Wednesday date is shown.
4. As Admin, prepare the NPR 910 simulated payout. Attempt approval with the same account—it must fail.
5. As Super Admin, approve it; record simulated completion. Repeat the same request ID and confirm no second payout/deduction occurs.

Expected: base = 100,000 paisa, retained = 9,000, maker entitlement = 91,000, and both amounts reconcile exactly. Private terms do not appear on public profiles or customer content.

### 6. Refund, dispute and configuration regressions

1. Exercise partial and full refund fixtures before payout; confirm proportional retention/entitlement reversals exactly match the original item basis.
2. Open a refund or documented dispute after simulated payout; confirm a linked compensating adjustment is appended instead of editing the original earning or payout.
3. Repeat delivery, refund, remittance and payout requests with the same request IDs.
4. Verify the fixed supplier-price calculation separately: the agreed supplier amount becomes owed at documented supply acceptance and has no automatic 9% deduction. Test cancellation, rejection and defect-adjustment cases.
5. As Registered Seller, verify its independent commission, product and settlement paths remain separate.

Expected: no duplicate records, no double deduction and no historical rewrite. Fixed-price purchasing does not depend on later resale and does not inherit the sale-linked retention.

## Automated verification

Run:

```powershell
npx tsx --test tests/milestone-2-staging-journey.test.ts tests/managed-commerce-*.test.ts tests/managed-settlements.test.ts tests/managed-documents-email.test.ts tests/rider-*.test.ts
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm run schema:babal
npm run build:babal
```

Recorded checkpoint outcomes:

| Command | Outcome |
| --- | --- |
| Focused M2 financial/activation/checkout/document/rider suite | 25/25 passed |
| `npm test` | 311/311 passed |
| `npm run lint` | Passed with zero findings |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; application/API route manifest generated. The existing vinext middleware deprecation warning remains non-blocking. |
| `npm run schema:babal` | Passed; MariaDB empty-import and recovery schemas regenerated |
| `npm run build:babal` | Passed; 106 tables, 38 triggers and 27 migration groups in the standalone release manifest |
| `npm run staging:verify` with server | Local application `200 OK`; runtime, local bindings, captured mail and simulated payments passed; production stayed Not Verified |
| `npm run staging:seed` | 47/47 local migrations applied; six fictional accounts and one Managed Maker application seeded. Immediate rerun applied 0 migrations and was idempotent. |
| `npm run staging:demo` | Passed: NPR 1,000.00 base → NPR 90.00 retained → NPR 910.00 paid simulated entitlement; one issuer group |
| guarded `staging:reset` | Passed; state/media/mail moved into timestamped `.staging/recovery`, then clean directories reinitialized |

The standard and Babal builds share an output directory and therefore must run sequentially; the final recorded runs did so and both passed. The authoritative feature-status mapping is [`r01-r15-traceability.md`](./r01-r15-traceability.md).

## Reset only disposable data

Stop the local server, retain evidence you want to inspect, and run:

```powershell
npm run staging:reset -- --confirm-reset=HASTABAZAAR-LOCAL-STAGING
npm run staging:verify -- --initialize
```

The command refuses production/remote bindings, a running server, marker mismatch, path escape, symlink or missing exact confirmation. It moves only the marked local state/media/mail capture into `.staging/recovery`; it does not clean the repository or touch the preserved original checkout.

## Known limitations and production-only dependencies

- Actual barcode/QR graphic rendering and print/PDF decode testing remain Milestone 3 development; M2 stores stable protected payloads.
- Fixed supplier-price end-to-end supply-acceptance UI remains Milestone 3; the model, schema and calculations are implemented and tested now.
- Broader saved-address/another-recipient checkout, customer analytics, product materials/stories, seller suspension/deletion and Recently Viewed work remains Milestone 3, as shown in traceability.
- Production release/schema/runtime/database/storage/backups/scheduler/SMTP/D1/R2 remain Not Verified because no authorized production evidence or access was used.
- Live supplier requirements, tax/withholding, ownership/risk, statutory retention, controlling agreement language and reviewed legal/commercial agreements remain production activation gates. Unknown tax is never treated as zero.
- The local schedule calculates the configured Wednesday processing date; actual banking cutoff/holiday handling depends on confirmed operating and receiving arrangements.
