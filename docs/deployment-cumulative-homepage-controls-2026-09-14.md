# Cumulative homepage controls deployment checkpoint — 14 September 2026

Status: deployment authorized; cumulative candidate prepared and verified locally; production installation not started because the signed-in cPanel browser-control helper failed to initialize.

## Candidate

- Package: `outputs/hastabazaar-cumulative-homepage-controls-2026-09-14.zip`
- SHA-256: `07646e7c2e818c0136c21358111ca1afb0fe5534271ee016b9cc63ffb86cf584`
- Size: 24,763,828 bytes
- Verified archive entries: 3,437
- Startup file: `app.cjs`
- Ordered release inventory: 93 tables, 38 triggers and 22 migrations
- Pending additive production migration: `deployment/babal/mariadb-homepage-product-controls.sql`

The archive contains the fresh standalone Babal build and only the migrations declared by `deployment/babal/release-manifest.json`. It excludes `.env` files, uploads, private media, Git data and `mariadb-reset-empty-import.sql`. Existing release ZIPs remain unchanged.

## Included work

- Complete seller registry visibility for Super Admin.
- Customer checkout estimate-only presentation while protected operational views retain calculation details.
- Product `Add to cart` and `Buy now` controls.
- Database-driven Offers, Latest Products and Top Products homepage plus revised footer.
- Audited Super Admin hide/show control for individual homepage products without deleting or unpublishing them.

## Fresh local verification

- 241/241 automated tests passed with no failures, skips or cancellations.
- Non-incremental TypeScript passed.
- Application-scoped lint passed. Repository-wide lint still reports 11 pre-existing issues confined to the legacy Babal preflight and older section-one/two verifier scripts; these files are not part of the application change.
- Fresh isolated `build:babal` passed and generated `dist/standalone`.
- The release ZIP was reopened and all 3,437 entries matched the adjacent per-file SHA-256 manifest.
- Fresh synthetic MariaDB/Playwright acceptance passed at 1440 × 1000 and 390 × 844 with provider traffic blocked. It verified homepage data, slider behavior and the Super Admin hide/published-in-shop/restore sequence.
- The isolated application and MariaDB processes were stopped; loopback ports 43876 and 13316 were released.

## Production hold

The cPanel control attempt failed before a browser window could be selected because the Windows browser-control helper exited during initialization and again after its one allowed reset/retry. Therefore no cPanel backup, upload, application stop, production migration, extraction or restart occurred in this deployment attempt. Production remains on the previously deployed release.

When browser control is available again, continue with: create and verify a fresh full-account backup; inspect the live migration boundary; stop the Node application; apply only the missing additive homepage-controls migration; upload and server-round-trip verify the exact ZIP hash above; extract into `/home2/hastabaz/hastabazaar-app`; start Node.js 22.23.2 with `app.cjs`; verify `/health`, anonymous responsive pages and authenticated Super Admin controls. Never run the base/reset schema over existing data.
