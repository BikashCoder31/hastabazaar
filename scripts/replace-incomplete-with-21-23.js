import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, '..');
const productsDir = path.join(workspace, 'products');
const removedDir = path.join(productsDir, 'removed-incomplete');
const removedNumbers = [9, 16, 20];
const replacementNumbers = [21, 22, 23];
const replacementMap = [
  { removedProductNumber: 9, replacementProductNumber: 21 },
  { removedProductNumber: 16, replacementProductNumber: 22 },
  { removedProductNumber: 20, replacementProductNumber: 23 },
];

function assertInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path outside intended directory: ${target}`);
  }
}

function usable(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || /requires seller input|leave blank/i.test(text)) return '';
  return text;
}

function formatNpr(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function buildFormRecord(productNumber, record) {
  const listing = record.suggestedValues;
  const verified = record.verifiedSourceFacts;
  const marketing = record.rewrittenMarketingCopy;
  const productDir = path.join(productsDir, `product${productNumber}`);
  return {
    productNumber,
    category: 'Jewelry & accessories',
    title: marketing.storefrontTitle,
    occasions: ['Birthday gifts', 'Wedding gifts', 'Anniversary'],
    description: marketing.description,
    dimensions: usable(verified.dimensions),
    licenceReference: '',
    careInstructions: usable(verified.careInstructions),
    safetyInformation: '',
    warrantyOffered: false,
    warrantyMonths: null,
    returnConditions: listing.returnWording,
    preparationDays: listing.preparationTimeDays,
    madeToOrder: false,
    sellingPriceNpr: listing.pricing.sellingPriceNpr,
    originalPriceNpr: listing.pricing.originalPriceNpr,
    stockQuantity: listing.stockQuantity,
    returnEligible: true,
    images: record.images.order.map(name => path.join(productDir, 'images', name)),
  };
}

const replacementForms = [];
for (const productNumber of replacementNumbers) {
  const productDir = path.join(productsDir, `product${productNumber}`);
  const dataPath = path.join(productDir, 'product-data.json');
  const detailsPath = path.join(productDir, 'details.md');
  const record = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const sourcePriceInr = record.source?.sourcePriceInr ?? record.source?.capturedPriceInr;
  if (!Number.isFinite(sourcePriceInr)) throw new Error(`Missing INR price for product ${productNumber}`);
  if (record.images?.selectedCount < 4 || record.images?.order?.length < 4) {
    throw new Error(`Replacement product ${productNumber} does not have four verified images`);
  }

  const sellingPriceNpr = Math.round(sourcePriceInr * 1.6 + 200);
  const originalPriceNpr = sellingPriceNpr * 2;
  record.suggestedValues.pricing = {
    formula: `round(${sourcePriceInr} × 1.6 + 200)`,
    sellingPriceNpr,
    originalPriceNpr,
    discountPercent: 50,
  };
  record.pricingRevision = {
    revisedAt: '2026-09-17',
    rule: 'round(source price INR × 1.6 + 200)',
    sellingPriceNpr,
    originalPriceNpr,
    discountPercent: 50,
  };
  fs.writeFileSync(dataPath, JSON.stringify(record, null, 2) + '\n', 'utf8');

  let markdown = fs.readFileSync(detailsPath, 'utf8');
  markdown = markdown
    .replace(/(- \*\*Selling price:\*\* NPR )[\d,]+/g, `$1${formatNpr(sellingPriceNpr)}`)
    .replace(/(- Selling price: NPR )[\d,]+/g, `$1${formatNpr(sellingPriceNpr)}`)
    .replace(/(- \*\*Original price:\*\* NPR )[\d,]+/g, `$1${formatNpr(originalPriceNpr)}`)
    .replace(/(- Original price: NPR )[\d,]+/g, `$1${formatNpr(originalPriceNpr)}`)
    .replace(/- Price calculation:.*$/gm, `- Price calculation: \`round(${sourcePriceInr} × 1.6 + 200) = ${formatNpr(sellingPriceNpr)}\`; original price \`${formatNpr(sellingPriceNpr)} × 2 = ${formatNpr(originalPriceNpr)}\``);
  fs.writeFileSync(detailsPath, markdown, 'utf8');
  replacementForms.push(buildFormRecord(productNumber, record));
}

const oldBatchPath = path.join(productsDir, 'dashboard-batch-3-20.json');
const oldBatch = JSON.parse(fs.readFileSync(oldBatchPath, 'utf8'));
const activeBatch = oldBatch
  .filter(item => !removedNumbers.includes(item.productNumber))
  .concat(replacementForms)
  .sort((a, b) => a.productNumber - b.productNumber);
if (activeBatch.length !== 18) throw new Error(`Expected 18 post-product-2 entries, found ${activeBatch.length}`);

fs.writeFileSync(path.join(productsDir, 'dashboard-batch-replacements-21-23.json'), JSON.stringify(replacementForms, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(productsDir, 'dashboard-batch-active-20.json'), JSON.stringify(activeBatch, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(productsDir, 'active-product-numbering.json'), JSON.stringify({
  totalTargetProducts: 20,
  existingProductsOutsideThisWorkspaceBatch: [1, 2],
  activePreparedProductNumbers: activeBatch.map(item => item.productNumber),
  removedIncompleteProductNumbers: removedNumbers,
  replacementMap,
  note: 'Products 9, 16 and 20 were removed because they lacked four legitimate matching images. Products 21, 22 and 23 replace them without reusing submitted product numbers.',
}, null, 2) + '\n', 'utf8');

fs.mkdirSync(removedDir, { recursive: true });
for (const productNumber of removedNumbers) {
  const source = path.join(productsDir, `product${productNumber}`);
  const destination = path.join(removedDir, `product${productNumber}`);
  assertInside(productsDir, source);
  assertInside(productsDir, destination);
  if (!fs.existsSync(source)) continue;
  if (fs.existsSync(destination)) throw new Error(`Archive target already exists: ${destination}`);
  fs.renameSync(source, destination);
}

const originalBatchArchive = path.join(removedDir, 'dashboard-batch-original-3-20.json');
assertInside(productsDir, oldBatchPath);
assertInside(productsDir, originalBatchArchive);
if (fs.existsSync(oldBatchPath) && !fs.existsSync(originalBatchArchive)) {
  fs.renameSync(oldBatchPath, originalBatchArchive);
}

console.log(JSON.stringify({ replacementMap, activeProductNumbers: activeBatch.map(item => item.productNumber), replacementForms }, null, 2));
