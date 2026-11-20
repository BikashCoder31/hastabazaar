# T31 homepage media integrity — scoped evidence

Source frozen 2026-11-04. Root owns Hero/Occasion/visibility UI, pages and their browser journeys; this slice owns media collection/item/upload/archive APIs, create/archive repository branches, upload identity helper and isolated fixtures. Existing image/MP4 decoding, limits, carousel validation and publication rules are unchanged. No video creation/development, provider traffic, installation, launch bypass or canonical database operation occurred.

## Actual boundaries

Actor intent is reject-only and compares the trusted current internal staff ID; original configured business_settings.view/manage permission checks remain. Collection and item reads recheck current staff before returning metadata/bytes, including after blob lookup. Upload/archive transactions now include the actual shared native staff guards, preserving role/profile revision races and existing retained-version archive protections. Archive exact replay is bound to original actor and reason.

Optional multipart uploadId is 16–80 ASCII safe characters (UUID valid); optional X-Hastabazaar-Upload-Id must match it. Missing nonce remains legacy compatible with server UUID. The header enables nonce echo on initial rejection before multipart is read. SHA256 identity covers the actual sanitized bytes, canonical metadata and actor; the private key contains nonce plus fingerprint. Competing same-nonce/different-file uploads cannot overwrite winning bytes before native conflict detection. Exact accepted replay returns the original row/createdAt before another put; no new audit receipt or row is manufactured. A creation audit receipt and current staff guards commit with the media row.

POST known acceptance/exact replay returns 201 {uploadId,status:recorded,media}. GET collection?uploadId=nonce returns 200 {uploadId,status:recorded|unconfirmed,media:record|null}; unconfirmed is absence of proof and does not trigger a write. Probe requires current view access and original creator; another independently authorized reader receives409 rather than adopting that actor's outcome. A metadata receipt is not a claim of perpetual blob availability.

Initial upload401/403 returns code access_denied_before_write/status rejected; after any put/batch,403 is outcome_unconfirmed/status uncertain and retains the original uploadId. Unreadable native commit proof returns 503 uncertain with the same reference. Bytes are never deleted merely because a repository operation/readback threw. Proven committed records are recovered by exact native readback after ACK loss. Unknown or competing conflicting uploads may leave an unreferenced private content key; it remains private and cannot overwrite the winner. No cleanup/backup program was added.

## RED and correction evidence

Root's actual intent tests reproduced old collection200, item404 before intent rejection, old upload consuming multipart, and actor revocation during collection still returning200. Confirmed here in homepage-media-intent-red-confirmed.tap (0/5).

Initial new integrity fixtures used a fictional HTTPS origin under local_staging and were correctly stopped by the real loopback guard before writes. Those setup failures are explicitly not commit/blob evidence. The fixture was corrected to http://localhost:3018 without bypassing/changing the environment guard; it constructs Requests/in-memory storage and never launches or contacts a server. Only the original owned create/archive behavior was temporarily replayed from the inspected source while provisional fixes were checkpointed, then fixes restored. Meaningful native RED: homepage-media-native-meaningful-red.tap (0/8,27.009s): an actual native committed row lost its referenced blob after ACK loss; unreadable proof also deleted it; staff loss still created/archived rows; nonce replay was ignored; archive old intent consumed its body; role loss during blob lookup returned200. SQL and guards were real; no mock commit or disabled constraints.

## Current results

- homepage-media-final-regression.tap:17/17, exit0,28.551s. Parent actual resolver/intent5 + native SQLite/blob8 + retained repository4. Covers original ACK recovery, unknown proof retention, atomic role loss insert/audit rollback, exact replay one original row/audit/put, competing bytes with one winner, old archive intent before body, atomic archive role loss, current scope before byte handoff, missing probe never resends, and other authorized actor cannot adopt an upload reference.
- homepage-media-winning-bytes.tap:1/1, exit0,5.214s. Strengthened race proof independently decodes the actual retained WebP winner bytes and checks them against the winning original input, beyond checking distinct keys.
- Legacy repository fixture now loads the actual canonical user_roles/0031 staff tables and guards, with a real fictional current Super Admin; it does not replace native permission checks with a stub.

Pure helper tests/helpers/isolated-media-bucket.ts exports bucket plus copied byte Map and put/get/delete counters with no auth hooks/runtime/provider. Root can reuse it independently. The upload fixture has its own isolated auth/env hooks and should not be imported into an existing different browser runtime.

Current source SHA256 inventory: .test-artifacts/t31/homepage-media-freeze.json. Root owns final actual UI/browser and global typing checks. No native D1/Maria parity pass is claimed by this SQLite/blob cohort.

Retained route suite reconciliation: `homepage-media-retained-routes.tap`9/9 exit0,4.577s. It now runs the actual isolated staff/route intent cases even when invoked alone. Removed brittle direct requireStaffApi spelling checks and the obsolete assertion demanding unsafe blob deletion; bounded decoding/source operations, actual permission matrix, public headers/reference restrictions and publication checks remain. Production source hashes unchanged.
