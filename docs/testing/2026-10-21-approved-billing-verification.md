# Approved Order Invoice and Receipt verification

Date: 21 October 2026. Active checkout: `C:/Users/abinash/Desktop/HastaBazaar`.

## What changed

New orders use one combined Order Invoice. Each item retains its supplier/store reference, platform SKU, seller SKU, variant and recorded prices. The seller SKU is an optional seller-entered stock code; the platform SKU remains generated and immutable. Missing historical values remain missing. Seller submissions, revisions, seller lists, product review and product details expose the two distinct labels.

Receipts group goods by the recorded legal seller. Multiple managed makers can share the company's receipt, while registered businesses retain their own identities. Registered-only orders also retain a company charge receipt for delivery/service amounts. Discounts and shopping credit use the existing COD/cancellation allocation sealed per line. No commission, payout, service-fee setting or historical order fee was changed.

The approved plain layout includes the logo, billing email, website, customer contacts, payment mode, dates, tables and totals. Only Order Invoice has a barcode. Only an eligible company receipt can use the private company stamp. The stamp has an immutable asset/issuer version and an authorized `/orders/.../stamp` route within the existing guest cookie path.

Existing snapshots, numbers, agreements, financial terms and legacy documents remain intact. New approved-format orders no longer generate an additional legacy managed invoice. No migration is needed: product submission answer JSON and order document snapshot JSON carry the prospective additions.

## Activation boundary

New operational checkout snapshots record `pending_clearance`. They cannot allocate official bill numbers or apply the company seal. The preview uses fictional data and demonstrates `01` independently per issuer. It creates no account, order, payment, bill number or database record. Simulated numbering is atomic, replay safe and rollback safe; native batches acquire sorted issuer locks.

Unsupported issuer evidence, incompatible tax status or inconsistent recorded allocations retain a readable aggregate operational payment receipt and a printed review notice. They do not gain statutory billing authority. An independently registered seller's goods are never represented as company goods.

## Verification

- Separate GPT-6.1 Sol reviewers with extra-high reasoning reviewed code and test safety. All reported P1/P2 findings were addressed; final bounded review found none remaining.
- Focused billing checks: 21 passed, covering parsing, ownership, revision/clearing, same-timestamp revisions, real product/checkout/direct delivery workflow, issuer grouping, sealed allocations, protected stamp GET, native lock/SQL contracts, ephemeral D1 concurrency/replay/rollback, mobile width and PDF export.
- Actual parcel fixture passed cancellation of the last company goods group, partial collection, transactional failure/retry, replay, retained SKU/issuer identity, complete charge coverage and unchanged original Order Invoice JSON.
- The first complete suite finished: 3,109 passed, 3 failed, 21 skipped. The three regressions were corrected, and all 16 checks in their affected files passed.
- The second complete suite finished all 3,143 tests: 3,121 passed, 1 failed, 21 skipped, no cancellations. Its sole failure was the older staging demo's missing in-memory `order_documents` table. Only that fixture schema was corrected; its separate rerun passed 2/2. No runtime code changed after the second run started. There are no unresolved test failures. The complete suite was not run a third time after this isolated fixture correction.
- Final lint, TypeScript, build and read-only local preflight all exited 0. The preflight reported 89/89 forms and ready sign-in storage, with the approved baseline and canonical directory intact. Logs: `lint-verified.log`, `typecheck-verified.log`, `build-verified.log`, and `local-check-verified.log` in the evidence directory.
- Normal Chrome desktop and a 390px preview were inspected. A disposable Chrome test also verified an actual 390px viewport without page-wide overflow. Tables scroll horizontally.
- Exported PDFs were visually inspected: company/mixed Order Invoice 1 page; company Receipt 1 page; mixed and registered-only receipts 2 pages; 36-line stress invoice 4 pages. The stress document retains repeated table headings and readable rows.
- Real account changes, retained database writes, migrations, seeding, imports, production changes, deployment and pushing were not performed. Native external-database tests remain disabled. Physical printing/scanner hardware and official bill issuance were not tested.

Evidence is under `C:/Users/abinash/.codex/visualizations/2026/10/20/01a159c9-e5ff-7220-98cb-a7cb94ce8399/billing-implementation`.

Full execution logs are `full-test-suite.log` and `full-test-suite-final.log`. The corrected fixture result is `corrected-fixture-rerun.log`; focused billing results are `focused-tests.log`. These logs retain the original failures and their resolution rather than rewriting the full-run result.

## Local review

- Website: http://localhost:3018
- Combined invoice: http://localhost:3018/local-testing/billing?kind=mixed
- Seller receipts: http://localhost:3018/local-testing/billing?kind=mixed&document=receipts
- Mobile invoice: http://localhost:3018/local-testing/billing?kind=mixed&viewport=mobile
- Use existing local test access at http://localhost:3018/local-testing if the preview session is absent.

Check both SKU columns and shop labels, compare invoice total with all receipt totals, check the company-only stamp, and use Print or save as PDF.

## Decisions still required

The accountant/legal reviewer must confirm the company PAN against its certificate, the statutory bill title and required particulars, electronic billing approval/registration requirements, each issuer's opening number, issue timing, treatment of delivery/service charges and credits/discount funding, and registered sellers' own bill/signature responsibilities. The operational display does not establish this clearance. Separate customer billing addresses are not collected by the current checkout; only supplied contact/address evidence is printed. No historical address or seller stock code is invented.

Official references checked: [IRD taxpayer registration guidance](https://ird.gov.np/content/13668/taxpayer-service-and-registration/), [IRD listed electronic billing software](https://ird.gov.np/public/pdf/862750310.pdf), and [Department of Commerce E-Commerce Act page](https://doc.gov.np/content/4/electric-business--e-forever--act-2081/). Applicability to the final statutory bill needs professional confirmation.
