# Seller tools

Started on `admin-redesign` at `60908834` after the Couriers completion marker. All 18 design references are present.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| T1 · Guided Add a product | Main and product copy helper | Done | `Seller tools: Guided Add a product` | Typecheck, lint and 28 focused tests passed. Chrome verified the live start and guided pages at all four widths, and scratch, copy, resume, send and zero-photo assistance with disposable records. |
| T2 · Seller desk for Super Admin | Seller desk helper | Done | `b217c415` | Typecheck and lint passed. Queue, navigation and native decision tests passed. Chrome at 390, 768, 1024 and 1440 px verified keyboard and touch interaction, no overflow and automatic advancement after a decision. |
| T3 · Final check | Main | In progress | | Full suite is running. Verify the seller-to-Super-Admin browser walkthrough on disposable data. |

## For the owner

- Seller desk keeps the original decision rules. General payout requests can be left pending. The existing protected bank workflow supports documented holds. Older catalog records retain their existing separate approval and publication steps. General seller-support contacts still open in Contact & feedback when there is no seller-linked staff task.
- “Made in” and “Ready to send in” start blank on a new product because the shop profile has no saved defaults for those fields. They carry over when copying a published product. The wizard shows the current selling terms when available. The app has no computed comparable-products price range to display in this flow.
- Photo guidance uses the tips box. Recent products uses published listings owned by the seller. The checked local seller had no eligible listings or unfinished drafts, so the populated flows were verified with disposable records.
