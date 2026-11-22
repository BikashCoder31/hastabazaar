# Couriers

Started from `1838eea7` on `admin-redesign`. The checked preview passed its 107 form and sign-in readiness checks. The refreshed Dispatch, Courier cash and Delivery partners references are present at all three design widths.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| C1 · Delivery partners | Main | Done | `e78708ee` | Typecheck, lint and 24 focused tests passed. Chrome at 390, 768, 1024 and 1440 px passed on the local preview and a disposable schema-ready fixture. Verified partner edits, role denial and audit. |
| C2 · Book by hand from Dispatch | Main | Done | `c966c515` | Typecheck, lint and 14 focused tests passed. Chrome checks at 390, 768, 1024 and 1440 px verified the pre-upgrade Dispatch page and an Upaya booking in a disposable fixture. Copy, CSV and audit, seller pickup and customer tracking were verified. |
| C3 · Courier cash per partner | Courier cash helper | Done | `Couriers: Courier cash per partner` | Typecheck, lint and 12 focused tests passed. Chrome at all four widths passed on the local preview and a disposable multi-partner fixture. Verified grouping and the reference field with two Upaya parcels, Nepal Can Move and a legacy courier. |
| C4 · Final check | Main | Pending | | Recheck the changed pages and exercise cash and prepaid courier bookings. |

## For the owner

- The new table starts empty. After applying 0171, open Orders › Delivery partners and add Upaya as In use, By hand, with cash on delivery and the default for new bookings. Add Nepal Can Move as Being set up and By hand. Change its status to In use when you are ready to book with it.
- In Edit Upaya, paste the real public HTTPS tracking URL under Customer tracking link. Replace the booking number in that URL with `{number}` once. Add the equivalent for Nepal Can Move if you have its pattern.
- Dispatch uses a generic CSV with weight in kilograms and COD in NPR. Confirm Upaya’s bulk-upload format before using the file for a bulk upload. Individual bookings can use Copy or Copy all.
- Migration 0171 for an approved D1 copy: `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0171_delivery_partners.sql`.
- Migration 0171 for an approved MariaDB copy: `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-delivery-partners.sql`.
