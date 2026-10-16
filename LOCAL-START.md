# Start Hastabazaar locally

The active project is **C:\Users\abinash\Desktop\Hatskala**.

1. Open that folder and double-click **START-HASTABAZAAR.cmd**.
2. Keep its terminal window open. It shows the project folder, branch, commit, local database, and website address before starting.
3. When the server is ready, open **http://localhost:3018**.
4. Press **Ctrl+C** in the terminal to stop it.

You can also open a terminal in this folder and run `npm run dev`. Both routes use the same checks. Node.js 22.13.0 or newer must be available in the terminal.

Run `npm run local:check` to check the folder, revision, settings, and existing local data without starting a server or changing data.

The launcher uses local staging with no live email or payment services. Its configuration requires mail capture and simulated payments; the startup check does not verify email or payment delivery. It always uses localhost on port 3018. If the port is already occupied, it stops instead of choosing another port.

## If launch stops

- **Wrong folder or older revision:** return to the Desktop folder above. The launcher checks its resolved location and requires the current commit to include the approved baseline `d9056dc10fee13dc11d15f24a14f63b003befe0b`.
- **Missing project configuration:** stop and have the local setup reviewed. The machine's Git settings `hastabazaar.localProjectRoot` and `hastabazaar.localBaseline` identify the approved project. Do not change these settings just to get another copy to start.
- **Missing or incomplete local data:** keep the error message and have the saved data reviewed. The launcher never creates an empty replacement database, seeds data, restores a backup, or applies migrations.
- **Commission or weekly loyalty storage is incomplete:** the launcher stops when the required tables, reward fields or validation guards are missing. Have the feature upgrade reviewed separately; do not bypass this check or replace the database.
- **Conflicting environment settings or remote credentials:** use a terminal without those settings, and review the named local environment file if one is reported. Error messages show setting names, never secret values.
- **Port 3018 already in use:** stop the known existing local preview in its terminal, then try again. Do not start another copy on a different port.

Older worktrees and dated copies are historical references. The ZIP files in **C:\Users\abinash\Desktop\Hatskala-backups** are recovery archives and cannot be launched normally. Keep using the active Desktop folder; restore an archive only as a separately reviewed recovery operation.
