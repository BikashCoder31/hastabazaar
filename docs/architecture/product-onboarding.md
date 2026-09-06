# Product onboarding and publication

## Seller workflow

Only an approved seller account can access `/seller` and submit products. During controlled launch, the signed-in email must match the email on the approved seller application. Authentication identifies the visitor; D1 seller status, ownership, and role checks grant authority.

A seller can:

- submit bilingual product information, Nepalese-rupee pricing, SKU, maker, materials, dimensions, care, safety, warranty, return eligibility, and initial stock;
- upload 1–5 JPG, PNG, or WebP product photos, up to 5 MB each;
- see listing and review status;
- revise and resubmit a listing when an Admin requests changes; and
- update inventory for owned, active products.

Image bytes are stored under opaque R2 keys. D1 stores searchable metadata. The server verifies both declared MIME type and file signature, enforces ownership, and removes newly uploaded objects when persistence fails.

## Review and publication

The product state sequence is:

1. `submitted` → `under_review`
2. `under_review` → `needs_changes`, `approved`, or `rejected`
3. `approved` → `published`

Approval and publication are separate actions. Only `published` products appear in `/shop`, public product pages, or publicly accessible media responses. All other product media requires an approved owner or staff identity.

Every review transition records a reason, moderation event, actor, request identifier, previous status, next status, and timestamp. Staff cannot review products belonging to their own seller profile. Inventory changes create a dedicated adjustment record and audit event using an optimistic concurrency check.

## Public catalogue boundary

The public catalogue queries only `published` rows and resolves images by media ID rather than exposing R2 object keys. Public image responses are cacheable and content-type hardened; private responses are `no-store`. Checkout is intentionally not attached yet, so the product page communicates availability without accepting an order.

## Remaining launch controls

- production malware/image moderation for uploads;
- rate limiting and automated abuse prevention;
- the final seller identity provider decision for broad external onboarding;
- product variants and option-specific inventory if the initial catalogue requires them; and
- checkout reservation logic so carts cannot oversell current stock.
