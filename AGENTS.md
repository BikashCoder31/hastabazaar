# Active local project

The authoritative local Hastabazaar checkout is `C:/Users/abinash/Desktop/HastaBazaar`.
Use this directory for local development and preview. Old worktrees, dated copies, and paths recorded in historical reports are not active launch targets.

Use `npm run dev` or `START-HASTABAZAAR.cmd` to start the checked local preview at `http://localhost:3018`. Use `npm run local:check` for its read-only preflight. Do not bypass the launcher with a direct `vinext`, Vite, or Wrangler command to get around a failed check.

The machine-local Git settings are `hastabazaar.localProjectRoot` and `hastabazaar.localBaseline`. The approved baseline is `d9056dc10fee13dc11d15f24a14f63b003befe0b`. The launcher checks the resolved script directory, working directory, Git root, and configured canonical directory, then requires that baseline to be an ancestor of HEAD. A branch name alone is not proof that a checkout is current. Preserve these settings; do not repoint them to a stale worktree or lower the baseline to pass a check.

Keep the runtime in `local_staging` with `NODE_ENV=development`, mail capture, simulated payments, and the recipient domain `local.hastabazaar.test`. Production/deployment settings, remote credentials, and conflicting runtime settings must stop the local launch.

The existing `.staging` marker and exactly one local D1 database must pass the read-only forms and sign-in readiness check. Missing or incomplete data is a stop condition. Never automatically seed, migrate, restore a backup, create an empty database, or reset local data to make startup succeed. Existing mutation guards remain in force and are not permission to run their scripts in this checkout.

Recovery ZIPs in the sibling `C:/Users/abinash/Desktop/Hatskala-backups` folder are archives, not active projects. Do not extract or launch one during ordinary development. A recovery operation requires a concrete review of the intended source and destination first.

See `LOCAL-START.md` for the user's launch instructions.

The user-approved move to this folder was completed on 2026-10-16. The former Desktop/Hatskala folder is retired and must not be launched. Its retained archives and reports are historical only.
