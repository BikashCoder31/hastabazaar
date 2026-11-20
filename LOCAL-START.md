# Start Hastabazaar locally

The active project on this Mac is `/Users/bikash/Desktop/HastaBazaar Project`.

If this checkout's checked preview is already running, reuse it at `http://localhost:3018`.

When the preview is stopped, use Terminal with Node.js 22.13.0 or newer to start it.

```sh
cd '/Users/bikash/Desktop/HastaBazaar Project'
npm run dev
```

Keep that Terminal window open. The launcher shows the project folder, branch, commit, local database, and website address before starting. When the server is ready, open `http://localhost:3018`. Press **Ctrl+C** in that Terminal to stop it.

Run `npm run local:check` from the same folder for the read-only check of the folder, revision, settings, and existing local data.

The launcher binds to localhost on port 3018 and uses `local_staging` with `NODE_ENV=development`, mail capture for `local.hastabazaar.test`, and simulated payments. It requires the existing `.staging` marker and exactly one local D1 database that passes the forms and sign-in checks.

## If launch stops

- **Wrong folder or older revision:** return to the Desktop folder above. The launcher checks its resolved location and requires the current commit to include the approved baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b`.
- **Missing project configuration:** stop and have the local setup reviewed. The machine's Git settings `hastabazaar.localProjectRoot` and `hastabazaar.localBaseline` identify the approved project. Do not change these settings just to get another copy to start.
- **Missing or incomplete local data:** keep the error message and have the saved data reviewed. The launcher never creates an empty replacement database, seeds data, restores a backup, or applies migrations.
- **Commission, weekly loyalty or marketplace fee waiver storage is incomplete:** the launcher stops when required tables, fields, control state or validation guards are missing. The additive local fee source is `drizzle/0073_marketplace_fee_waivers.sql`; have its exact destination, preservation backup and rollback limits reviewed separately before any upgrade. Do not bypass this check or replace the database. See `docs/marketplace-fee-waivers.md`.
- **Conflicting environment settings or remote credentials:** use a terminal without those settings, and review the named local environment file if one is reported. Error messages show setting names, never secret values.
- If another process occupies port 3018, resolve that conflict before starting the preview.

## Historical Windows setup

The 2026-10-16 move from `C:\Users\abinash\Desktop\Hatskala` to `C:\Users\abinash\Desktop\HastaBazaar` and the `START-HASTABAZAAR.cmd` launcher belong to the former Windows setup. The former Hatskala folder is retired.

Older worktrees, dated copies, and reports are historical references. ZIPs in `C:\Users\abinash\Desktop\Hatskala-backups` are recovery archives. Review the exact recovery source and destination before using one.
