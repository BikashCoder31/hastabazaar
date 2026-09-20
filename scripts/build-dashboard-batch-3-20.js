import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(__dirname, '..');
const batch = [];

function usable(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || /requires seller input|leave blank/i.test(text)) return '';
  return text;
}

for (let n = 3; n <= 20; n += 1) {
  const dir = path.join(workspace, 'products', `product${n}`);
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'product-data.json'), 'utf8'));
  const oldSchema = Boolean(record.listing);
  const listing = oldSchema ? record.listing : record.suggestedValues;
  const verified = oldSchema ? record.verifiedFacts : record.verifiedSourceFacts;
  const marketing = oldSchema ? null : record.rewrittenMarketingCopy;
  const imageRefs = oldSchema ? record.images : record.images.order.map(name => `images/${name}`);

  const images = imageRefs.map(ref => path.resolve(dir, ref.replaceAll('/', path.sep)));
  const warrantyOffered = oldSchema ? Boolean(listing.warrantyOffered) : false;
  const warrantyMonths = oldSchema && warrantyOffered ? Number(listing.warrantyMonths || 1) : null;
  const sellingPriceNpr = oldSchema ? listing.sellingPriceNpr : listing.pricing.sellingPriceNpr;
  const originalPriceNpr = oldSchema ? listing.originalPriceNpr : listing.pricing.originalPriceNpr;
  const stockQuantity = oldSchema ? listing.stockQuantity : listing.stockQuantity;
  const preparationDays = oldSchema ? listing.preparationDays : listing.preparationTimeDays;

  batch.push({
    productNumber: n,
    category: oldSchema ? listing.category : 'Jewelry & accessories',
    title: oldSchema ? listing.title : marketing.storefrontTitle,
    occasions: (oldSchema ? listing.occasions : ['Birthday gifts', 'Wedding gifts', 'Anniversary']).map(value => value.replace('Mother’s Day', "Mother's Day")),
    description: oldSchema ? listing.description : marketing.description,
    dimensions: usable(oldSchema ? listing.dimensions : verified.dimensions),
    licenceReference: usable(oldSchema ? listing.licenceReference : ''),
    careInstructions: usable(oldSchema ? listing.careInstructions : verified.careInstructions),
    safetyInformation: usable(oldSchema ? listing.safetyInformation : ''),
    warrantyOffered,
    warrantyMonths,
    returnConditions: oldSchema ? listing.returnConditions : listing.returnWording,
    preparationDays,
    madeToOrder: oldSchema ? Boolean(listing.madeToOrder) : false,
    sellingPriceNpr,
    originalPriceNpr,
    stockQuantity,
    returnEligible: oldSchema ? Boolean(listing.returnEligible) : true,
    images,
  });
}

const output = path.join(workspace, 'products', 'dashboard-batch-3-20.json');
fs.writeFileSync(output, JSON.stringify(batch, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(batch, null, 2));
