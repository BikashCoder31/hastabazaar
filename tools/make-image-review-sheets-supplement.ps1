param(
    [string]$SourceFile = (Join-Path $PSScriptRoot 'batch-63-83-source.json'),
    [string]$WorkspaceRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$records = Get-Content -Raw -LiteralPath $SourceFile | ConvertFrom-Json
$reviewRoot = Join-Path $WorkspaceRoot 'products\product\.image-review'
$sheetRoot = Join-Path $reviewRoot '_sheets'
New-Item -ItemType Directory -Force -Path $sheetRoot | Out-Null

$cellWidth = 190
$cellHeight = 200
$labelWidth = 160
$rowHeight = 225
$startIndex = 5
$maxImages = 7
$batchSize = 8
$font = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Bold)
$smallFont = New-Object System.Drawing.Font('Arial', 8)
$textBrush = [System.Drawing.Brushes]::Black
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::LightGray, 1)

for ($offset = 0; $offset -lt $records.Count; $offset += $batchSize) {
    $batch = @($records[$offset..([Math]::Min($offset + $batchSize - 1, $records.Count - 1))])
    $width = $labelWidth + ($cellWidth * $maxImages)
    $height = $rowHeight * $batch.Count
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    for ($r = 0; $r -lt $batch.Count; $r++) {
        $record = $batch[$r]
        $y = $r * $rowHeight
        $graphics.DrawString("P$($record.number)`n$($record.colourVariant)", $smallFont, $textBrush, 5, $y + 8)
        $productDir = Join-Path $reviewRoot ([string]$record.number)
        $files = @(Get-ChildItem -LiteralPath $productDir -Filter 'candidate-*.jpg' | Sort-Object Name)
        $extras = @($files | Select-Object -Skip $startIndex -First $maxImages)
        for ($i = 0; $i -lt $extras.Count; $i++) {
            $x = $labelWidth + ($i * $cellWidth)
            $graphics.DrawRectangle($borderPen, $x, $y, $cellWidth - 4, $cellHeight)
            $image = [System.Drawing.Image]::FromFile($extras[$i].FullName)
            try {
                $scale = [Math]::Min(($cellWidth - 12) / $image.Width, ($cellHeight - 24) / $image.Height)
                $drawWidth = [int]($image.Width * $scale)
                $drawHeight = [int]($image.Height * $scale)
                $drawX = $x + [int](($cellWidth - $drawWidth) / 2)
                $drawY = $y + 18 + [int](($cellHeight - 24 - $drawHeight) / 2)
                $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
                $graphics.DrawString(($startIndex + $i + 1).ToString(), $font, $textBrush, $x + 5, $y + 1)
            }
            finally { $image.Dispose() }
        }
    }

    $first = $batch[0].number
    $last = $batch[-1].number
    $path = Join-Path $sheetRoot ("review-extra-$first-$last.jpg")
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $graphics.Dispose()
    $bitmap.Dispose()
}

$font.Dispose()
$smallFont.Dispose()
$borderPen.Dispose()
Write-Output "Created supplementary review sheets in $sheetRoot"
