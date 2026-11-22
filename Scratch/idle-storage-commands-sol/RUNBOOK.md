# Storage maintenance commands for review

Run only after release testing and the walkthrough are complete, the preview and Ubuntu/Docker workloads are idle, and the user approves the final itemized list and the exact maintenance actions. Run each block separately and keep its output with the maintenance record. A failure stops the affected sequence. Check the current disk locations against Ubuntu registration and Docker Desktop settings before proceeding. Use the official maintenance record at D:TestingHastabazaar-Local-20261115-0611ZWSL-DOCKER-MAINTENANCE.md (SHA-256 3B072404E5CF59852674A69A269DD669A0AB4760274133C925BE84A8D91477DB).

## Measurement and backup setup

Use PowerShell. Record C: and D: free bytes before and after each maintenance action and calculate C: deltas. Record physical VHDX allocation using the same allocation measurement as inventory. File length below is for backup sizing and verification.

```powershell
$ErrorActionPreference = 'Stop'
$ubuntuDisk = 'C:UsersabinashAppDataLocalwsl{fb5c82ce-c439-4bbc-8c0a-722d1aec82c8}ext4.vhdx'
$dockerDisk = 'C:UsersabinashAppDataLocalDockerwsldiskdocker_data.vhdx'
function Measure-FreeSpace {
    param([string]$Stage)
    [pscustomobject]@{
        Stage = $Stage
        UTC = [DateTime]::UtcNow.ToString('o')
        CFreeBytes = [System.IO.DriveInfo]::new('C:').AvailableFreeSpace
        DFreeBytes = [System.IO.DriveInfo]::new('D:').AvailableFreeSpace
    }
}
Measure-FreeSpace 'Before backups'
$backupRoot = 'D:Testing'
if ((Resolve-Path -LiteralPath $backupRoot).Path -ne $backupRoot) { throw 'Backup root mismatch' }
$backupRootItem = Get-Item -LiteralPath $backupRoot -Force
if ($backupRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backup root is a reparse point' }
$sourceBytes = (Get-Item -LiteralPath $ubuntuDisk).Length + (Get-Item -LiteralPath $dockerDisk).Length
if ([System.IO.DriveInfo]::new('D:').AvailableFreeSpace -le $sourceBytes) { throw 'D: capacity must cover both backup files' }
$backupDir = Join-Path $backupRoot ('Hastabazaar-WSL-Docker-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
$ubuntuBackup = Join-Path $backupDir 'Ubuntu-ext4-export.vhdx'
$dockerBackup = Join-Path $backupDir 'Docker-docker_data.vhdx'
```

Verify Ubuntu is idle before stopping it, and verify it is listed as stopped before exporting. Record both successful reads of the exported file.

```powershell
Measure-FreeSpace 'Before Ubuntu stop and export'
wsl.exe --terminate Ubuntu
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu termination failed' }
wsl.exe --list --verbose
```

```powershell
wsl.exe --export Ubuntu $ubuntuBackup --vhd
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu export failed' }
$ubuntuBackupLength = (Get-Item -LiteralPath $ubuntuBackup).Length
if ($ubuntuBackupLength -le 0) { throw 'Ubuntu export is empty' }
$ubuntuHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ubuntuBackup).Hash
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $ubuntuBackup).Hash -ne $ubuntuHash) { throw 'Ubuntu backup reread mismatch' }
[pscustomobject]@{ Path = $ubuntuBackup; Bytes = $ubuntuBackupLength; SHA256 = $ubuntuHash }
Measure-FreeSpace 'After Ubuntu export verification'
```

Quit Docker Desktop from its tray menu after verifying idle. Check the Desktop engine has shut down and use DiskPart `detail vdisk` with the Docker selection below to confirm the disk is detached before the cold copy. Measure immediately before quitting and after backup verification.

```powershell
if (Test-Path -LiteralPath $dockerBackup) { throw 'Docker backup already exists' }
$dockerSourceLength = (Get-Item -LiteralPath $dockerDisk).Length
$dockerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dockerDisk).Hash
Copy-Item -LiteralPath $dockerDisk -Destination $dockerBackup
if ((Get-Item -LiteralPath $dockerBackup).Length -ne $dockerSourceLength) { throw 'Docker backup length mismatch' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $dockerBackup).Hash -ne $dockerHash) { throw 'Docker backup digest mismatch' }
[pscustomobject]@{ Path = $dockerBackup; Bytes = $dockerSourceLength; SHA256 = $dockerHash }
Measure-FreeSpace 'After Docker backup verification'
```

## Separately approved Ubuntu directory deletions

After both backups verify, start Ubuntu normally. Before each deletion, recheck the approved run receipt, references, retained evidence and activity. Verify no nested mounts, confirm exact path and current bytes against the approved list, and record C: space before and after the folder. Paste one approved absolute path at a time into the literal assignment below, with a fresh shell block for each folder. This template has zero approved targets.

```sh
(
  set -eu
  approved=''
  case "$approved" in /var/tmp/hastabazaar-t35/*) ;; *) exit 1 ;; esac
  leaf=${approved#/var/tmp/hastabazaar-t35/}
  case "$leaf" in ''|.|..|*/*) exit 1 ;; esac
  [ -d "$approved" ]
  [ "$(realpath -e -- "$approved")" = "$approved" ]
  du --one-file-system --block-size=1 --summarize -- "$approved"
  printf 'Type the approved absolute path to confirm: '
  IFS= read -r confirmation
  [ "$confirmation" = "$approved" ]
  rm -r --one-file-system -- "$approved"
  [ ! -e "$approved" ] && [ ! -L "$approved" ]
)
```

## Ubuntu VHDX

Stop Ubuntu after verifying idle. Record C: free bytes and both VHDX allocations before compaction. In an elevated interactive DiskPart session, enter the first two lines and check the selected path, dynamically expanding type and detached state. Enter the last two lines only after those checks.

```text
select vdisk file="C:UsersabinashAppDataLocalwsl{fb5c82ce-c439-4bbc-8c0a-722d1aec82c8}ext4.vhdx"
detail vdisk
compact vdisk
exit
```

Capture DiskPart's result, C: free bytes and VHDX allocation immediately after. Open Ubuntu normally and verify the root filesystem, retained release files and approved deletion results. Record the restart verification.

## Docker builder cache and data VHDX

Start Desktop normally and verify the expected local engine/context. Record C: space before and after the prune. Save the inventory and usage output before and after by running the inventory commands in both windows, with the prune once between them.

```powershell
docker context show
docker info
docker ps -a --no-trunc
docker image ls --no-trunc
docker network ls --no-trunc
docker volume ls
docker system df -v
```

```powershell
docker builder prune --filter "until=168h"
```

Keep the Docker confirmation prompt. Verify retained objects through the inventory and report the reclaimed cache size. Reread the retained backup and require its digest to match the earlier verified value.

```powershell
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $dockerBackup).Hash -ne $dockerHash) { throw 'Retained Docker backup digest mismatch' }
```

Fully quit Docker Desktop again and verify the engine shut down. Record C: free bytes and VHDX allocation before compaction. In elevated interactive DiskPart, enter the first two lines and verify the path, dynamically expanding type and detached state. Enter the remaining lines only after those checks.

```text
select vdisk file="C:UsersabinashAppDataLocalDockerwsldiskdocker_data.vhdx"
detail vdisk
compact vdisk
exit
```

Capture DiskPart’s result, C: free bytes and physical VHDX allocation immediately after. Restart Docker Desktop normally and verify access and retained inventory with the same commands. Report UTC timestamps, C: deltas, VHDX allocations, Docker’s cache result and both backup paths, sizes and verified digests.

[Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) · [Microsoft WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space) · [Microsoft DiskPart compaction](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact-vdisk) · [Docker Desktop backup](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/) · [Docker disk usage](https://docs.docker.com/reference/cli/docker/system/df/) · [Docker builder prune](https://docs.docker.com/reference/cli/docker/builder/prune/)
