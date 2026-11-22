# Super Admin design reference

These are the approved designs for the Super Admin redesign.

- `screens/` holds a picture of each board at 1440 px wide. Phone layouts are in `11-Mobile.png`.
- `screens/phone/` and `screens/tablet/` show the same pages at 390 px (phone) and 768 px (tablet). Every page must also work at those sizes. On phones the Super Admin has a dark top bar (section name, search, menu) and a bottom tab bar: Today, Orders, Sellers, Money, More.
- `source/` holds each board's mock-up HTML. Use it only to read exact wording, spacing and colours. Don't copy its code: it's a design mock-up, its data is invented, and its images won't load.

| Picture | What it is | Used in phase |
|---|---|---|
| 01-Map.png | The 9 menu sections and where every old link goes | Phase 1 |
| 02-Overview.png | Today: one task list | Phase 2 (the ? button), Phase 3 |
| 03-Orders.png | Orders list: one filter bar, refresh without a blank screen | Phase 5, Phase 6 |
| 04-OrderDetail.png | Order details: next step, progress line, tabs | Phase 4 |
| 05-Care.png | Return case with the handmade-variation check | Phase 9 |
| 06-Sellers.png | Seller application review | Phase 2, Phase 5 (wording) |
| 07-Moderation.png | Catalog product review | Phase 2, Phase 5 (wording) |
| 08-Payouts.png | Payouts as 4 stages, one Super Admin approves | Phase 6, Phase 7 |
| 09-Homepage.png | Homepage editor (only the ? button is new) | Phase 2 |
| 10-Settings.png | Business settings: side menu and before/after preview | Phase 8 |
| 11-Mobile.png | Phone layout, and the rules for buttons and links | Phase 1, Phase 9 |
| 12-NotInUse.png | Settings › Not in use yet: switched-off riders and SMS in one place | Correction (riders off) |
| 13-Dispatch.png | Orders › Dispatch: book a courier for parcels that are ready, grouped by seller | Batch 2 · Task M |
| 14-CourierCash.png | Money › Courier cash: match courier payments to delivered cash parcels | Batch 2 · Task N |
| 15-Problems.png | Orders › Parcel problems & delays: seller delays, can't fulfil, failed, refused, coming back | Batch 2 · Task O |
| 16-Refunds.png | Money › Refunds to customers and money back from sellers and couriers | Batch 2 · Task P |
| 17-SellerRecord.png | Sellers › one page per seller with five standing scores | Batch 2 · Task Q |
| 18-Customers.png | Care › Customers, delivery outcomes and cash-on-delivery risk | Batch 2 · Task R |
| 19-Search.png | ⌘K search across orders, payouts, sellers, customers, settings and pages | Batch 2 · Task S |
| 20-PayoutRun.png | Money › Wednesday payout run: approve all passing payouts at once | Batch 2 · Task T |
| 21-ProductHelp.png | Catalog › Sellers asking for help, and approved products not live yet | Batch 2 · Task U |
| 22-Team.png | Settings › Team & access (one Super Admin, Admin access presets) | Batch 2 · Task V |
| 23-Reports.png | Reports › Business report | Batch 2 · Task W |
| 24-Offers.png | Growth › All offers with cost and budget | Batch 2 · Task X |
| 25-Health.png | Settings › System health & backups | Batch 2 · Task Y |

**Riders and SMS:** own delivery riders are switched off and SMS isn't built. Couriers deliver and collect cash on delivery. Everything rider-related lives only on Settings › Not in use yet (12-NotInUse.png); every other picture says "courier".

**Rule for Codex:** match the layout, order, wording and colours in the pictures. Every real number (commission, hold days, fees, counts) comes from the app's own settings and database, never from these pictures.
