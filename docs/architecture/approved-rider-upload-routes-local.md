# Rider upload route foundation (local)

Bounded subtask implemented alongside the parent's rider repository/UI work. No rider repository changes were made by this subtask.

POST /api/rider/application accepts multipart legalName, phone, district, identityType, identityNumber and exactly one identityPhoto. POST /api/rider/reports accepts jobId, version, kind, note, cashPaisa (integer paisa), requestId, an explicit openBoxOutcome, and photo or video. The server determines whether open-box applies from the immutable assignment snapshot; a client flag cannot enable it. Delivered reports require exactly one proof upload. Failed/unavailable reports require proof when an open-box parcel is refused for a wrong, damaged or other inspected-item reason, and otherwise permit zero or one. Both routes require a current authenticated customer, trusted mutation origin, per-user limits and bounded multipart bodies. A failed repository commit removes its newly uploaded object.

Images are limited to JPEG/PNG/WebP at 5 MB and 20 million decoded pixels. Sharp decodes, rotates and normalizes to JPEG up to 4096px, removing metadata. Identity rejects video; proof accepts MP4 up to 20 MB/60 seconds using the existing bounded movie/video-track metadata validator. This is not video codec decoding or malware scanning.

GET /api/rider/media/{applicationId}?kind=identity allows the current application owner or admin.invite staff authority. GET /api/rider/media/{reportId} allows approved current report owner with the same current parcel assignment owner (version changes do not hide accepted historical proof) or staff order.manage. Missing/unauthorized requests return the same 404. Private/no-store, nosniff and a restrictive content policy are returned. There is no public object-key endpoint and no Range optimization added in this subtask.

Files: lib/riders/media-upload.ts, app/api/rider/application/route.ts, app/api/rider/reports/route.ts, app/api/rider/media/[id]/route.ts, tests/rider-media.test.ts. Two focused tests pass, including real EXIF input normalized to metadata-free JPEG, invalid/oversized evidence rejection and exact-one proof validation; scoped lint passes. Full route integration and lifecycle tests depend on the parent's current rider schema/repository/build. No deployment or real messages occurred.

Proof-read regression: tests/rider-media-access.test.ts passes a real SQLite authorization query after assignment version advancement and denies unrelated users, reassignment and suspension. Route authorization lives in lib/riders/media-access.ts. Guarded scripts/verify-rider-browser.mjs is prepared for rebuilt end-to-end browser verification.

## Final integrated acceptance update

Current combined rider browser acceptance passed; private normalized identity/proof, mandatory proof, staff confirmation and suspended-owner denial verified. No real messages or deployment. See approved-four-local-2026-09-13.md for final-source boundaries.

## v1.2.1 open-box and rider-finance update

Open-box eligibility is now the intersection of a published category list, published service-area list, the product and destination, and a separately approved rider capability. The assignment snapshots those decisions and the effective rider-finance version. Outcomes distinguish inspected acceptance, acceptance with the inner protective seal intact, inspection declined, and evidence-backed whole-parcel refusal. Opening outer shipping packaging is not treated as breaking a protected inner seal, and inspection, acceptance or OTP does not waive a later valid complaint.

COD collection creates an immutable rider cash obligation with a configured Kathmandu-calendar due date. The approved rider submits a bounded, idempotent cash-handover claim from the rider dashboard; it remains pending until a different authorized finance reviewer verifies actual receipt. Approved remittances allocate oldest-first and may be partial. Cash already held, active uncollected COD assignments and a proposed assignment are assessed against the configured limit; overdue remittance blocks a new assignment but does not prevent safe completion or return of a parcel already held. Rider trip compensation is a separate, explicitly simulated ledger and never changes customer cash, delivery charges or seller/maker settlement.
