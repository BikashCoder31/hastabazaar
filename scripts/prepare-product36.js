import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productDir = path.resolve(__dirname, '..', 'products', 'product36');
const imagesDir = path.join(productDir, 'images');
const sourcePage = 'https://amzn.in/d/0fepewAR';
const canonicalSourcePage = 'https://www.amazon.in/dp/B0H515J46W';
const asin = 'B0H515J46W';
const capturedPriceInr = 310;
const sellingPriceNpr = Math.round(capturedPriceInr * 1.6 + 150);
const originalPriceNpr = sellingPriceNpr * 2;
const sku = 'HB-ER-B0H515J46W-PINK';
const returnWording = 'Returns or exchanges are accepted within 10 days of delivery under the standard Hastabazaar return policy.';

const selectedImages = [
  'https://m.media-amazon.com/images/I/51wZD7Os5zL.jpg',
  'https://m.media-amazon.com/images/I/51xsm+2HyyL.jpg',
  'https://m.media-amazon.com/images/I/5198SZix1UL.jpg',
];

function imageDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (!length) break;
    offset += 2 + length;
  }
  return null;
}

async function downloadImages() {
  fs.mkdirSync(imagesDir, { recursive: true });
  for (const entry of fs.readdirSync(imagesDir)) {
    if (/^hb-er-b0h515j46w-pink-\d+\.(?:jpg|jpeg|png)$/i.test(entry)) {
      fs.unlinkSync(path.join(imagesDir, entry));
    }
  }
  const images = [];
  const duplicates = [];
  const seen = new Set();
  for (const source of selectedImages) {
    const response = await fetch(source, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Image download failed (${response.status}) for ${source}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error(`Rejected non-image content (${contentType}) from ${source}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (seen.has(sha256)) { duplicates.push({ source, sha256 }); continue; }
    seen.add(sha256);
    const sequence = images.length + 1;
    const localFilename = `hb-er-b0h515j46w-pink-${String(sequence).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(imagesDir, localFilename), buffer);
    images.push({
      sourcePage,
      canonicalSourcePage,
      originalImageReference: source,
      localFilename,
      dimensions: imageDimensions(buffer) || { width: null, height: null },
      byteSize: buffer.length,
      sha256,
    });
  }
  return { images, duplicates };
}

function makeRecord(images, duplicates) {
  const title = 'JANNAH JEWEL GOA Pink Crochet Cowrie Shell Earrings';
  const description = 'Handmade pink crochet earrings with a mandala-inspired circular form, cowrie-shell accents and alloy hooks. The artisan-style pair complements ethnic outfits, casual looks, beachwear and festive styling.';
  return {
    productNumber: 36,
    source: {
      suppliedUrl: sourcePage,
      canonicalUrl: canonicalSourcePage,
      asin,
      capturedPriceInr,
      amazonReturnEligibility: '10 days Returnable',
    },
    verifiedSourceFacts: {
      sourceTitle: 'JANNAH JEWEL GOA Crochet Cowrie Shell Mandala Earrings for Women — Handmade Pink Boho Thread Earrings',
      brand: 'JANNAH JEWEL GOA',
      manufacturer: 'JANNAH JEWEL GOA',
      modelOrIdentifier: 'JJG-WHITE-EARINGS (source identifier conflicts with the selected Pink variant)',
      materials: 'Woven thread, cowrie/kaudi shells and alloy metal hooks; no gemstone',
      colourAndVariant: 'Pink selected; other source options shown: Black, Blue, Green, Multicolor, Mustard, Red and White',
      dimensions: '6.1 × 5.08 × 0.25 cm; source also rounds this to 6.1 × 5.1 × 0.2 cm',
      weight: '50 g',
      packageContents: '1 set',
      careInstructions: 'Requires Seller input; no care instructions were stated on the source page.',
      countryOfOrigin: 'India',
      returnEligibility: '10 days Returnable',
      warranty: 'Not stated on source; leave blank.',
      safetyWarnings: 'Requires Seller input; none were stated on the source page.',
    },
    rewrittenMarketingCopy: {
      storefrontTitle: title,
      description,
      keyFeatures: [
        'Mandala-inspired crochet threadwork',
        'Decorative cowrie-shell accents',
        'Pink bohemian statement design',
        'Alloy metal hooks',
      ],
      seoTitle: `${title} | Hastabazaar`,
      seoDescription: `${title}. Handmade pink crochet mandala earrings with cowrie-shell accents for ethnic, beach, casual and festive styling.`,
    },
    suggestedValues: {
      category: 'Jewellery > Earrings',
      tags: ['earrings', 'handmade jewellery', 'crochet earrings', 'cowrie shell earrings', 'boho jewellery', 'pink earrings'],
      sku,
      pricing: {
        formula: 'round(310 × 1.6 + 150)',
        sellingPriceNpr,
        originalPriceNpr,
        discountPercent: 50,
      },
      stockQuantity: 10,
      preparationTimeDays: 3,
      returnWording,
      listingPurpose: 'Genuine commercial listing',
      preparedVariant: 'Pink only',
    },
    valuesSellerMustSupply: [
      'Shipping weight and package dimensions if Hastabazaar requires shipping-specific measurements; the source only states item measurements.',
      'Care instructions for this exact product.',
      'Any safety warning required for this exact product; none was stated on the source page.',
      'Confirm whether the source identifier JJG-WHITE-EARINGS is valid for the selected Pink variant before using it as a model number.',
    ],
    legalOrAuthenticityConcerns: [
      'The selected variant is Pink and the visible images are pink, but the source product description says white and the item part number contains WHITE; Pink is retained and the conflict is flagged for Seller verification.',
      'The source calls the item lightweight but states an item weight of 50 g; the weight should be confirmed before publication.',
      'Only three suitable images were retained; source lifestyle images that appeared synthetically generated were excluded.',
      'User states that resale and image-reuse rights are authorized; this has not been independently verified.',
      'Permanent legal documents and policy identifiers are pending. Do not enable genuine public orders until those controls are complete.',
    ],
    images: {
      selectedCount: images.length,
      requestedMaximum: 4,
      videoDownloaded: false,
      exactDuplicatesExcluded: duplicates.length,
      order: images.map(x => x.localFilename),
    },
    publication: { preparedOnly: true, enteredInHastabazaar: false, published: false },
  };
}

function makeMarkdown(record) {
  const v = record.verifiedSourceFacts;
  const m = record.rewrittenMarketingCopy;
  const s = record.suggestedValues;
  return `# Product 36 — ${m.storefrontTitle}\n\n` +
`## Source\n\n- Supplied link: ${record.source.suppliedUrl}\n- Canonical product page: ${record.source.canonicalUrl}\n- ASIN: ${record.source.asin}\n\n` +
`## Ready-to-enter values\n\n- Title: ${m.storefrontTitle}\n- Category: ${s.category}\n- Selling price: NPR ${s.pricing.sellingPriceNpr}\n- Original price: NPR ${s.pricing.originalPriceNpr}\n- Discount: 50%\n- Stock: 10\n- Preparation time: 3 days\n- SKU: ${s.sku}\n- Prepared variant: Pink only\n- Warranty: Leave blank\n- Return terms: ${s.returnWording}\n- Listing purpose: Genuine commercial listing\n- Tags: ${s.tags.join(', ')}\n\n` +
`## Rewritten marketing copy\n\n${m.description}\n\nKey features:\n\n${m.keyFeatures.map(x => `- ${x}`).join('\n')}\n\nSEO title: ${m.seoTitle}\n\nSEO description: ${m.seoDescription}\n\n` +
`## Verified source facts\n\n- Source title: ${v.sourceTitle}\n- Brand: ${v.brand}\n- Manufacturer: ${v.manufacturer}\n- Model/product identifier: ${v.modelOrIdentifier}\n- Materials: ${v.materials}\n- Colour/variants: ${v.colourAndVariant}\n- Dimensions: ${v.dimensions}\n- Weight: ${v.weight}\n- Package contents: ${v.packageContents}\n- Care instructions: ${v.careInstructions}\n- Country of origin: ${v.countryOfOrigin}\n- Amazon return eligibility observed: ${v.returnEligibility}\n- Warranty: Not stated; leave blank\n- Safety warnings: ${v.safetyWarnings}\n\n` +
`## Values requiring Seller input\n\n${record.valuesSellerMustSupply.map(x => `- ${x}`).join('\n')}\n\n` +
`## Image selection\n\n${record.images.order.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nNo videos, customer-review images, ads, screenshots, ratings, prices or unrelated recommendations were selected.\n\n` +
`## Legal/authenticity and release controls\n\n${record.legalOrAuthenticityConcerns.map(x => `- ${x}`).join('\n')}\n\nThis package is prepared locally only. It has not been entered, activated or published on Hastabazaar.\n`;
}

async function main() {
  fs.mkdirSync(productDir, { recursive: true });
  const { images, duplicates } = await downloadImages();
  const record = makeRecord(images, duplicates);
  fs.writeFileSync(path.join(productDir, 'product-data.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(productDir, 'details.md'), makeMarkdown(record), 'utf8');
  const manifest = {
    productNumber: 36,
    sourcePage,
    canonicalSourcePage,
    selectionRule: 'Up to four distinct ordinary images for the selected Pink variant from the Amazon product gallery; synthetic-looking lifestyle images, videos, review images, ads and unrelated media excluded.',
    videoDownloaded: false,
    exactDuplicatesFoundAndExcluded: duplicates,
    images,
  };
  fs.writeFileSync(path.join(imagesDir, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ product: 36, asin, sellingPriceNpr, originalPriceNpr, images: images.length }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
