import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(__dirname, '..');

function formatNpr(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

for (let productNumber = 3; productNumber <= 20; productNumber += 1) {
  const productDir = path.join(workspace, 'products', `product${productNumber}`);
  const dataPath = path.join(productDir, 'product-data.json');
  const detailsPath = path.join(productDir, 'details.md');
  if (!fs.existsSync(dataPath) || !fs.existsSync(detailsPath)) {
    throw new Error(`Missing prepared record for product ${productNumber}`);
  }

  const record = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const sourcePriceInr = record.source?.sourcePriceInr ?? record.source?.capturedPriceInr;
  if (!Number.isFinite(sourcePriceInr)) throw new Error(`Missing INR source price for product ${productNumber}`);

  const sellingPriceNpr = Math.round(sourcePriceInr * 1.6 + 200);
  const originalPriceNpr = sellingPriceNpr * 2;

  if (record.listing) {
    record.listing.sellingPriceNpr = sellingPriceNpr;
    record.listing.originalPriceNpr = originalPriceNpr;
    record.listing.discountPercent = 50;
    record.listing.priceFormula = `round(${sourcePriceInr} × 1.6 + 200)`;
  }
  if (record.suggestedValues?.pricing) {
    record.suggestedValues.pricing.formula = `round(${sourcePriceInr} × 1.6 + 200)`;
    record.suggestedValues.pricing.sellingPriceNpr = sellingPriceNpr;
    record.suggestedValues.pricing.originalPriceNpr = originalPriceNpr;
    record.suggestedValues.pricing.discountPercent = 50;
  }
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

  console.log(JSON.stringify({ productNumber, sourcePriceInr, sellingPriceNpr, originalPriceNpr }));
}

const defaultsPath = path.join(workspace, 'outputs', 'seller-products', 'batch-listing-defaults.json');
if (fs.existsSync(defaultsPath)) {
  const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
  defaults.version = Number(defaults.version || 1) + 1;
  defaults.pricing.formula = 'round(sourcePriceInr * 1.6 + 200)';
  defaults.pricing.sellingPriceRule = 'round(sourcePriceInr * 1.6 + 200)';
  defaults.pricing.effectiveFromProductNumber = 3;
  defaults.pricing.note = 'Products 1 and 2 were already published and were not modified by this revision.';
  fs.writeFileSync(defaultsPath, JSON.stringify(defaults, null, 2) + '\n', 'utf8');
}
