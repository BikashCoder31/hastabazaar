# Approved R021 seller registration (local)

The owner approved the pending recommendation matrix: Individual requires legal identity/contact/address and selected PAN/VAT certificates; Company adds registration details and certificate. Both requires two separate uploads and permits the same identifier. No prior application is reclassified.

## Implementation

The seller form now explicitly selects Individual/Company and PAN/VAT/Both. Company registration and representative controls exist only for Company; individual representative storage uses the supplied legal name. Trading name, product information, contact/address and terms continue the existing application requirements. Identity and bank evidence are optional. Conditional document labels visibly mark selected mandatory certificates. Application parsing rejects missing/unknown choices and never substitutes fictitious company data. A shared PAN/VAT identifier remains one field and both certificate records are persisted independently.

The API reads only the selected certificate fields, validates allowed PDF/JPEG/PNG signatures and 5 MB per file, stores private objects, and cleans objects on failed database persistence. The body bound is 27 MB for up to five documents. Repository validation requires exactly one of each selected mandatory document and private keys belonging to the application before writes. Existing account linking, review/audit and business notification statements remain intact. Native duplicate conflicts return a conflict instead of a generic failure.

Migration 0037 adds nullable applicant_type. NULL is explicitly displayed as a legacy application, without inventing its classification. Registration uniqueness ignores empty registration fields so multiple individuals can apply, but real non-empty company registration pairs remain unique. MariaDB uses generated nullable index keys; the additive migration was applied twice against a fresh native database successfully. No tax calculation logic changes; tax_mode stores the selected document mode including BOTH.

## Files

- lib/sellers/application.ts
- lib/db/repositories/seller-applications.ts
- components/seller/seller-application-form.tsx
- app/api/seller-applications/route.ts
- app/admin/sellers/[id]/page.tsx and app/sell/page.tsx
- drizzle/0037_seller_registration.sql and deployment/babal/mariadb-seller-registration.sql
- tests/seller-registration-matrix.test.ts and updated tests/seller-application-required-labels.test.ts
- scripts/verify-seller-registration-native.mjs and scripts/verify-seller-registration-browser.mjs

## Verification and remaining work

Five focused tests passed: all six document combinations, individual/company parser rules, transactional saves for all six combinations with missing-document rejection and no partial account, exact legacy profile preservation across the migration, actual default form rendering/required markers, and file type/size/signature rejection. Scoped lint passed. Native evidence is outputs/approved-four-2026-09-13T05-17-00-125Z/seller-registration/native.json. Only a fresh synthetic database on the parent's local MariaDB server was used; no existing business database or external provider was used.

The prepared guarded browser harness awaits the rebuilt standalone snapshot and current release manifest. It will exercise all six actual submissions, responsive selectors at 320/390/1440, Both missing-certificate native and HTTP rejection, and anonymous-versus-reviewer private document access. No claim is made that those pending browser checks passed. File signatures are validated; certificate authenticity, PDF parsing, malware scanning and real external notifications are not verified by these local tests.

## Final integrated acceptance update

Previously pending browser acceptance now passes all six combinations, private evidence and responsive controls. Evidence seller-registration/browser-resumed/integration.json. No real messages or deployment. See approved-four-local-2026-09-13.md for final-source boundaries.
