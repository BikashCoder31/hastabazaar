# Seller Studio design reference

These are the approved designs for the Seller Studio redesign (the `/seller` pages).

- `screens/` shows each board at 1440 px wide (desktop).
- `screens/tablet/` shows the same pages at 768 px, and `screens/phone/` at 390 px. Every page must work at all three sizes.
- `source/` holds each board's mock-up HTML. Use it only to read exact wording, spacing and colours. Don't copy its code. It's a design mock-up, its data is invented, and its images won't load.

| Picture | What it is | Real route |
|---|---|---|
| 01-WhoActsNext.png | For each seller action: what lands in Super Admin › Today, and what the seller sees afterwards | (rules, not a page) |
| 02-Today.png | Today: "Do this first", "Your turn" list, "With Hastabazaar" list, money, running low | `/seller` |
| 03-Orders.png | Orders by step: To prepare → Preparing → Ready for pickup → With courier → Delivered | `/seller/orders`, `/seller/orders/[id]`, `/seller/order-responses/[id]` |
| 04-Returns.png | Return case: listing photo vs customer photo, seller's reply, Hastabazaar decides | `/seller/cases`, `/seller/cases/returns/[id]` |
| 05-Products.png | Products with "What happens next", inline stock, archive | `/seller/products` |
| 06-EditProduct.png | Edit product: Hastabazaar's requested change, live checklist, "Send for review" | `/seller/products/new`, `/seller/products/[id]/edit` |
| 07-Earnings.png | Payout tracker (same 4 steps as Super Admin), where the money is, bank account | `/seller/finance` |
| 08-Phone.png | Today and an order on a phone, with the bottom tab bar | all pages below 768 px |

**Key rules**

- Every item shows whose turn it is: **Your turn** (dark navy) or **With Hastabazaar** (blue). A status never appears without one.
- The seller's real steps are **Start preparing** and **Mark ready for pickup**. Hastabazaar books the courier. There is no "accept within 24 hours" step.
- A seller replies to a return (Accept / Disagree / Ask a question); Hastabazaar makes the final decision.
- One payout request at a time. Payouts go out on Wednesdays.
- Couriers (e.g. Nepal Can Move) deliver and collect cash. Never say "rider" on seller pages.
- All money values (12% commission, 7-day hold, marketplace fee Off, payout weekday) come from the app's settings and database, never from these pictures.
