param(
    [string]$SourceFile = (Join-Path $PSScriptRoot 'new-batch-source.json'),
    [string]$SelectionFile = (Join-Path $PSScriptRoot 'new-batch-image-selection.json'),
    [string]$WorkspaceRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$BatchRange = '24-62',
    [string]$ReviewTitle = 'Hathkriti Amazon Preparation Batch — Products 24–62',
    [string]$ReviewFileName = 'batch-review.md',
    [string]$SummaryFileName = 'batch-summary.json'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$records = Get-Content -Raw -LiteralPath $SourceFile | ConvertFrom-Json
$selections = Get-Content -Raw -LiteralPath $SelectionFile | ConvertFrom-Json -AsHashtable
$reviewRoot = Join-Path $WorkspaceRoot 'products\product\.image-review'
$productRoot = Join-Path $WorkspaceRoot 'products\product'
New-Item -ItemType Directory -Force -Path $productRoot | Out-Null
$reviewLines = @(
    "# $ReviewTitle",
    '',
    'Local extraction and preparation only. No Hastabazaar dashboard actions were taken.',
    '',
    '> **Publication risk:** Permanent legal and policy documents remain pending. Do not enable genuine public orders until those controls are completed and approved.',
    ''
)

function Value-OrNotStated([object]$Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return 'Not stated on the source page.' }
    return [string]$Value
}

function Lower-First([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
    if ($Value.Length -eq 1) { return $Value.ToLowerInvariant() }
    return $Value.Substring(0, 1).ToLowerInvariant() + $Value.Substring(1)
}

foreach ($record in $records) {
    $n = [int]$record.number
    $selection = $selections[[string]$n]
    if ($null -eq $selection) { throw "Missing image selection for Product $n" }

    $isExcluded = @($selection.selected).Count -ne 4
    $status = if ($isExcluded) { 'excluded-from-active-batch' } else { 'ready-for-user-review' }
    $excludedReason = if ($isExcluded) { [string]$selection.excludedReason } else { $null }
    $indices = if ($isExcluded) { @($selection.retained) } else { @($selection.selected) }

    $sellingPrice = [int][Math]::Round(([double]$record.priceInr * 1.6) + 200, 0, [MidpointRounding]::AwayFromZero)
    $originalPrice = $sellingPrice * 2
    $featureList = @($record.features)
    $sourceConcerns = @($record.sourceConcerns | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    $descriptionParts = @()
    if ($featureList.Count -gt 0) { $descriptionParts += "$($record.storefrontTitle) features $(Lower-First $featureList[0])." }
    if ($featureList.Count -gt 1) { $descriptionParts += "It combines $(Lower-First $featureList[1]) with $(Lower-First $featureList[2])." }
    if ($featureList.Count -gt 3) { $descriptionParts += "$($featureList[3])." }
    $description = ($descriptionParts -join ' ') -replace '\.\.', '.'

    $productDir = Join-Path $productRoot ([string]$n)
    $imagesDir = Join-Path $productDir 'images'
    New-Item -ItemType Directory -Force -Path $imagesDir | Out-Null
    Get-ChildItem -LiteralPath $imagesDir -Filter ("hathkriti-p{0}-*.jpg" -f $n) -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }

    $manifestImages = @()
    $outputImages = @()
    $order = 0
    foreach ($candidateIndex in $indices) {
        $order++
        $candidatePath = Join-Path (Join-Path $reviewRoot ([string]$n)) ('candidate-{0:D2}.jpg' -f [int]$candidateIndex)
        if (-not (Test-Path -LiteralPath $candidatePath)) { throw "Missing candidate $candidateIndex for Product $n" }
        $filename = 'hathkriti-p{0}-{1}-{2:D2}.jpg' -f $n, $record.asin.ToLowerInvariant(), $order
        $destination = Join-Path $imagesDir $filename
        Copy-Item -LiteralPath $candidatePath -Destination $destination -Force
        $file = Get-Item -LiteralPath $destination
        $image = [System.Drawing.Image]::FromFile($destination)
        try {
            $width = $image.Width
            $height = $image.Height
        }
        finally {
            $image.Dispose()
        }
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
        $sourceImage = [string]$record.imageUrls[[int]$candidateIndex - 1]
        $manifestImages += [ordered]@{
            sourcePage = [string]$record.canonicalUrl
            originalImageReference = $sourceImage
            filename = $filename
            dimensions = [ordered]@{ width = $width; height = $height }
            byteSize = [long]$file.Length
            sha256 = $hash
            selectedOrder = $order
            originalGalleryIndex = [int]$candidateIndex
        }
        $outputImages += "images/$filename"
    }

    $returnText = if ([bool]$record.returnable) {
        'Marketplace return eligibility and the current Hastabazaar return policy apply.'
    } else {
        $null
    }
    $safety = Value-OrNotStated $record.safetyInformation
    $care = Value-OrNotStated $record.careInstructions
    $origin = Value-OrNotStated $record.countryOfOrigin
    $dimensions = Value-OrNotStated $record.dimensions
    $weight = Value-OrNotStated $record.weight
    $contents = Value-OrNotStated $record.packageContents
    $manufacturer = Value-OrNotStated $record.manufacturer

    $seoDescription = "$($record.storefrontTitle) from Hathkriti. $($featureList[0]). Colour/variant: $($record.colourVariant)."
    $productData = [ordered]@{
        productNumber = $n
        preparationStatus = $status
        exclusionReason = $excludedReason
        source = [ordered]@{
            suppliedUrl = [string]$record.sourceUrl
            canonicalUrl = [string]$record.canonicalUrl
            asin = [string]$record.asin
            sourceTitle = [string]$record.sourceTitle
            sourcePriceInr = [double]$record.priceInr
            sourceReturnable = [bool]$record.returnable
        }
        listing = [ordered]@{
            storefrontTitle = [string]$record.storefrontTitle
            brand = [string]$record.brand
            manufacturer = $manufacturer
            description = $description
            keyFeatures = $featureList
            specifications = [ordered]@{
                colourAndVariant = [string]$record.colourVariant
                dimensions = $dimensions
                weight = $weight
                modelOrIdentifier = [string]$record.modelIdentifier
                countryOfOrigin = $origin
            }
            materials = [string]$record.materials
            packageContents = $contents
            careInstructions = $care
            category = [string]$record.category
            tags = @($record.tags)
            giftOccasions = @($record.giftOccasions)
            safetyInformation = $safety
            seoTitle = "$($record.storefrontTitle) | Hathkriti"
            seoDescription = $seoDescription
        }
        pricing = [ordered]@{
            formula = 'round(Amazon INR price × 1.6 + 200)'
            sellingPriceNpr = $sellingPrice
            originalPriceNpr = $originalPrice
            displayedDiscountPercent = 50
        }
        defaults = [ordered]@{
            stock = 10
            preparationTimeDays = 3
            warranty = "Do not promise a warranty; select 'No' only if the Seller form requires a choice."
            returnConditions = $returnText
            sku = 'Let Hastabazaar generate automatically.'
            commercialListing = $true
        }
        images = [ordered]@{
            requiredCount = 4
            selectedCount = $manifestImages.Count
            files = $outputImages
            manifest = 'images/source-manifest.json'
        }
        sourceConcerns = $sourceConcerns
        legalRisk = 'Permanent legal and policy documents remain pending. Do not enable genuine public orders until those controls are completed and approved.'
    }

    $manifest = [ordered]@{
        productNumber = $n
        preparationStatus = $status
        exclusionReason = $excludedReason
        sourcePage = [string]$record.canonicalUrl
        selectedVariant = [string]$record.colourVariant
        requiredImageCount = 4
        includedImageCount = $manifestImages.Count
        images = $manifestImages
    }

    $detailsLines = @(
        "# Product $n — $($record.storefrontTitle)",
        '',
        "**Preparation status:** $status",
        "**Source:** $($record.canonicalUrl)",
        "**ASIN:** $($record.asin)",
        "**Selected colour/variant:** $($record.colourVariant)",
        ''
    )
    if ($excludedReason) {
        $detailsLines += @('## Exclusion', '', $excludedReason, '')
    }
    $detailsLines += @(
        '## Storefront record',
        '',
        "- **Title:** $($record.storefrontTitle)",
        "- **Brand:** $($record.brand)",
        "- **Manufacturer:** $manufacturer",
        "- **Description:** $description",
        "- **Materials:** $($record.materials)",
        "- **Colour/variant:** $($record.colourVariant)",
        "- **Dimensions:** $dimensions",
        "- **Weight:** $weight",
        "- **Package contents:** $contents",
        "- **Care:** $care",
        "- **Country of origin:** $origin",
        "- **Category:** $($record.category)",
        "- **Tags:** $(@($record.tags) -join ', ')",
        "- **Gift occasions:** $(@($record.giftOccasions) -join ', ')",
        "- **Model/identifier:** $($record.modelIdentifier)",
        "- **Safety:** $safety",
        '',
        '### Key features',
        ''
    )
    foreach ($feature in $featureList) { $detailsLines += "- $feature" }
    $detailsLines += @(
        '',
        '## Pricing and defaults',
        '',
        "- Amazon price: INR $($record.priceInr)",
        "- Selling price: NPR $sellingPrice",
        "- Original price: NPR $originalPrice",
        '- Displayed discount: 50%',
        '- Stock: 10',
        '- Preparation time: 3 days',
        "- Warranty: Do not promise a warranty; select **No** only if the form requires a choice.",
        "- Returns: $(if ($returnText) { $returnText } else { 'No return wording added because source returnability was not stated.' })",
        '- SKU: Let Hastabazaar generate automatically.',
        '',
        '## SEO',
        '',
        "- **SEO title:** $($record.storefrontTitle) | Hathkriti",
        "- **SEO description:** $seoDescription",
        '',
        '## Image selection',
        '',
        "Included $($manifestImages.Count) verified gallery image(s). See `images/source-manifest.json` for original references, dimensions, byte sizes and SHA-256 hashes.",
        ''
    )
    if ($sourceConcerns.Count -gt 0) {
        $detailsLines += @('## Source concerns', '')
        foreach ($concern in $sourceConcerns) { $detailsLines += "- $concern" }
        $detailsLines += ''
    }
    $detailsLines += @(
        '## Publication risk',
        '',
        'Permanent legal and policy documents remain pending. Do not enable genuine public orders until those controls are completed and approved.'
    )

    $productData | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $productDir 'product-data.json') -Encoding utf8
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $imagesDir 'source-manifest.json') -Encoding utf8
    $detailsLines -join "`r`n" | Set-Content -LiteralPath (Join-Path $productDir 'details.md') -Encoding utf8

    $reviewLines += @(
        "## Product $n — $($record.storefrontTitle)",
        '',
        "- **Status:** $status",
        "- **Variant:** $($record.colourVariant)",
        "- **Price:** NPR $sellingPrice (original NPR $originalPrice; 50% displayed discount)",
        "- **Source:** $($record.canonicalUrl)",
        "- **Record:** [details.md](./$n/details.md) · [product-data.json](./$n/product-data.json) · [source-manifest.json](./$n/images/source-manifest.json)"
    )
    if ($excludedReason) { $reviewLines += "- **Exclusion:** $excludedReason" }
    if ($outputImages.Count -gt 0) {
        $reviewLines += '- **Included images:**'
        foreach ($relativeImage in $outputImages) { $reviewLines += "  - [$relativeImage](./$n/$relativeImage)" }
    } else {
        $reviewLines += '- **Included images:** None; an exact acceptable image set could not be verified.'
    }
    $reviewLines += ''
}

$summary = [ordered]@{
    generatedAt = (Get-Date).ToString('o')
    sourceCount = $records.Count
    readyForUserReview = @($records | Where-Object { @($selections[[string]$_.number].selected).Count -eq 4 }).Count
    excludedFromActiveBatch = @($records | Where-Object { @($selections[[string]$_.number].selected).Count -ne 4 }).Count
    range = $BatchRange
    dashboardActionsTaken = $false
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $productRoot $SummaryFileName) -Encoding utf8
$reviewLines -join "`r`n" | Set-Content -LiteralPath (Join-Path $productRoot $ReviewFileName) -Encoding utf8
Write-Output "Built $($records.Count) product records under $productRoot"
