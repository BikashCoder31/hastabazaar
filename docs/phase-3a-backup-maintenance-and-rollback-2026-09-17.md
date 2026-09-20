# Phase 3A — Backup, Maintenance, and Rollback Record

Date: 2026-09-17 (Asia/Kathmandu)

Scope authorization: capacity checks, fresh production backups, off-server download and SHA-256 verification, and maintenance/rollback planning only. Credential rotation, deployment, uploads, migrations, Passenger stop/restart, deletion, cleanup, and production configuration changes remain unauthorized.

## Capacity evidence before backup creation

- Disk usage: approximately 1.86 GB with no cPanel quota limit displayed.
- Database disk usage: approximately 5.31 MB with no cPanel quota limit displayed.
- CPU: 1% average in the inspected interval; 100% limit.
- Physical memory: 426.53 MB average in the inspected interval; 1 GB limit.
- Entry processes: 4 average; 20 limit.
- Number of processes: 44 average; 100 limit.
- I/O: approximately 96.18 bytes/second average; 10 MB/second limit.
- IOPS: 0 average; 1024 limit.
- Resource faults: none displayed for the inspected interval.

The account had enough displayed capacity to create the approved backups sequentially. Backups were not created concurrently.

## Fresh backup evidence

Off-server custody folder:

`C:\Users\abinash\Downloads\Hastabazaar-Production-Backups-2026-09-17`

This folder is outside the Git workspace and inherits the Windows user-profile permissions. Encryption of the local volume and replication to a second independent off-site location were not independently verified.

| Artifact | Server evidence | Downloaded bytes | Local SHA-256 | Integrity |
|---|---:|---:|---|---|
| `backup-9.17.2026_00-25-02_hastabaz.tar.gz` | 324.06 MB; 2026-09-17 00:25 server time; mode 0600 | 339,806,631 | `4E4650F61EF0FC369A6FADD1C4DF945ADAE7B8A55DE244B9B4562D617F2C131E` | gzip CRC/decompression pass; 472,438,272 uncompressed bytes |
| `hastabaz_marketplace-2026-09-17.sql.gz` | Generated and streamed by cPanel's database-backup function | 44,186 | `0E2D3C662523990E14001FE0E72644188D23C83E011FFB5CA41659E56749CEF0` | gzip CRC/decompression pass; 276,016 uncompressed bytes |
| `hastabazaar-app-2026-09-17-predeployment.tar.gz` | 74.81 MB; 2026-09-17 00:34 server time; mode 0644 | 78,442,370 | `BC3C948DF811270CBCCEB85F5B619477DE55AF44B715B627E65E002436CB7038` | gzip CRC/decompression pass; 145,274,880 uncompressed bytes |
| `private-media-2026-09-17-predeployment.tar.gz` | 13.36 MB; 2026-09-17 00:38 server time; mode 0644 | 14,013,475 | `427C121C1E0E96119F173BE9BF87AC4B4B82E80C448E55C62F3CE1068B113FC6` | gzip CRC/decompression pass; 15,267,840 uncompressed bytes |

No archive was deleted from production. Private-media contents were not opened or listed.

### Verification limitation

The SHA-256 values above were calculated from the completed off-server downloads. cPanel File Manager supplied rounded server sizes, which are consistent with the exact downloaded byte counts. A reliable server-side `sha256sum` result could not be captured through the cPanel canvas terminal, so byte-for-byte server/local hash comparison remains outstanding and is not claimed as complete. The completed HTTPS transfers and gzip CRC/decompression checks provide transfer-integrity evidence, but they are not a substitute for matching source and destination SHA-256 values.

## Backup retention classification

- Fresh full-account backup: keep through rollback and observation period; retain longer if it becomes the last known pre-deployment account image.
- Fresh MariaDB export: keep permanently with restricted access as the pre-deployment database record.
- Fresh application-root archive: keep through rollback and observation period; it is the primary application rollback source.
- Fresh private-media archive: keep permanently or according to an approved records-retention policy; do not delete merely because a deployment succeeds.
- Older full-account backups and deployment packages: unknown — do not touch until production acceptance, the 24–72 hour observation period, and explicit deletion approval.

## Maintenance plan for a later authorized deployment

1. Confirm the exact approved release scope and immutable release ID.
2. Build outside the hosting account, generate the manifest and SHA-256, and verify the package locally.
3. Confirm the four Phase 3A backups remain present locally and the three server-resident archives remain visible.
4. Upload and extract the next release into a unique staging directory without changing the active application.
5. Verify staged file count, manifest, startup file, dependencies, permissions, and release identifier before any Passenger interruption.
6. Confirm no migrations are required. If a later review identifies a missing additive migration, stop and obtain separate authorization before applying it.
7. Begin the approved maintenance window and stop Passenger only when the prepared release is ready for the final switch.
8. Preserve the active application directory as the known-good rollback release. Do not overwrite it.
9. Switch application directories, preserve the environment configuration, and start Passenger once.
10. Verify health, HTTPS, authentication, Super Admin access, Seller applications, private documents, products/uploads, cart, COD checkout, policy acceptance, orders, cancellations, delivery, returns, complaints, refunds, notifications, and resource usage.
11. If any release-blocking verification fails, execute the application-only rollback below.

Expected user-visible interruption: approximately 2–5 minutes for a prepared application-only switch and Passenger restart. Reserve a 20–30 minute maintenance window for verification and rollback handling. No database migration is currently expected because production evidence showed additive migrations 1–21 installed.

## Exact application-only rollback procedure

This procedure intentionally retains additive database changes and all new orders, payments, financial records, audit history, policy acceptances, uploads, and private media.

1. Stop new deployment actions at the first failed acceptance check and record the failing endpoint or workflow.
2. Do not import or restore any database backup. Do not restore older private media over the current directory.
3. Stop Passenger once for the rollback switch.
4. Move the failed application directory to a uniquely named incident-hold path; do not delete it.
5. Restore the immediately preceding known-good application directory to `/home2/hastabaz/hastabazaar-app`.
6. Preserve the existing production environment configuration and ownership/permissions. Do not expose or rewrite secret values.
7. Start Passenger once. Do not start a second Node.js process.
8. Verify `/health`, HTTPS, authentication, existing Super Admin access, Seller access, documents/media, product/catalog operations, cart, COD checkout, orders, delivery/returns/refunds, notifications, and resource usage.
9. Confirm that orders and audit events created after deployment remain present. Treat any incompatibility between the old application and additive schema as an incident; do not drop columns/tables or restore an older database.
10. Keep the failed release, active rollback release, logs, backups, and hash evidence through investigation and the observation period. Any deletion requires a separate exact-list approval.

## Outstanding Phase 3A evidence

- Matching server-side SHA-256 hashes for the three server-resident archives.
- Independent confirmation that the local backup destination is encrypted at rest.
- A second independent off-site copy and verified-retrieval test.
- A redacted environment-name record tied to the release manifest; values must never be copied.
- Final release-scope allowlist and approval.
- Separate authorization for any deployment, upload, migration, Passenger action, credential rotation, or cleanup.
