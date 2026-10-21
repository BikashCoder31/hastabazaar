# Local Admin security and Backup & Transfer

This local implementation uses the existing database schema. It does not migrate or replace a database, publish policies, change saved commission terms, or deploy the application.

## Activate your own Admin security

Open http://localhost:3018/security in normal Chrome using your existing Admin or Super Admin account.

1. If the account has no saved password, use the explicit email verification form and enter your new password privately. Existing credentials are never overwritten by this ceremony. Approved fictional local accounts use clearly labelled captured email, not live delivery.
2. Enter the password to start authenticator setup. Scan the QR code with your authenticator, or enter the manual key privately.
3. Enter a new code from that authenticator. Save all ten recovery codes somewhere private, then confirm that you saved them.
4. Only this final confirmation activates MFA and revokes the account's older privileged sessions. MFA is optional for Admin; password sign-in is available before enrollment. Once enrolled, Admin must also supply MFA. Super Admin must enroll unless that owner has explicitly disabled their own existing MFA through the verified ceremony.

## Disable your own Super Admin MFA

In Account security, use Turn off MFA. Enter your current password and a fresh authenticator code or unused recovery code, then acknowledge password-only future sign-ins. Only Super Admin can perform this action, only on their own account. Success revokes all their sessions, invalidates recovery codes, records an audit event, and redirects to sign-in. Enable MFA again through the normal setup and saved-code confirmation. Missing or corrupt security records never count as disabled. Security-key exports still require active MFA and recent verification.

An enrolled Admin session ends after eight hours or thirty minutes without foreground activity. Background polling does not keep it alive. Password and authenticator, or a single-use recovery code, are required to verify a new privileged session. Customer sessions keep their existing lifetime.

If you use your last recovery code, immediately replace your authenticator or regenerate recovery codes from the fresh verified session. Re-enter your password. For five minutes you do not need a second old code. An authorized authenticator replacement has ten minutes to complete; the old authenticator remains active until replacement is confirmed. Losing every factor requires a separately reviewed owner recovery process; email alone cannot disable MFA.

## Create and check a backup

Open http://localhost:3018/admin/backup-transfer as Super Admin. Verify your password and MFA within the previous five minutes. Ordinary Admin accounts cannot export or inspect complete backups.

1. Choose a separate backup passphrase of at least sixteen characters. Request the encrypted `.hzb` data download and check that your browser completed it.
2. Download the separate encrypted `.hzk` key recovery bundle with a different private passphrase. Keep it separately from the data archive. The raw server key is not displayed.
3. Inspect each saved package using its passphrase. Inspection checks encrypted framing, completion, inventories and hashes without restoring data. A correct encrypted-byte inspection alone does not prove that a new host can run the application.

Downloads stream through the browser's normal download manager. Failed native downloads may display an error page; go Back, verify security again and retry. Never rely on an incomplete file or a failed inspection.

Data exports preserve recognized database tables, IDs, account and agreement history, exact saved financial terms, and public/private upload bytes and metadata. They validate every registered staff security record and all known database storage-key references. Unknown tables, missing referenced files, invalid encrypted security state, oversized rows, or concurrent source changes stop a complete export. Readiness on the page confirms authorization only; storage checks run when export starts.

Cloudflare's internal `_cf_METADATA` table is recorded as an explicit provider-owned exclusion. It contains host bookkeeping, is not application data, and D1 does not allow the application to query it. It is never copied or restored. Every discovered name must be either a fully checked included table or this exact reviewed exclusion; other names and errors are never silently skipped. The destination retains its own provider metadata.

File-reference checks use separate bounded pages for every reviewed upload column and merge them in key order, including duplicate and Unicode keys. This respects D1's compound-query limit without dropping any reference table. R2's unset optional HTTP fields are normalized as absent; stored metadata, expiry dates and file bytes remain checked.

Generated database columns are included with their observed values and marked as virtual or stored. A future destination adapter must check its own trusted schema, omit generated columns from inserts, and independently verify every computed value. Uploaded SQL is never executed.

The three registered built-in homepage images are also included. Their paths come from the same fixed application registry used to display them; other upload references must still exist in media storage. The reader only fetches those fixed paths from the configured application origin, rejects redirects and checks type, recorded size and bytes. If a restored built-in file also exists in media storage, both copies must have identical metadata and bytes before they are included once.

Security state is encrypted in the existing `marketplace_settings` table. The matching external key is stored locally in ignored `.staging/security/key.json`, outside public files and Git. The checked launcher preserves this key and its monotonic initialization flag. Never replace it to get around an error. Encrypted rows alone cannot recover MFA without the matching key.

## Future hosting move

### Hosted security provisioning and readiness

For the first hosted enrollment, follow the [restricted bootstrap procedure](hosted-security-bootstrap.md) before submitting the candidate to the normal deployment gateway. The gateway still requires full readiness and must not be used to keep a pending installation online during enrollment.

The Node hosting runtime uses `HASTABAZAAR_SECURITY_KEY` (a canonical base64url encoding of exactly 32 random bytes) and `HASTABAZAAR_SECURITY_POLICY_ROOT`, a dedicated private directory outside the application release and media roots. The HTTPS `APP_ORIGIN` and key identity are authenticated in the policy. On staging the approved directory is `/home2/hastabaz/hastabazaar-staging-security`. Keep the key in the host's private runtime configuration; never put it in command arguments, source, screenshots, or logs. On Linux the policy directory must belong to the service user with mode 0700 and its files with mode 0600. On Windows an operator must restrict the directory ACL to the service account; POSIX permission bits do not establish Windows ACL protection.

For a reviewed fresh hosted installation only, stop application workers and keep public traffic disabled. Confirm the database has no `auth-private:` records, the external policy directory does not exist, and its existing parent is private and durable. From the approved hosted application directory, with the reviewed runtime configuration loaded, run:

```
node hosted-security.mjs --provision-new-host
```

The verified release includes this self-contained operator tool; the host needs neither the source tree nor `tsx` nor a package installation. Release inventory checks require the tool, and extracted-artifact smoke runs its `--help` command without application credentials. The command does not generate or print a key. It refuses local `.staging` checkouts, local runtime settings, any existing policy directory, and existing private security records. Failure never deletes or repairs a directory. Review interrupted provisioning separately; do not delete state and rerun to bypass a refusal.

Provisioning creates pending policy only. With traffic restricted to existing staff, complete enrollment for active Super Admin accounts. Admin enrollment is optional. An authenticated explicit Super Admin disabled record satisfies the approved password-only policy; missing or corrupt records do not. Initial legacy setup access is temporary, not release readiness. Final activation writes an authenticated initialized marker durably before activating the account. A restart reads external policy again; missing, oversized, linked, corrupt, wrong-origin or wrong-key policy fails closed. An initialized policy requires the matching encrypted manifest and all registered account records, including optional Admin records. A retained initialized marker also prevents a restored old pending policy from downgrading protection.

`node hosted-security.mjs --check-readiness` performs read-only checks using `inspectHostedSecurityReadiness(bindings, db)` and prints only readiness, phase, reason codes and aggregate enrollment counts. Exit 0 means ready; exit 2 means pending or unavailable. Release acceptance requires initialized policy, a valid manifest/account inventory, and active MFA or an explicit verified disabled record for every active Super Admin. A new or pending Super Admin blocks release readiness; optional Admin enrollment does not. Every registered account record must remain intact. Local checked-launcher behavior is unchanged.

Keep both external policy files and the matching key outside ordinary database restores and release rollback directories. Never recreate pending policy to recover a populated database. If a key, policy, origin binding or manifest is lost, stop staff operations and use a separately reviewed recovery that preserves initialized state. Changing a hostname requires deliberate policy recovery/rebinding; normal startup never rewrites the origin. The adapter cannot defend against an operator deleting or rolling back the entire external state together with its database; backup access and retention must protect that independent state.

For a separately reviewed recovered host with intact encrypted records and its matching recovered key, use `node hosted-security.mjs --recover-existing-host`. It authenticates the manifest and every registered account before creating a new external policy directory in initialized state. It refuses an existing directory, missing or corrupt records, a wrong key, and this local checkout. It does not change database records, enroll staff, or bypass release readiness.

These local exports are preliminary snapshots, not final cutover approval. No restore endpoint is enabled for this installation. The reusable browser transfer engine targets prepared SQLite fixtures. Hosted MariaDB recovery follows the separate [native recovery procedure](native-recovery.md) and its mandatory disposable rehearsal; an actual hosting restore still requires destination-specific review and verification.

Before moving hosting, prepare the following as a separately reviewed operation:

1. Keep the exact matching application source, dependency lockfile and a tested runtime build separately. They are not included in the data archive. The current candidate release label is not a source-code fingerprint.
2. Prepare an empty destination with a compatible application release, schema and storage adapter. Do not run uploaded SQL, overwrite an existing installation, or restore into this local database.
3. Recover matching security keys privately, preserve the initialized state, and configure server-only secrets on the new host. Keys and encrypted records use stable IDs rather than a machine path or hostname.
4. Rehearse restoration with dispatch, mail and payments paused. Independently check table counts and hashes, file hashes and private access, relationships, accounts, authenticator/recovery state, agreement history and exact financial amounts. Restored sessions and temporary tokens must not become active. Pending staff invitations expire on the destination; accepted history remains.
5. For final cutover, pause writes, make a fresh final snapshot, verify a restore, configure domain/OAuth/email/payment settings, then separately approve switching traffic. The current workspace does not freeze writes or switch hosting.

Large exports and restoration on a real future host still require resource/timeout testing. TOTP adds a second factor but is not phishing-resistant like a passkey; do not describe this implementation as complete protection against every attack.
