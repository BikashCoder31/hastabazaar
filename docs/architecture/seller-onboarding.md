# Seller onboarding

## Public application

The `/sell` route lets a registered Nepal business submit its identity, tax status, location, product summary, and verification documents. The server independently validates every field and document; browser validation is only a convenience.

On a valid submission:

1. Documents are placed under opaque private R2 keys.
2. D1 atomically creates the applicant identity, customer role, seller profile, document metadata, and audit event.
3. The seller begins in `submitted` state and receives a non-secret application reference.
4. No seller permissions or products are published automatically.

If the database transaction fails, newly uploaded objects are removed. Duplicate email, phone, registration, and tax identities return a conflict instead of creating another profile.

## Document controls

- Required: business registration, PAN/VAT certificate, and authorised representative identity.
- Optional during the first submission: bank-account verification.
- Accepted: PDF, JPG, and PNG, up to 5 MB each and 22 MB for the complete request.
- The server checks both the declared content type and the file signature.
- Private document object keys never contain the applicant's filename.
- Seller applications are same-origin protected and D1 rate-limited before uploads are processed. Production launch still requires an approved malware scanner, optional challenge provider such as Turnstile, and a reviewed retention schedule. Staff-only document delivery is implemented with authentication, role checks, no-store headers, opaque object keys, and content-type hardening.

## Review and access

`/admin/sellers` provides the protected Admin queue. The queue exposes application details and document counts but never public document URLs.

The review screen authenticates staff, looks up `user_roles` server-side, requires `seller.application.review`, prevents self-approval, and appends moderation and audit events. Approval marks pending evidence as verified and grants the seller role; rejection or change requests do not.

Hosted Sites authentication supplies the stable user identity used by customer, seller, and staff pages. The seller application itself does not create a password or grant a seller session; approval and a matching signed-in identity are still required.
