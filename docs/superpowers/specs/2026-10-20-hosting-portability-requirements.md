# Hosting portability and Super Admin Backup & Transfer

Date: 20 October 2026 (Nepal time).

Status: requirements added to the proposed security design. The full transfer tool is not implemented or verified. This document authorizes no live export, restore, database migration, account change, host change or deployment.

## What the user needs

The business must be able to change hosting without losing its records, agreements, uploads, account access or MFA. Super Admin should control backup preparation and see evidence that a destination received all required data. A future move must not depend on the old hosting company remaining available to decrypt security records.

## What exists today

- Database access is abstracted behind D1-like interfaces (`lib/db/d1.ts`), with a MariaDB adapter in `lib/runtime/node-bindings.ts`.
- Media uses an R2-like binding, with a filesystem-backed adapter in the Node runtime. Copying only database rows does not copy the media bytes or their metadata.
- The Governance “Backup verification register” records evidence supplied by staff. Its UI explicitly says saving does not create, download or restore a backup (`components/admin/governance-console.tsx`).
- Historical backup/restore scripts and dated reports exist. They are not evidence that the current application has a complete Super Admin transfer workflow, or that current cross-engine restore is tested. Do not execute those scripts against current data.

## Keep the security implementation portable now

1. Persist security state through a dedicated repository over existing database storage. Keep it separate from host-specific bindings and ordinary business settings.
2. Preserve canonical account IDs, password hashes and their algorithm/version, roles, permissions, MFA enrollment, security generation, last accepted TOTP counter and recovery-code hashes/consumption state.
3. Encrypt security records with an application-owned server key and stable key IDs. Bind encryption to the stable record/account identity and schema, never a hosting name, public domain, absolute path or machine identifier.
4. Provide a defined encrypted recovery/export format for the keyring. Keep the keyring outside the database in normal operation, but do not make it impossible for the owner to transfer it securely.
5. Avoid platform-only cryptographic formats and implicit conversion of integers, money, binary values, dates, NULL or Unicode during export/import.
6. Add portability tests using isolated fictional records before claiming that MFA survives a move. Native SQLite/Worker and MariaDB behaviour must each be verified before claiming support for that transfer direction.

## Proposed Super Admin workflow

Add **Backup & Transfer** as a dedicated Super Admin feature. Ordinary Admin permissions must not grant complete export or restore. Require recent primary authentication and MFA for preparation, download, recovery-bundle operations and destination activation. When a destination has no application accounts yet, use a separate operator-controlled, short-lived installation ceremony; do not expose a public unauthenticated restore endpoint or rely on an account that has not yet been restored.

The workflow should show:

1. **Readiness:** current application/release, database schema and export format, storage inventory, supported destination adapters, available space and missing requirements. Unrecognized tables, missing files or unknown security payload versions must block a “complete” result.
2. **Prepare encrypted backup:** build a consistent database and media snapshot using resumable, bounded server-side jobs. Show progress, errors, record/file counts and the snapshot cutoff time. Keep the download private and expiring. Do not expose archives through public media routes.
3. **Protect the keyring:** create a separately downloadable, encrypted key-recovery bundle under an owner-controlled recovery key/passphrase. Do not display the raw application encryption key, embed it unprotected in the archive, or store the decryption secret next to the downloads. A passphrase is entered privately in the browser and handled using a reviewed encryption format/KDF; never put it in logs, URLs or audit snapshots. The user keeps the recovery material outside the hosting account.
4. **Check destination:** validate runtime, storage/database adapter, schema compatibility, encryption-key IDs, capacity and application release before changing anything. Hosting credentials stay server-side. Do not turn destination URLs into an unrestricted server-side request proxy.
5. **Upload and preview:** unpack into a new isolated destination, validate authenticity/integrity and show what would be restored. Reject archive path traversal, symlinks, duplicate paths, unsupported formats, oversized/decompression-bomb content and unknown executable hooks. Never run SQL or scripts from an untrusted uploaded package.
6. **Verify restored data:** compare counts, stable IDs, relationships, exact monetary amounts, version histories, file sizes/hashes and security state. Show missing/extra items and block activation on a mismatch. Do not overwrite or merge into an existing business database silently.
7. **Complete the move:** only after explicit authorization, pause writes/jobs on the old host, take the final consistent snapshot/delta, verify it on the new host and switch traffic. Preserve the old host and backups for rollback. A write-free final cutoff is necessary to avoid losing orders or reactivating a recovery code used after an earlier snapshot.

All export/restore actions require secret-free audit records: actor, time, package ID, source/destination installation identity, status and validation result. They must not expose the downloaded data, secrets or private file names in broadly visible logs. Large packages must stream or use background jobs rather than loading all records/uploads into one web request.

## What a complete transfer package covers

The inventory is built from the actual schema and object storage at export time, with explicit treatment of every table and object namespace. A fixed list that silently misses a later feature is insufficient.

- **Accounts and authority:** account IDs, identity links, password hashes/version, verification records, staff roles, permission profiles and access history.
- **Business records:** customer and delivery addresses, sellers/makers, riders, catalogues, stock, carts, orders, delivery/aftercare, payment/refund records, commissions, payouts, wallet/referrals, promotions, loyalty and current plus historical settings.
- **Agreements and evidence:** accepted agreement snapshots, consent, policy/procedure/form versions and histories, saved answers, audit logs, legal holds, retention state and deletion tombstones. Preserve the saved rates on historical records, including earlier rates; do not recalculate from current settings.
- **Files:** product pictures, public media, private identity/evidence documents and all other uploads, with stable object keys, content types, access classifications, custom metadata and content hashes. Preserve private access after restore.
- **Security:** encrypted MFA state and recovery-code hashes/consumption history, key IDs and an independently protected keyring recovery bundle. Plaintext recovery codes cannot be recovered from their hashes and must not be invented or regenerated as part of transfer.
- **Application compatibility:** immutable release/format/schema manifest, a reproducible matching application artifact or source/dependency snapshot, required vendored dependencies and a list of environment variable names/configuration requirements. Do not package unrestricted developer folders, Git credentials or raw environment files.

Use an encrypted archive containing a versioned, typed logical data representation plus file objects and a validation manifest. A same-engine native database snapshot may supplement it, but raw SQLite and MariaDB SQL dumps are not interchangeable. Preserve exact decimals/large integers as tagged strings, binary data as explicitly typed bytes and NULL separately from empty strings. Verification compares canonical typed values; it must not rely on lossy JavaScript number conversion.

Every table must be explicitly classified as durable business/security data, installation metadata or temporary operational state. Temporary records may be retained in an encrypted archive for completeness, but the target must not reinstate active sessions, OTP/reset challenges, short-lived MFA challenges, download grants or stale worker leases. Users sign in again on the new host using their existing credentials/authenticator. Restore notification/payment/job records as required history with dispatch paused; a preview/import must not send emails, charge customers or replay external actions. Reconcile any pending external operations before resuming jobs.

## Keys, credentials and external services

A data archive alone is not sufficient to retain MFA access: the encrypted security records and matching protected keyring are both required. Restoring the same key IDs and account IDs keeps the same authenticator enrollment; used recovery codes stay used. A missing or wrong key must block activation rather than disable MFA.

Hosting-specific database passwords, mail/payment provider credentials, OAuth redirect registrations, domains, DNS and TLS need configuration on the destination. The tool should list these requirements and verify readiness without promising that changing the host also transfers ownership of third-party services. Do not silently copy local simulation settings into a live environment or mix local test data with production.

“Portable” means a documented and tested destination adapter and compatible runtime/schema, not a guarantee that any hosting plan or database engine can run the application unchanged. Creating/preparing a destination schema during a future hosting move needs separate authorization; the current no-migration limit remains in force.

## Required evidence before calling a future move complete

- An encrypted backup can be opened with the owner's recovery material and fails safely with the wrong material.
- All tables are inventoried; expected row counts, exact values/relationships and history match at the final cutoff.
- Every required media object and metadata entry matches, and private documents remain private.
- Existing Super Admin and Admin can sign in and complete MFA; already used recovery codes still fail; old sessions/challenges cannot grant access.
- Current settings and historical saved commission terms match without recalculation.
- A restore into a fresh isolated destination passes relevant account, seller, checkout, financial, legal and operational checks without sending real messages or making real payments.
- Destination readiness, health, rollback/source preservation and final approval are recorded.

These are design requirements, not completed tests. This update changes documentation only; no backup of real records, restore, migration or deployment has been performed.
