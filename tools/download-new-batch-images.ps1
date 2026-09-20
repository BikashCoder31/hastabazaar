param(
    [string]$SourceFile = (Join-Path $PSScriptRoot 'new-batch-source.json'),
    [string]$WorkspaceRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'
$records = Get-Content -Raw -LiteralPath $SourceFile | ConvertFrom-Json
$reviewRoot = Join-Path $WorkspaceRoot 'products\product\.image-review'
New-Item -ItemType Directory -Force -Path $reviewRoot | Out-Null

foreach ($record in $records) {
    $productDir = Join-Path $reviewRoot ([string]$record.number)
    New-Item -ItemType Directory -Force -Path $productDir | Out-Null
    $index = 0
    foreach ($url in $record.imageUrls) {
        $index++
        $destination = Join-Path $productDir ('candidate-{0:D2}.jpg' -f $index)
        if (-not (Test-Path -LiteralPath $destination)) {
            & curl.exe -L --fail --silent --show-error --max-time 60 -A 'Mozilla/5.0' $url -o $destination
            if ($LASTEXITCODE -ne 0) {
                throw "Image download failed for Product $($record.number), candidate $index"
            }
        }
    }
}

Write-Output "Downloaded image candidates for $($records.Count) products to $reviewRoot"
