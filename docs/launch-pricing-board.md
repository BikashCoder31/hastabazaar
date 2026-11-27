# Launch pricing

Delivery branch `codex/launch-pricing` starts from `7922dcef` on `main`.

| Task | Owner | Status | Checks |
| --- | --- | --- | --- |
| P1 · Stage 4 fixes | Codex | Implemented locally | Super Admin Orders passed the native MariaDB regression. QR eligibility tests and the 390 px rendered image and download check passed. Hosted acceptance follows deployment. |
| P2 · Pricing switch and release manifest | Codex | Implemented and rehearsed | Focused tests passed. The source package verified both the six SQL assets and exact runtime pricing readiness. |
| P3 · Disposable rehearsal | Codex and owner | Verified | Restored fresh staging backup, applied six files with the guarded runner, matched retained data and money, verified zero schema findings, checked published products with pricing On and removed disposable copies. |
| P4 · Pull request | Codex and owner | Local verification passed | Typecheck, lint, focused checks and all eight local shards passed. Verify and Package results follow the PR. Owner merges. |
| P5 · Hosted staging | Owner with Codex verification | Pending | Fresh backup, guarded apply, zero schema findings, owner enables pricing, matching release health and Stage 4 checks. |
| P6 · Production runbook | Codex | Draft updated | Pricing migration, activation, 12% rates, marketplace fee Off and product enrolment are in the maintenance sequence. |

## Stage 4 fixes

- **Bank transfer.** The staging payment details previously showed the receiving account details with no merchant QR display. Both codes can now appear for the signed-in buyer while the order has a payable balance and the saved bank-account version is verified. The loader requires both private staged assets for that version. Tests cover successful loading, an incomplete pair, other origins and orders where payment should stop. Finance still verifies actual bank credit before allocating it.
- **Super Admin Orders.** The Orders page displayed the generic error. MariaDB rejected the reserved alias `portion` in the queue count and rows, and the same alias appeared in order progress. The queries now use `response_portion`. A native test covers an empty queue, a populated order with an item, and that order's progress details.

## Pricing migration inventory

Positions refer to the generated release manifest. The core keeps its existing position labels, including `139a`. The pricing files use the separate `pricing-maintenance` usage and run in the order shown.

| Position | D1 companion | MariaDB file | Reviewed SHA-256 |
| --- | --- | --- | --- |
| 144 | 0157 | `mariadb-order-item-pricing-snapshots.sql` | `4608c923f6a2f4786f7612b62f3082a091285683866790bb89773fa1d71efcc2` |
| 145 | 0158 | `mariadb-seller-shipment-delivery-allocations.sql` | `c2ae6548aede4a042a0bf56f7c75362e91bb9bd26c9344078f7bf81c2ea003cd` |
| 146 | 0159 | `mariadb-priced-return-effects.sql` | `8c3d8ea4ea8d5b8bca821b0d72048d5959576a642b2022253e8dcaa3dfe5612b` |
| 147 | 0161 | `mariadb-seller-dispatch-evidence.sql` | `1bcc3539066082368434cc8a236ea34fee341acaaa09fc496c6c147e80fbebbd` |
| 148 | 0162 | `mariadb-refund-route-reservations.sql` | `5912b7685b6f76ab8d5ec2ef0703d797017c1229b4ff721356c61094648fad3d` |
| 149 | 0163 | `mariadb-priced-order-acceptance-lock.sql` | `22e86a4185efa41bca8fe78a2c82a58b3d6e48bba466b94071ed0b50a49859b6` |

The deployment gateway verifies package identity and the existing staging readiness checks. A deployment runs zero migrations. With the switch missing or any value other than exact `on`, healthy core and owner schemas can serve the release before or after this separate apply, with legacy customer prices. With `on`, pricing requires all 69 exact metadata checks on the real app connection. An incomplete or unverified schema makes `/health` return 503 and rejects pricing-dependent requests. The maintenance account and the runtime account must each have the metadata visibility required for their checks. Existing orders continue to use saved prices throughout.

## Local evidence and open checks

- Typecheck, lint and the focused tests passed. The first complete local suite found one responsive-media contract failure. The QR images now use a bounded frame and preserve the full poster. The final full rerun passed across all eight local shards, with 5,891 passed, 40 skipped and zero failures.
- The historical native gate passed, including the new Admin Orders test and hosted-security provisioning. The first local run on both this branch and unchanged `main` used a redirected macOS temporary path. Using `/private/tmp` satisfied the existing path check. The Linux GitHub gate remains required.
- The earlier synthetic pricing run verified the 69 pricing requirements. The populated 10.11.20 staging rehearsal then verified all three phases together.

## Local and staging release match

After each fix is accepted for staging, use the merged Git commit as the source of truth. Confirm that the successful main run packaged that commit and that the staging gateway receipt and authenticated `/health` report the same release ID. Bring the canonical local checkout at `/Users/bikash/Desktop/HastaBazaar Project` to that commit while preserving unrelated work. Verify its Git commit, use `npm run local:check`, then verify the checked preview at `http://localhost:3018` through its normal launcher. Record the commit and staging release ID together before calling the fix in sync. Keep the local preview's isolated database, mail capture and simulated payments.

Current baseline on 26 November 2026. Authenticated staging health returned HTTP 200, `marketplaceReady: true`, and `hastabazaar-release-ci-45752904401-2`, matching the installed manifest and GitHub commit `7922dcef7d88175652efdbf3a4b6c5f97814909c`. The canonical Desktop checkout matches that commit and is clean on `codex/staging-preview-45752904401-2`. All 84 tracked changes and 186 untracked files from `admin-redesign` were verified in a private byte-for-byte archive and retained in a Git stash at `refs/hastabazaar/local-edits/before-staging-45752904401-2`. The preview preflight stopped on a Git configuration variable injected by the command environment. Preview verification needs the normal Mac Terminal. The pricing changes are in the separate delivery worktree. [Staging deployment](https://github.com/BikashCoder31/hastabazaar/actions/runs/45752904401/job/139694522522)

## Rehearsal results

The disposable MariaDB 10.11.20 restore matched staging's `utf8mb4 / utf8mb4_unicode_ci` database default, SQL mode and case handling. The import preserved trigger comments and retargeted the dump's 340 database-default directives to the disposable schema. Archive bytes and row data were unchanged.

| Check | Result |
| --- | --- |
| Baseline metadata | Core and 0164–0172 passed. Pricing matched 12 of 69 checks before the six files were applied. |
| Guarded pricing phase | All six steps completed. The runner took 5.746 seconds on the disposable copy, excluding restore, separate reports and data reconciliation. |
| Full read-only report after apply | 5,267 core, 156 owner and 69 pricing requirements matched. Zero missing, different or unverified findings. |
| Retained data and money | All 375 original table counts and original-column digests matched across 1,705 retained rows. All 190 exact money totals matched. The 11 new tables were empty. |
| Real app database binding with pricing On | The binding passed the exact pricing gate inside the isolated container. Both published products were visible and lacked a qualifying offer. |
| Cleanup | The disposable container, downloaded archive, temporary files and credentials were removed. The private non-secret result and fingerprints were retained locally. |

## For the owner

### Verified staging backup used for rehearsal

On 26 November 2026, a fresh read-only backup of `hastabaz_staging` was taken through the local socket while the staging app stayed running. The host verified gzip round-trip and SHA-256. The archive and its receipt are private, with mode `0600`. The observed default was `utf8mb4 / utf8mb4_unicode_ci` on `10.11.20-MariaDB-log`, with `lower_case_table_names=0` and SQL mode `STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`.

- Verified archive `/home2/hastabaz/hb-staging-pricing-backup-HVHapa/hastabaz-staging.sql.gz`
- SHA-256 `db368d4f7e1238ab7cc8c75abaf7d4fe91921e13fd8847e393baabd503866ba2`

The archive was downloaded through authenticated cPanel File Manager, verified against the host SHA-256 on the Mac, and removed from the Mac after the rehearsal. The verified archive remains on staging.

The locally generated rehearsal manifest is `c40ee7893df1851c8264d39b9edc4ec4e5b465fd0f5f7814562221b10632bd20`. All 149 source assets, including the six pricing companions, verified against it. A merged GitHub package will have its own manifest and release ID.

### Fresh backup procedure for the next checkpoint

In **cPanel → Terminal**, use the same private staging-only backup procedure that produced the previously verified archive. Take a fresh consistent `mariadb-dump` of `hastabaz_staging` over the local socket with routines and triggers, save it outside the web and app folders with owner-only access, and verify both the compressed data and SHA-256. The procedure makes a read-only database snapshot. The staging app stays running for this rehearsal backup.

If reusing the reviewed owner-only **staging** MariaDB client file, replace just the path on the third line. The output shows the actual database default, a private archive path and its SHA-256.

```bash
(
  set -euo pipefail
  hb_staging_cnf='/ABSOLUTE/PATH/TO/STAGING-ONLY.cnf'
  test -f "$hb_staging_cnf" && test ! -L "$hb_staging_cnf"
  test "$(stat -c '%a:%u' "$hb_staging_cnf")" = "600:$(id -u)"
  umask 077
  mariadb --defaults-file="$hb_staging_cnf" --protocol=SOCKET --batch --skip-column-names \
    --database=hastabaz_staging -e 'SELECT DATABASE(), VERSION(), @@character_set_database, @@collation_database'
  hb_backup_dir=$(mktemp -d /home2/hastabaz/hb-staging-pricing-backup-XXXXXX)
  hb_backup="$hb_backup_dir/hastabaz-staging.sql.gz"
  mariadb-dump --defaults-file="$hb_staging_cnf" --protocol=SOCKET \
    --single-transaction --quick --skip-lock-tables --hex-blob --order-by-primary \
    --skip-comments --skip-dump-date --routines --triggers hastabaz_staging | gzip -c > "$hb_backup"
  test -s "$hb_backup"
  gzip -t "$hb_backup"
  printf 'Verified backup %s\n' "$hb_backup"
  sha256sum "$hb_backup"
)
```

Expected result is a new private archive path and a 64-character SHA-256 after `gzip -t` succeeds. If the target is different, the dump fails or verification fails, stop and keep the existing staging app running. Share the verified path and SHA-256 privately through this chat, then make the archive available through an owner-only transfer. Keep the dump contents and credentials out of chat. [Native backup procedure](native-recovery.md)

### Hosted staging order after the pull request

1. After Verify and Package passes, merge the PR. Record the main-run release ID and independently verify the archive, manifest and the six file hashes.
2. Let the staging gateway deploy the verified main-run package with the pricing setting absent. Expect HTTP 200, `marketplaceReady: true`, the same release ID in its receipt and health, and zero gateway migrations. Confirm pricing remains Off.
3. At the staging maintenance window, pause the staging app and other database writers. Take a fresh verified staging backup after the pause. Review its fingerprint, the real database default and the six per-file after fingerprints against the matched rehearsal. Stop if anything differs.
4. From **cPanel → Terminal**, use the guarded runner from the candidate's reviewed Git commit with `--target=staging --phase=pricing`, the verified package root and exact `--manifest-sha256`, owner-only socket credentials, the matching backup receipt and approval, and a new private journal. Require six finished entries and a completed pricing journal. Run the full read-only report with the same package and manifest hash, omitting `--phase`, and require zero missing, different or unverified findings across core, owner and pricing. Reconcile retained rows and exact money totals before proceeding.
5. Use the verified staging gateway bundle that accepts the new binding. In **cPanel → Setup Node.js App** and protected gateway `runtime.json`, set `HASTABAZAAR_VARIANT_PRICING=on` yourself only after the full report and data checks pass. Keep both values identical. Start the staging app while access is restricted. Require HTTP 200, `marketplaceReady: true` and the same verified release ID. Keep access restricted if a worker has mixed settings or readiness fails.
6. On staging, check returnable items at NPR 399 → NPR 439 and NPR 400 → NPR 480, plus a non-returnable item with 5% rounded per unit. Place one fictional COD order and one bank-transfer QA order, inspect the saved adjusted unit price on each invoice, and verify both QR images display on the payable bank-transfer order without sending funds. Confirm Seller Studio shows the seller price and that the addition stays out of the seller's earnings and payout. Verify the 12% seller commission is based on the seller price under the existing coupon rules. Test one refund and a cart price change that asks the buyer to review. Confirm the marketplace fee remains Off.

For the private operator folder, preserve these source paths from the same reviewed commit as the package. Verify each file's hash before the guided apply.

- `scripts/deployment/mariadb-schema-upgrade.mjs`
- `scripts/deployment/mariadb-upgrade-checkpoints.mjs`
- `scripts/generate-production-schema-check.mjs`
- `lib/operations/fee-schema-readiness.mjs`
- `lib/operations/pricing-schema-readiness.mjs`

### Staging QR assets

The approved merchant images are private host assets. When ready for the bank-transfer QA check, verify the saved receiving account and place both images under the staging private media root at `private/company-bank-qr/<verified-account-version-id>/` as `fonepay.png` and `nepalpay.png`, with the corresponding `.metadata.json` sidecars and PNG content type. Expected image digests are `fff6f94ab6c871abc9d3430de6cf6f149a98534e277b9a8daba1c707ecde9f1a` for Fonepay and `6519164b90735a08eaec1f8326ed71eb329dd8faab30ca62ba88bd1a970cc930` for Nabil NEPALPAY. Wait for the supervised asset step before copying files. Both settle into the same company account, as confirmed by the owner. Verify the displayed merchant names and leave the QA order unpaid.

### Product enrolment

The rehearsal found **0 eligible and 2 legacy published products**.

- `FICTIONAL QA SELLER SAMPLE - NOT FOR SALE`
- `SIMULATED QA NOT FOR SALE product`

An already-published listing is eligible when its current published variant has a matching approved price offer. A legacy listing without a matching offer keeps its current customer price. For each legacy listing selected for enrolment, have the seller submit the current variant and intended seller price through Seller Studio, then review and publish the approved offer through Catalog. Verify the storefront price after publication. Existing orders retain their original prices.
