param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseId
)

$ErrorActionPreference = 'Stop'

if ($ReleaseId -notmatch '^hastabazaar-release-[a-z0-9._-]+$') {
  throw 'ReleaseId must be a versioned Hastabazaar release identifier.'
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$standalone = Join-Path $workspace 'dist\standalone'
$outputs = Join-Path $workspace 'outputs'
$archive = Join-Path $outputs "$ReleaseId.zip"
$fileManifestPath = Join-Path $outputs "$ReleaseId.manifest.json"
$verificationPath = Join-Path $outputs "$ReleaseId.verification.json"
$shaPath = Join-Path $outputs "$ReleaseId.sha256"
$verificationRoot = Join-Path $outputs "$ReleaseId-archive-verification"

foreach ($target in @($archive, $fileManifestPath, $verificationPath, $shaPath, $verificationRoot)) {
  if (Test-Path -LiteralPath $target) {
    throw "Refusing to overwrite existing release artifact: $target"
  }
}

$releaseManifestSource = Join-Path $standalone 'deployment\babal\release-manifest.json'
$releaseManifest = Get-Content -Raw -LiteralPath $releaseManifestSource | ConvertFrom-Json
if ($releaseManifest.release -ne $ReleaseId) {
  throw "Release manifest identifies '$($releaseManifest.release)', not '$ReleaseId'."
}

function Get-ReleaseFiles([string]$Root) {
  # Share the Linux packager's SQL digest, path, symlink and inventory guards.
  # Only the built bundle is read; repository SQL cannot overwrite its selection.
  $inventory = & node (Join-Path $PSScriptRoot 'release-schema-assets.mjs') verify $Root $ReleaseId
  if ($LASTEXITCODE -ne 0) { throw 'Release schema and inventory verification failed.' }
  # Windows PowerShell 5.1 otherwise emits the JSON array as one nested item.
  foreach ($file in ($inventory | ConvertFrom-Json)) { $file }
}

$files = @(Get-ReleaseFiles $standalone)
$paths = @($files.path)
if ($paths -notcontains 'hosted-security.mjs') {
  throw 'Release is missing the bundled hosted-security operator. Rebuild the approved application before packaging.'
}
$forbidden = @(
  $paths | Where-Object {
    $_ -match '(^|/)\.env($|\.)' -or
    $_ -eq 'deployment/babal/mariadb-reset-empty-import.sql' -or
    $_ -match '(^|/)db/seeds/'
  }
)
if ($forbidden.Count -gt 0) {
  throw "Forbidden release files detected: $($forbidden -join ', ')"
}

$fileManifest = [ordered]@{
  release = $ReleaseId
  generatedAt = [DateTimeOffset]::Now.ToString('o')
  fileCount = $files.Count
  totalBytes = ($files | Measure-Object -Property bytes -Sum).Sum
  files = $files
}
$fileManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $fileManifestPath -Encoding utf8

Compress-Archive -Path (Join-Path $standalone '*') -DestinationPath $archive -CompressionLevel Optimal
New-Item -ItemType Directory -Path $verificationRoot | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $verificationRoot

$archiveFiles = @(Get-ReleaseFiles $verificationRoot)
$sourceByPath = @{}
foreach ($file in $files) { $sourceByPath[$file.path] = $file }
$archiveByPath = @{}
foreach ($file in $archiveFiles) { $archiveByPath[$file.path] = $file }
$mismatches = @()
foreach ($path in ($sourceByPath.Keys + $archiveByPath.Keys | Sort-Object -Unique)) {
  $source = $sourceByPath[$path]
  $packed = $archiveByPath[$path]
  if ($null -eq $source -or $null -eq $packed -or $source.sha256 -ne $packed.sha256 -or $source.bytes -ne $packed.bytes) {
    $mismatches += $path
  }
}

$legalPolicies = Get-Content -Raw -LiteralPath (Join-Path $workspace 'lib\content\legal-policies.ts')
$customerVersion = [regex]::Match($legalPolicies, 'customer-policy-set-[0-9-]+').Value
$sellerVersion = [regex]::Match($legalPolicies, 'seller-agreement:sha256:[a-f0-9]{64}').Value
$required = @(
  'app.cjs',
  'server.js',
  'package.json',
  'deployment/babal/release-manifest.json',
  'dist/client/vinext-client-entry-manifest.json'
)
$missingRequired = @($required | Where-Object { -not $archiveByPath.ContainsKey($_) })
$archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()

$verification = [ordered]@{
  release = $ReleaseId
  verifiedAt = [DateTimeOffset]::Now.ToString('o')
  zipBytes = (Get-Item -LiteralPath $archive).Length
  zipSha256 = $archiveHash
  sourceFileCount = $files.Count
  archiveFileCount = $archiveFiles.Count
  mismatchCount = $mismatches.Count
  mismatches = $mismatches
  missingRequired = $missingRequired
  resetSchemaIncluded = $archiveByPath.ContainsKey('deployment/babal/mariadb-reset-empty-import.sql')
  developmentSeedIncluded = @($archiveByPath.Keys | Where-Object { $_ -match '(^|/)db/seeds/' }).Count -gt 0
  policyVersions = @($customerVersion, $sellerVersion)
}
$verification | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $verificationPath -Encoding utf8
"$archiveHash  $ReleaseId.zip" | Set-Content -LiteralPath $shaPath -Encoding ascii

if ($mismatches.Count -gt 0 -or $missingRequired.Count -gt 0) {
  throw 'Release archive verification failed.'
}

$verification | ConvertTo-Json -Depth 5
