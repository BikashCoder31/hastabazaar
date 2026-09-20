param(
    [string]$WorkspaceRoot = (Split-Path $PSScriptRoot -Parent),
    [int]$MinProduct = 0,
    [int]$MaxProduct = 999999
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$productRoot = Join-Path $WorkspaceRoot 'products\product'
$sheetRoot = Join-Path $productRoot 'review-sheets'
New-Item -ItemType Directory -Force -Path $sheetRoot | Out-Null

$dirs = @(Get-ChildItem -LiteralPath $productRoot -Directory | Where-Object { $_.Name -Match '^\d+$' -and [int]$_.Name -ge $MinProduct -and [int]$_.Name -le $MaxProduct } | Sort-Object { [int]$_.Name })
$cellWidth = 220
$cellHeight = 205
$labelWidth = 250
$rowHeight = 235
$batchSize = 8
$font = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Bold)
$smallFont = New-Object System.Drawing.Font('Arial', 8)
$textBrush = [System.Drawing.Brushes]::Black
$excludedBrush = [System.Drawing.Brushes]::DarkRed
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::LightGray, 1)

for ($offset = 0; $offset -lt $dirs.Count; $offset += $batchSize) {
    $batch = @($dirs[$offset..([Math]::Min($offset + $batchSize - 1, $dirs.Count - 1))])
    $width = $labelWidth + ($cellWidth * 4)
    $height = $rowHeight * $batch.Count
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    for ($r = 0; $r -lt $batch.Count; $r++) {
        $dir = $batch[$r]
        $data = Get-Content -Raw -LiteralPath (Join-Path $dir.FullName 'product-data.json') | ConvertFrom-Json
        $y = $r * $rowHeight
        $status = if ($data.preparationStatus -eq 'ready-for-user-review') { 'READY — 4 images' } else { "EXCLUDED — $($data.images.selectedCount) retained" }
        $brush = if ($data.preparationStatus -eq 'ready-for-user-review') { $textBrush } else { $excludedBrush }
        $graphics.DrawString("P$($data.productNumber)  $status", $font, $brush, 5, $y + 5)
        $label = "$($data.listing.storefrontTitle)`nVariant: $($data.listing.specifications.colourAndVariant)"
        $labelRect = [System.Drawing.RectangleF]::new(5, $y + 32, $labelWidth - 10, $rowHeight - 37)
        $graphics.DrawString($label, $smallFont, $brush, $labelRect)
        $files = @(Get-ChildItem -LiteralPath (Join-Path $dir.FullName 'images') -Filter '*.jpg' | Sort-Object Name)
        for ($i = 0; $i -lt [Math]::Min($files.Count, 4); $i++) {
            $x = $labelWidth + ($i * $cellWidth)
            $graphics.DrawRectangle($borderPen, $x, $y, $cellWidth - 4, $cellHeight)
            $image = [System.Drawing.Image]::FromFile($files[$i].FullName)
            try {
                $scale = [Math]::Min(($cellWidth - 12) / $image.Width, ($cellHeight - 24) / $image.Height)
                $drawWidth = [int]($image.Width * $scale)
                $drawHeight = [int]($image.Height * $scale)
                $drawX = $x + [int](($cellWidth - $drawWidth) / 2)
                $drawY = $y + 18 + [int](($cellHeight - 24 - $drawHeight) / 2)
                $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
                $graphics.DrawString(($i + 1).ToString(), $font, $textBrush, $x + 5, $y + 1)
            }
            finally {
                $image.Dispose()
            }
        }
    }

    $first = [int]$batch[0].Name
    $last = [int]$batch[-1].Name
    $path = Join-Path $sheetRoot ("selection-$first-$last.jpg")
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $graphics.Dispose()
    $bitmap.Dispose()
}

$font.Dispose()
$smallFont.Dispose()
$borderPen.Dispose()
Write-Output "Created final selection sheets in $sheetRoot"
