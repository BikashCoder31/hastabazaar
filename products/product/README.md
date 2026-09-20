# Product workspace status

- Active/prepared product folders remain directly under this directory as numeric folders.
- Seller-specific `uploaded-products.json` registers are authoritative. Product folders may also be archived under `_uploaded/<seller-account>/<product-number>` when that archival step has been explicitly performed.
- Seller-specific uploaded registers are stored under `_uploaded/<seller-account>/uploaded-products.json`.
- Current seller registers: `_uploaded/HAND-CREATION`, `_uploaded/HATHKRITI`, and `_uploaded/HIMALAYAN-CRAFT`.

Before preparing a future product, check its ASIN, canonical URL, supplied URL, title, brand, model/identifier, colour, and variant against **every** seller-specific `uploaded-products.json` register and every existing `product-data.json`. If it matches a registered product, skip it unless the user explicitly directs otherwise. If it is only a possible or material match, ask the user for confirmation **before** processing it.
