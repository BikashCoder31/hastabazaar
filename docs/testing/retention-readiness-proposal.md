# Hastabazaar v1.2.1 — record-retention readiness proposal

Status: proposed production policy for owner, legal and accounting review. These periods are **not activated**, are not legal advice, and do not authorize deletion. Milestone 3 implements only non-destructive deletion preflight and legal/dispute holds.

| Record category | Proposed start event | Proposed normal period | End action | Confirmation still required |
| --- | --- | --- | --- | --- |
| Rejected/withdrawn seller profile and ordinary application data | Final rejection/withdrawal and last unresolved contact | 24 months | Delete or irreversibly minimize nonessential profile/contact data | Legal limitation/risk period and fraud-prevention necessity |
| Verification identity and registration documents | Seller relationship ends or replacement document is verified | Active relationship plus 24 months | Securely delete superseded/expired copies unless a hold applies; retain only necessary verification outcome/reference | KYC/payment/tax/supplier duties and document-specific rules |
| Agreements and acceptance evidence | Agreement ends or is superseded | 7 years | Retain immutable version/acceptance proof; minimize unrelated personal data | Lawyer/accountant confirms limitation and evidentiary period |
| Orders, issuer snapshots, invoices, credits/debits, payments, refunds, commissions, supplier obligations and settlements | End of the relevant Nepal fiscal year containing the final transaction/adjustment | 7 fiscal years | Archive with restricted access, then delete/minimize only after tax/accounting approval | Nepal tax, VAT/e-invoicing and company-record requirements; longer period if mandated |
| Returns, complaints, chargebacks, safety/product incidents and related evidence | Final resolution/appeal or last payment, whichever is later | 7 years proposed for financial/safety disputes; review lower-risk support separately | Delete/minimize when no hold and no continuing safety need | Consumer, product-safety and limitation rules by case type |
| Delivery handover, OTP outcome, rider proof and COD/remittance evidence | Delivery/return and cash reconciliation both complete | 24 months, unless linked to a longer financial/dispute record | Delete media first where no longer needed; retain minimal event/result reference if justified | Carrier, insurance, payment and dispute periods |
| Uploaded product/profile media | Listing/account deletion or replacement | 90-day recovery window after approved deletion | Purge active and recovery copies under documented backup expiry | Backup capabilities, moderation/safety hold and user notice |
| Routine application/access logs | Event time | 90 days | Automatic deletion or aggregation | Security monitoring and host/provider log availability |
| Security/audit events and privileged configuration history | Event time or account closure, whichever is later | 2 years for security events; 7 years for financial/contractual approvals | Restrict, then delete/minimize by category | Security incident, employment/administrator and evidentiary advice |
| First-party analytics events | Last event time | Configured 90 days by default | Automatic per-event deletion/aggregation | Published privacy policy and owner decision before enabling |
| Recently Viewed history | Each product's last view | Configured 90 days by default | Automatic per-entry expiry; user clear remains immediate | No production gate beyond privacy notice |
| Captured test mail, fictional media and disposable staging data | Test completion | Until owner accepts the milestone, then reset | Guarded staging reset to recoverable local folder; later manual expiry | Owner confirms evidence no longer needed |

## Hold precedence

A documented legal, tax-audit, safety, fraud, chargeback, complaint, employment or regulator hold overrides normal deletion only for relevant records. Every hold needs a reason, owner, scope, start date, review date and release decision. A hold must not become a blanket reason to retain unrelated personal data.

## Backup and deletion meaning

Production deletion cannot be promised until backup topology and expiry are verified. The final runbook must distinguish active-system deletion, recovery-window deletion, backup expiry, immutable accounting/audit records and irreversible anonymization. The application must never cascade-delete orders, invoices, refunds, settlements or evidence simply because an account is removed.
