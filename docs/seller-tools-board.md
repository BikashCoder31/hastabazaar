# Seller tools

Started on `admin-redesign` at `60908834` after the Couriers completion marker. All 18 design references are present.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| T1 · Guided Add a product | Main and product copy helper | Done | `f6ee484b` | Typecheck, lint and 28 focused tests passed. Chrome verified the live start and guided pages at all four widths, and scratch, copy, resume, send and zero-photo assistance with disposable records. |
| T2 · Seller desk for Super Admin | Seller desk helper | Done | `b217c415` | Typecheck and lint passed. Queue, navigation and native decision tests passed. Chrome at 390, 768, 1024 and 1440 px verified keyboard and touch interaction, no overflow and automatic advancement after a decision. |
| T3 · Final check | Main | Done | `Seller tools: Final check` | Typecheck, lint and both seller-to-Super-Admin browser walkthroughs passed. The full run reported 5,808 passed, 38 skipped and two failures. All 14 follow-up tests passed. |

## Verification

- The checked localhost preview passed its 107 form checks and sign-in readiness check. Chrome opened the start screen, guided entry, Seller desk, full Catalog review, Seller Today and Help at 390, 768, 1024 and 1440 px. The checked controls met 44 px and the pages fit the viewport.
- The populated browser walkthrough used disposable records and the existing product and publication endpoints. It covered all five steps, exact approved-product copying, draft resume, assistance with no photos, a single review submission, a staff request to fix a field, seller correction and successful publication. Both the 390 and 1440 px walkthroughs passed. The populated steps and correction screen were also measured at all four widths.
- The initial serial run exposed a blank-search ordering regression from the earlier Delivery partners addition. The full run included the fix that restores Today to first place and puts Delivery partners after Parcel problems.
- The full run covered 5,848 tests. It found two thumbnails missing the responsive-media attribute. Both were corrected and the media policy test passed on rerun. An existing historical recovery test saw a one-millisecond difference in the next-action timestamp. It passed alone and in the full nine-test recovery file rerun. The combined follow-up run of recovery, responsive media and search ordering passed 14 of 14.

## For the owner

- Seller desk keeps the original decision rules. General payout requests can be left pending. The existing protected bank workflow supports documented holds. Older catalog records retain their existing separate approval and publication steps. General seller-support contacts still open in Contact & feedback when there is no seller-linked staff task.
- Document review places the before and after evidence side by side. The files open through the existing private evidence links.
- “Made in” and “Ready to send in” start blank on a new product because the shop profile has no saved defaults for those fields. They carry over when copying a published product. The wizard shows the current selling terms when available. The app has no computed comparable-products price range to display in this flow.
- Photo guidance uses the tips box. Recent products uses published listings owned by the seller. The checked local seller had no eligible listings or unfinished drafts, so the populated flows were verified with disposable records.

Seller tools complete — ready for your review
