import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'products');
const returnWording = 'Returns or exchanges are accepted within 10 days of delivery under the standard Hastabazaar return policy.';
const common = {
  category: 'Jewellery > Earrings',
  stock: 10,
  preparationDays: 3,
  discountPercent: 50,
  warranty: null,
  warrantyNote: 'Not stated on the source page; leave the warranty fields blank.',
  listingPurpose: 'Genuine commercial listing',
};

const products = [
  {
    n: 16, shortUrl: 'https://amzn.in/d/0fv7Dfop', asin: 'B0HFNQK3KT', inr: 349,
    title: 'Handmade Resin Dangle Earrings – Oatmilk', brand: "THE STATEMENT P'S", manufacturer: 'Burasuna Private Limited',
    variant: 'Set name: OATMILK', colour: 'Oatmilk', materials: 'Resin; no gemstone', dimensions: '2.4 × 0.5 × 4.5 cm', weight: '10 g', packageContents: 'Net quantity: 1 count',
    identifier: 'AE-AMZ-23-TFC-OATMILK', origin: 'India', care: 'Requires Seller input.',
    features: ['Handcrafted resin dangle design', 'Lightweight construction', 'Suitable for everyday and occasion styling'],
    description: 'Handcrafted resin dangle earrings in the Oatmilk set style. Their light construction and clean statement shape make them suitable for work, casual outings, celebrations and evening wear.',
    concerns: ['The source title says “hypoallergenic”, but the source page provides no test or certification; that claim is intentionally omitted.', 'Only three distinct gallery images matched this exact design; a different-design promotional image was excluded.'],
    images: ['https://m.media-amazon.com/images/I/21l7RbyaQTL._SL1500_.jpg','https://m.media-amazon.com/images/I/41t9S8+vfmL._SL1500_.jpg','https://m.media-amazon.com/images/I/41DdwnKS5UL._SL1500_.jpg']
  },
  {
    n: 17, shortUrl: 'https://amzn.in/d/05XzES9f', asin: 'B0FSTBP6DV', inr: 374,
    title: 'Handmade Fish-Style Oxidised Ear Cuffs', brand: 'Handmade Harmony', manufacturer: 'Handmade Harmony',
    variant: 'Single source style', colour: 'Oxidised silver tone', materials: 'Brass with oxidised silver-replica plating; no gemstone', dimensions: '8 × 1.5 × 8 cm', weight: '12.6 g', packageContents: 'Net quantity: 1 set',
    identifier: 'FISH', origin: 'India', care: 'Requires Seller input.',
    features: ['Fish-shaped ear-cuff design', 'Handmade brass construction', 'Oxidised silver-tone finish', 'Lightweight design'],
    description: 'Handmade fish-style ear cuffs made from brass with an oxidised silver-tone replica finish. The bohemian design can be paired with casual, festive and occasion outfits.',
    images: ['https://m.media-amazon.com/images/I/81z+g8-dopL._SL1500_.jpg','https://m.media-amazon.com/images/I/61it2UQZebL._SL1369_.jpg','https://m.media-amazon.com/images/I/81mwvHjxsZL._SL1500_.jpg','https://m.media-amazon.com/images/I/81b1YzXT6QL._SL1500_.jpg']
  },
  {
    n: 18, shortUrl: 'https://amzn.in/d/0bW1rdoH', asin: 'B0DKJYCF2B', inr: 299,
    title: 'KHOJ.CITY Pink Handmade Boho Drop Earrings', brand: 'KHOJ.CITY', manufacturer: 'EKHOJ ENTERPRISES PRIVATE LIMITED',
    variant: 'Colour: Pink', colour: 'Pink', materials: 'MDF board, fabric, acrylic colours, beads and thread; no metal; no gemstone', dimensions: '6 × 3 × 0.3 cm', weight: 'Source conflict: 22 g in feature text; 25 g in product details', packageContents: 'Net quantity: 1 set',
    identifier: 'HM-ER-053', origin: 'Requires Seller input; country of origin was not displayed in the captured facts.', care: 'Store in a dry place to preserve the colours and fabric texture.',
    features: ['Fabric-over-MDF base', 'Mirror-style work and silver-tone bead embroidery', 'White pearl accents', 'Handmade statement design'],
    description: 'Pink handmade statement earrings built on a fabric-covered MDF base and decorated with mirror-style work, silver-tone bead embroidery and white pearl accents. Designed for ethnic and bohemian styling.',
    concerns: ['The source gives two different weights (22 g and 25 g); Seller must verify the correct item weight.', 'Only three distinct gallery images matched this exact pink earring design; unrelated product promotions were excluded.'],
    images: ['https://m.media-amazon.com/images/I/71w-Sa7i+YL._SL1200_.jpg','https://m.media-amazon.com/images/I/61rgE2IMimL._SL1200_.jpg','https://m.media-amazon.com/images/I/613muanQpxL._SL1200_.jpg']
  },
  {
    n: 19, shortUrl: 'https://amzn.in/d/0dDpZZEQ', asin: 'B0CL2KG44P', inr: 447,
    title: 'Dark Green Double-Flower Dangle Earrings', brand: 'MIZORRI', manufacturer: 'JCPL, Noida',
    variant: 'Colour: Dark Green', colour: 'Dark Green', materials: 'Zinc/alloy; no gemstone', dimensions: '5 × 3.1 × 5 cm; stated drop length 4.8 cm', weight: '100 g', packageContents: 'Net quantity: 2 count',
    identifier: 'HE029LY03DGR', origin: 'Taiwan', care: 'Requires Seller input.',
    features: ['Layered double-flower design', 'Dark green statement finish', 'Dangle silhouette', 'Suitable for party and occasion styling'],
    description: 'Dark green double-flower dangle earrings with layered metal petals. The statement floral silhouette is designed for parties, celebrations, office styling and special occasions.',
    images: ['https://m.media-amazon.com/images/I/51Q3aGfawgL._SL1500_.jpg','https://m.media-amazon.com/images/I/61bpnnkeFXL._SL1500_.jpg','https://m.media-amazon.com/images/I/51016yCOCuL._SL1500_.jpg','https://m.media-amazon.com/images/I/51slXGeMkAL._SL1500_.jpg']
  },
  {
    n: 20, shortUrl: 'https://amzn.in/d/0egBD683', asin: 'B0H6JNN42P', inr: 270,
    title: 'Craftage Orange Hand-Painted Mandala Drop Earrings', brand: 'CraftAge - Design & Craft with Love', manufacturer: 'CraftAge Concepts',
    variant: 'Colour: Orange', colour: 'Orange', materials: 'Wood with metal casting studs; source also lists apatite as gem type', dimensions: '10 × 5 × 10 cm', weight: '150 g', packageContents: 'Requires Seller input; net quantity was not stated.',
    identifier: 'ASIN B0H6JNN42P', origin: 'India', care: 'Requires Seller input.',
    features: ['Laser-cut mandala/floral pattern', 'Individually hand-painted', 'Decorative metal stud tops', 'Wooden statement design'],
    description: 'Orange hand-painted wooden drop earrings with a laser-cut mandala-inspired pattern and decorative metal stud tops. The artisan design pairs with ethnic, Indo-western and casual outfits.',
    concerns: ['Only one distinct source-gallery image matched the selected orange variant; the blue-variant image was excluded.'],
    images: ['https://m.media-amazon.com/images/I/71T9VcJdvyL._SL1500_.jpg']
  },
  {
    n: 21, shortUrl: 'https://amzn.in/d/00ah51Bz', asin: 'B0DL4MD6BX', inr: 299,
    title: 'QTEVER Blue & Green Scarlet Macaw Clay Earrings', brand: 'QTEVER', manufacturer: 'MISO ARTS',
    variant: 'Single source style', colour: 'Blue and green', materials: 'Mould-it clay; no gemstone', dimensions: '2.5 × 3.5 cm; product details also state 2.5 × 0.02 × 3.5 cm', weight: '8 g', packageContents: 'Net quantity: 1 set',
    identifier: 'Model 002', origin: 'India', care: 'Requires Seller input.',
    features: ['Handmade scarlet-macaw bird motif', 'Blue and green colour combination', 'Clay construction', 'Lightweight dangle style'],
    description: 'Handmade blue and green dangle earrings shaped as scarlet macaw birds. Crafted from mould-it clay, the lightweight pair adds a playful nature-inspired accent.',
    concerns: ['The source presents the dimensions in two formats and omits one value in one location; Seller should confirm thickness.'],
    images: ['https://m.media-amazon.com/images/I/71-YqMB1aoL._SL1500_.jpg','https://m.media-amazon.com/images/I/81qkj--c5NL._SL1500_.jpg','https://m.media-amazon.com/images/I/817ICCI-lLL._SL1500_.jpg','https://m.media-amazon.com/images/I/81Md3z0kGBL._SL1500_.jpg']
  },
  {
    n: 22, shortUrl: 'https://amzn.in/d/0fSkViLB', asin: 'B0HBB35DMX', inr: 159,
    title: 'Oxidised Silver-Tone Elephant Charm Drop Earrings', brand: 'Generic', manufacturer: 'DameKart',
    variant: 'Single source style', colour: 'Oxidised silver tone', materials: 'German silver alloy', dimensions: '4.5 × 3.5 × 4.5 cm', weight: '20 g', packageContents: 'Net quantity: 1 set',
    identifier: 'ASIN B0HBB35DMX', origin: 'India', care: 'Requires Seller input.',
    features: ['Detailed elephant charm', 'Oxidised antique-style finish', 'Fish-hook ear wires', 'Tribal and ethnic styling'],
    description: 'Oxidised silver-tone elephant charm drop earrings with floral, dot and geometric detailing. The tribal-inspired design works with kurtas, sarees, bohemian outfits and casual looks.',
    images: ['https://m.media-amazon.com/images/I/61nJxDuuMyL._SL1354_.jpg','https://m.media-amazon.com/images/I/71IObcu3pIL._SL1500_.jpg','https://m.media-amazon.com/images/I/71I-d7lYeaL._SL1500_.jpg','https://m.media-amazon.com/images/I/71C4PK8Fu0L._SL1354_.jpg']
  },
  {
    n: 23, shortUrl: 'https://amzn.in/d/038nk2tA', asin: 'B0H2ZBFFMT', inr: 249,
    title: 'TR HAUTE Blue Woven Hoop Drop Earrings', brand: 'TR HAUTE', manufacturer: 'TR HAUTE',
    variant: 'Single source style', colour: 'Blue with cream-coloured beads', materials: 'Fabric/cord, alloy and beads; no gemstone', dimensions: '7.5 × 6 × 0.1 cm', weight: '8 g', packageContents: 'Net quantity: 1 pack',
    identifier: 'Tr-haute-blue-hoop-drop', origin: 'India', care: 'Requires Seller input.',
    features: ['Handwoven blue circular frame', 'Cream bead floral centre', 'Gold-tone links', 'Bohemian statement style'],
    description: 'Blue handwoven hoop drop earrings with cream-coloured beads arranged in a floral centre and gold-tone connecting links. A bold bohemian accessory for parties, vacations and beachwear.',
    images: ['https://m.media-amazon.com/images/I/71EbuTX2mJL._SL1254_.jpg','https://m.media-amazon.com/images/I/71H9GqHFC9L._SL1254_.jpg','https://m.media-amazon.com/images/I/71fCII15nUL._SL1254_.jpg','https://m.media-amazon.com/images/I/71QIKbG4b3L._SL1254_.jpg']
  },
  {
    n: 24, shortUrl: 'https://amzn.in/d/0bxzYoJk', asin: 'B08TVGMKT8', inr: 200,
    title: 'Light Purple Crochet Circular Earrings', brand: 'Generic', manufacturer: 'Vyoman Studio',
    variant: 'Light purple crochet circular earrings', colour: 'Light purple', materials: 'Cotton thread with artificial silver-colour metal hooks', dimensions: '3.81 × 3.81 × 0.2 cm (about 1.5 in diameter)', weight: '100 g', packageContents: 'Net quantity: 1 count',
    identifier: 'ASIN B08TVGMKT8', origin: 'India', care: 'Requires Seller input.',
    features: ['Hand-crocheted circular design', 'Cotton-thread construction', 'Artificial silver-colour hooks', 'Bohemian styling'],
    description: 'Light purple circular earrings hand-crocheted from cotton thread and finished with artificial silver-colour hooks. Designed for daily wear, parties and relaxed bohemian styling.',
    concerns: ['Only three distinct source-gallery product images were available.', 'The stated 100 g weight appears high for this item and should be confirmed by the Seller.'],
    images: ['https://m.media-amazon.com/images/I/71ion0zb-ML._SL1254_.jpg','https://m.media-amazon.com/images/I/61aiiKqThRL._SL1448_.jpg','https://m.media-amazon.com/images/I/71R-2e4lFGL._SL1448_.jpg']
  },
  {
    n: 25, shortUrl: 'https://amzn.in/d/06rmEDbo', asin: 'B0B7NRDWMQ', inr: 241,
    title: 'Voylla Moksha Damru Trishul Oxidised Earrings', brand: 'VOYLLA', manufacturer: 'Voylla Fashions Pvt Ltd',
    variant: 'Single source style', colour: 'Oxidised silver tone', materials: 'Brass; no gemstone', dimensions: '2.79 × 2.16 × 2.79 cm', weight: '10.7 g', packageContents: 'Net quantity: 2 count',
    identifier: 'Model 8907617888163', origin: 'India', care: 'Requires Seller input.',
    features: ['Damru and trishul spiritual motif', 'Oxidised finish', 'Temple-inspired styling', 'Brass construction'],
    description: 'Voylla Moksha earrings featuring damru and trishul motifs in an oxidised finish. The temple-inspired brass design is suited to everyday ethnic and festive styling.',
    images: ['https://m.media-amazon.com/images/I/61KHwLwpULL._SL1500_.jpg','https://m.media-amazon.com/images/I/71+BytMaJZL._SL1500_.jpg','https://m.media-amazon.com/images/I/71Whkz7T10L._SL1500_.jpg','https://m.media-amazon.com/images/I/51knHen1G-L._SL1500_.jpg']
  },
  {
    n: 26, shortUrl: 'https://amzn.in/d/0g0aDarn', asin: 'B0FBLC3ZXH', inr: 180,
    title: 'Blue & White Crochet Crescent Hoop Earrings', brand: 'Generic', manufacturer: 'Creativethreads',
    variant: 'Single source style', colour: 'Blue and white', materials: 'Cotton thread/yarn with stainless-steel hooks; no gemstone', dimensions: '3.5 × 3.5 × 4 cm; approximately 3.5 cm diameter stated', weight: '5 g', packageContents: 'Net quantity: 2 pack',
    identifier: 'CTE0005', origin: 'India', care: 'Requires Seller input.',
    features: ['Hand-crocheted crescent pattern', 'Blue-to-white colour contrast', 'Hoop silhouette', 'Stainless-steel hooks'],
    description: 'Handmade crochet hoop earrings with a blue-and-white crescent pattern and decorative openwork. Cotton thread and stainless-steel hooks create a lightweight casual accessory.',
    concerns: ['Only one distinct source-gallery product image was available.'],
    images: ['https://m.media-amazon.com/images/I/61D7IZQe0kL._SL1280_.jpg']
  },
  {
    n: 27, shortUrl: 'https://amzn.in/d/09uor7Jk', asin: 'B09FPJF5Q7', inr: 499,
    title: 'Aakriti Art Creations Blue Dhokra Round Earrings', brand: 'AAKRITI ART CREATIONS', manufacturer: 'Requires Seller input; manufacturer was not stated.',
    variant: 'Colour: Round Earrings in Blue', colour: 'Blue', materials: 'Beads, fabric, lady brass and resin', dimensions: 'Approximately 3.8 × 1.2 × 7.6 cm', weight: '30 g', packageContents: 'One pair of handcrafted earrings; net quantity 1 count',
    identifier: 'ASIN B09FPJF5Q7', origin: 'India', care: 'Requires Seller input.',
    features: ['Dhokra-inspired round design', 'Handcrafted tribal artwork', 'Blue beads and fabric', 'Matte finish'],
    description: 'Blue round statement earrings combining beads, fabric, lady brass and resin in a Dhokra-inspired design. Handcrafted tribal detailing and a matte finish complement ethnic and fusion outfits.',
    images: ['https://m.media-amazon.com/images/I/71woZWl06UL._SL1500_.jpg','https://m.media-amazon.com/images/I/71wOW2TMa9L._SL1500_.jpg','https://m.media-amazon.com/images/I/A1FUxi8ACHL._SL1500_.jpg','https://m.media-amazon.com/images/I/71J9muujPOL._SL1500_.jpg']
  },
  {
    n: 28, shortUrl: 'https://amzn.in/d/013z6Goo', asin: 'B0HCNK41S4', inr: 449,
    title: 'Aestheticz Handmade Red Flower Drop Earrings', brand: 'Aestheticz', manufacturer: 'Aestheticz',
    variant: 'Colour represented by source link: Red', colour: 'Red', materials: 'Alloy and resin with 304 stainless-steel ear needles; no gemstone', dimensions: '5 × 3 × 5 cm', weight: '26 g', packageContents: 'Net quantity: 1 pack',
    identifier: 'AZE020', origin: 'India', care: 'Requires Seller input.',
    features: ['Handmade floral design', '304 stainless-steel ear needles', 'Alloy and resin construction', 'Retro statement style'],
    description: 'Handmade red floral drop earrings in alloy and resin, finished with 304 stainless-steel ear needles. The retro statement design adds a bold accent to casual and occasion outfits.',
    concerns: ['Only three distinct gallery images matched this exact red floral design; a multi-product promotional image was excluded.'],
    images: ['https://m.media-amazon.com/images/I/41kA4RifXwL._SL1500_.jpg','https://m.media-amazon.com/images/I/41UPIUCzcwL._SL1500_.jpg','https://m.media-amazon.com/images/I/41Ai9PXDKxL._SL1500_.jpg']
  },
  {
    n: 29, shortUrl: 'https://amzn.in/d/0fGU3amD', asin: 'B0HHN46PRG', inr: 399,
    title: 'Traditional Hand-Painted Fabric Earrings Combo Set', brand: 'Le bijouxistic', manufacturer: 'Ekam Ek',
    variant: 'Combo set', colour: 'Multicolour', materials: 'Source product facts list paper; the title and feature text describe fabric earrings', dimensions: '5 × 3.5 × 2 cm', weight: '175 g', packageContents: 'Net quantity: 2 sets',
    identifier: 'Item part number Jhumki', origin: 'India', care: 'Requires Seller input.',
    features: ['Traditional hand-painted artwork', 'Colourful statement designs', 'Two-set combo', 'Ethnic and festive styling'],
    description: 'A colourful combo of traditional hand-painted statement earrings for festive, wedding and casual styling. The coordinated designs add an artisanal Indian accent to multiple outfits.',
    concerns: ['The source conflicts on material: product facts say paper, while the title and features say fabric.', 'The stated 175 g weight should be confirmed by the Seller.'],
    images: ['https://m.media-amazon.com/images/I/81ZER5F9MeL._SL1500_.jpg','https://m.media-amazon.com/images/I/71BdWWiPVGL._SL1500_.jpg','https://m.media-amazon.com/images/I/71mNRsHEhhL._SL1500_.jpg','https://m.media-amazon.com/images/I/61FKPj1u5YL._SL1500_.jpg']
  },
  {
    n: 30, shortUrl: 'https://amzn.in/d/00ydMvBZ', asin: 'B0CQ7XPHXM', inr: 245,
    title: 'Tipsy Closet Blue Butterfly Beaded Danglers', brand: 'TipsyCloset', manufacturer: 'Tipsy Closet',
    variant: 'Colour: Blue; pack of 1 pair', colour: 'Blue', materials: 'Beads; feature text also mentions seed beads, sequins and pearls; no gemstone', dimensions: 'Item dimensions not stated; package dimensions 10 × 10 × 5 cm', weight: '50 g', packageContents: 'Net quantity: 1 set',
    identifier: 'Model BUTTERFLY2', origin: 'India', care: 'Requires Seller input.',
    features: ['Handmade butterfly motif', 'Beaded and embroidered detailing', 'Blue bohemian statement style', 'Floral stud top'],
    description: 'Blue butterfly dangler earrings handcrafted with beaded and embroidered detailing. The embellished bohemian design creates a colourful statement for parties, festivals and special occasions.',
    concerns: ['Only package dimensions were stated; item dimensions require Seller input.', 'Comfort and allergy claims from the source were omitted because no supporting test information was provided.'],
    images: ['https://m.media-amazon.com/images/I/71X6x7yuRmL._SL1500_.jpg','https://m.media-amazon.com/images/I/81gQZY8jDKL._SL1500_.jpg','https://m.media-amazon.com/images/I/81JkzDc+byL._SL1500_.jpg','https://m.media-amazon.com/images/I/81OIk6lbPcL._SL1500_.jpg']
  },
  {
    n: 31, shortUrl: 'https://amzn.in/d/027htS4R', asin: 'B0DGXCLR51', inr: 299,
    title: 'KHOJ.CITY Yellow & Red Hand-Painted Boho Earrings', brand: 'KHOJ.CITY', manufacturer: 'EKHOJ ENTERPRISES PRIVATE LIMITED',
    variant: 'Yellow and red source style', colour: 'Yellow and red', materials: 'Hard board/MDF, fabric, acrylic colour, beads and thread; no metal', dimensions: 'Source conflict: 9.5 × 4 × 0.3 cm in features; 7.62 × 12.7 × 1.27 cm in product details', weight: 'Source conflict: 17 g in features; 18 g in product details', packageContents: 'Net quantity: 1 count',
    identifier: 'KHJ-AMZ-ER-126', origin: 'Requires Seller input; country of origin was not displayed in the captured facts.', care: 'Requires Seller input.',
    features: ['Hand-painted folk-art motif', 'Cowrie shells and pompoms', 'Yellow and red palette', 'Gold-tone fishhook wires'],
    description: 'Yellow and red hand-painted boho earrings built from hard board, fabric, acrylic colour, beads and thread. Folk-art motifs, cowrie shells and pompoms create a distinctive handcrafted look.',
    concerns: ['The source gives conflicting dimensions and weights; Seller must verify both before publication.', 'Only three distinct gallery images matched this exact design; a different-design promotional image was excluded.'],
    images: ['https://m.media-amazon.com/images/I/716FsAOofRL._SL1200_.jpg','https://m.media-amazon.com/images/I/71rwUxSgdrL._SL1500_.jpg','https://m.media-amazon.com/images/I/71-gFaTydLL._SL1500_.jpg']
  },
  {
    n: 32, shortUrl: 'https://amzn.in/d/0aYiXHln', asin: 'B0GTZ76F4D', inr: 449,
    title: 'VENUS MEMSAHAB Multicolour Thread & Beaded Drop Earrings', brand: 'VENUS MEMSAHAB', manufacturer: 'VENUS MEMSAHAB',
    variant: 'Single source style', colour: 'Multicolour', materials: 'Beads and thread; no gemstone', dimensions: '9.5 × 3.5 × 1 cm', weight: '200 g', packageContents: 'Net quantity: 1 count',
    identifier: 'VMS019', origin: 'India', care: 'Requires Seller input.',
    features: ['Multicolour wrapped-thread beads', 'Delicate bead accents', 'Playful drop silhouette', 'Handmade statement design'],
    description: 'Multicolour drop earrings made with wrapped-thread beads and small bead accents. The vibrant handcrafted design suits casual wear, vacations and festive styling.',
    concerns: ['The stated 200 g weight appears high for earrings and should be confirmed by the Seller.', 'Skin-friendly and durability claims were omitted because the source provided no supporting test information.'],
    images: ['https://m.media-amazon.com/images/I/615anwWfFaL._SL1440_.jpg','https://m.media-amazon.com/images/I/61UU5Dgy49L._SL1440_.jpg','https://m.media-amazon.com/images/I/71IStx49twL._SL1358_.jpg','https://m.media-amazon.com/images/I/71313VlQ7KL._SL1500_.jpg']
  },
  {
    n: 33, shortUrl: 'https://amzn.in/d/0gIscflM', asin: 'B0FFTDN2PS', inr: 199,
    title: 'WORLD CRAZE Multicolour Kashmiri Chandbali Jhumka Earrings', brand: 'WORLD CRAZE THE FINEST OF THEM ALL', manufacturer: 'WORLD CRAZE THE FINEST OF THEM ALL',
    variant: 'Colour: Multi', colour: 'Multicolour', materials: 'Faux pearls and alloy metal', dimensions: '7.5 × 5.5 × 1.2 cm', weight: '50 g', packageContents: 'Net quantity: 2 pack',
    identifier: '2008', origin: 'India', care: 'Requires Seller input.',
    features: ['Chandbali-inspired jhumka shape', 'Long chain tassels and latkan elements', 'Pearl-style drops', 'Multicolour festive detailing'],
    description: 'Multicolour Kashmiri-style chandbali jhumka earrings with long chain tassels, latkan details and faux-pearl drops. Designed to complement sarees, lehengas, kurtis and festive outfits.',
    images: ['https://m.media-amazon.com/images/I/71DJL9GuXkL._SL1254_.jpg','https://m.media-amazon.com/images/I/61aE7mTQAuL._SL1000_.jpg','https://m.media-amazon.com/images/I/614mTwrQazL._SL1000_.jpg','https://m.media-amazon.com/images/I/81Xu-uVegrL._SL1500_.jpg']
  },
  {
    n: 34, shortUrl: 'https://amzn.in/d/01NKmosx', asin: 'B07RHSGBH8', inr: 180,
    title: 'Tia Crafts Orange Silk-Thread Chand Bali Earrings', brand: 'Tia Crafts', manufacturer: 'Tia Crafts',
    variant: 'Colour: Orange', colour: 'Orange', materials: 'Silk thread, base/non-precious metal and pearl', dimensions: 'Item dimensions require Seller input; package dimensions 10.1 × 8 × 4.9 cm', weight: '10 g', packageContents: 'Requires Seller input; net quantity was not stated.',
    identifier: 'ASIN B07RHSGBH8', origin: 'India', care: 'Keep away from water, perfume and heat.',
    features: ['Handmade silk-thread jhumki design', 'Chand bali silhouette', 'Pearl detailing', 'Orange festive colour'],
    description: 'Orange handmade chand bali earrings combining silk thread, base metal and pearl detailing. The colourful jhumki-inspired design is intended for festive and ethnic styling.',
    concerns: ['Only one distinct source-gallery product image was available.', 'Only package dimensions were stated; item dimensions require Seller input.'],
    images: ['https://m.media-amazon.com/images/I/51yulQuPblL._SL1500_.jpg']
  },
  {
    n: 35, shortUrl: 'https://amzn.in/d/09YA4NKh', asin: 'B0GRTW587M', inr: 259,
    title: 'Handmade Crochet Rose Earrings', brand: 'Generic', manufacturer: 'Crochet_Woolart',
    variant: 'Source style shown; colour requires Seller confirmation', colour: 'Requires Seller input.', materials: 'Source conflict: product facts list wool; description says mercerized cotton thread', dimensions: '2.54 × 1.27 × 2.54 cm', weight: '10 g', packageContents: 'Net quantity: 1 count',
    identifier: 'CROCHET-ROSE-EARRING-01', origin: 'India', care: 'Requires Seller input.',
    features: ['Hand-stitched crochet rose form', 'Three-dimensional floral design', 'Lightweight statement style', 'Nickel-free findings claimed by source'],
    description: 'Handmade crochet rose earrings with carefully stitched, three-dimensional petals. The floral design offers an artisanal accent for weddings, garden parties and everyday outfits.',
    concerns: ['The source conflicts on material (wool versus mercerized cotton thread); Seller must verify.', 'The nickel-free/hypoallergenic claim was not independently verified and should not be published without evidence.'],
    images: ['https://m.media-amazon.com/images/I/31Ij1zDlOZL._SL1500_.jpg','https://m.media-amazon.com/images/I/41v3yuznKaL._SL1500_.jpg','https://m.media-amazon.com/images/I/51grvUgLANL._SL1500_.jpg','https://m.media-amazon.com/images/I/513PbfEcOrL._SL1500_.jpg']
  }
];

function cleanBrand(value) {
  return value.replace(/^Visit the /, '').replace(/ Store$/, '').replace(/^Brand:\s*/, '');
}

function jpegDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (!length) break;
    offset += 2 + length;
  }
  return null;
}

function safeFileSku(p) {
  const suffix = p.colour && !p.colour.startsWith('Requires') ? '-' + p.colour.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
  return `HB-ER-${p.asin}${suffix}`.toUpperCase();
}

async function downloadImages(p, imagesDir) {
  const manifestImages = [];
  const duplicates = [];
  const seen = new Set();
  for (let sourceIndex = 0; sourceIndex < p.images.length; sourceIndex += 1) {
    const source = p.images[sourceIndex];
    const response = await fetch(source, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Image download failed (${response.status}) for ${source}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error(`Rejected non-image content (${contentType}) from ${source}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (seen.has(sha256)) {
      duplicates.push({ source, sha256 });
      continue;
    }
    seen.add(sha256);
    const sequence = manifestImages.length + 1;
    const filename = `${safeFileSku(p).toLowerCase()}-${String(sequence).padStart(2, '0')}.jpg`;
    const localPath = path.join(imagesDir, filename);
    fs.writeFileSync(localPath, buffer);
    const dimensions = jpegDimensions(buffer);
    manifestImages.push({
      sourcePage: p.shortUrl,
      canonicalSourcePage: `https://www.amazon.in/dp/${p.asin}`,
      originalImageReference: source,
      localFilename: filename,
      dimensions: dimensions || { width: null, height: null },
      byteSize: buffer.length,
      sha256,
    });
  }
  return { manifestImages, duplicates };
}

function buildRecord(p, manifestImages, duplicates) {
  const selling = Math.round(p.inr * 1.6 + 150);
  const original = selling * 2;
  const sku = safeFileSku(p);
  const concerns = [
    ...(p.concerns || []),
    'User states that resale and image-reuse rights are authorized; this has not been independently verified.',
    'Permanent legal documents and policy identifiers are pending. Do not enable genuine public orders until those controls are complete.',
  ];
  return {
    productNumber: p.n,
    source: { suppliedUrl: p.shortUrl, canonicalUrl: `https://www.amazon.in/dp/${p.asin}`, asin: p.asin, capturedPriceInr: p.inr, amazonReturnEligibility: '10 days Returnable' },
    verifiedSourceFacts: {
      sourceTitle: p.title,
      brand: cleanBrand(p.brand), manufacturer: p.manufacturer, modelOrIdentifier: p.identifier,
      materials: p.materials, colourAndVariant: `${p.colour}; ${p.variant}`, dimensions: p.dimensions,
      weight: p.weight, packageContents: p.packageContents, careInstructions: p.care,
      countryOfOrigin: p.origin, returnEligibility: '10 days Returnable',
      warranty: 'Not stated on source; leave blank.',
    },
    rewrittenMarketingCopy: {
      storefrontTitle: p.title,
      description: p.description,
      keyFeatures: p.features,
      seoTitle: `${p.title} | Hastabazaar`,
      seoDescription: `${p.title}. ${p.description}`.slice(0, 158),
    },
    suggestedValues: {
      category: common.category,
      tags: [...new Set(['earrings','handmade jewellery', ...p.title.toLowerCase().split(/\s+/).filter(w => ['resin','boho','flower','floral','crochet','oxidised','clay','mandala','beaded','jhumka','chandbali','thread'].includes(w.replace(/[^a-z]/g,'')))])],
      sku,
      pricing: { formula: `round(${p.inr} × 1.6 + 150)`, sellingPriceNpr: selling, originalPriceNpr: original, discountPercent: 50 },
      stockQuantity: common.stock,
      preparationTimeDays: common.preparationDays,
      returnWording,
      listingPurpose: common.listingPurpose,
    },
    valuesSellerMustSupply: [
      'Shipping weight and package dimensions if Hastabazaar requires shipping-specific values; item/package values above may not be shipping measurements.',
      'Any safety warning required for this exact product; none was stated on the source page.',
      ...(String(p.colour).startsWith('Requires') ? ['Confirm the listing colour.'] : []),
      ...(String(p.packageContents).startsWith('Requires') ? ['Confirm the exact package contents/net quantity.'] : []),
      ...(String(p.manufacturer).startsWith('Requires') ? ['Confirm the manufacturer.'] : []),
    ],
    legalOrAuthenticityConcerns: concerns,
    images: { selectedCount: manifestImages.length, requestedMaximum: 4, videoDownloaded: false, exactDuplicatesExcluded: duplicates.length, order: manifestImages.map(x => x.localFilename) },
    publication: { preparedOnly: true, enteredInHastabazaar: false, published: false },
  };
}

function markdown(record) {
  const v = record.verifiedSourceFacts;
  const m = record.rewrittenMarketingCopy;
  const s = record.suggestedValues;
  const imageNote = record.images.selectedCount < 4 ? `Only ${record.images.selectedCount} distinct source-gallery product image(s) were available; no unrelated image was added to reach four.` : 'Four source-gallery product images selected.';
  return `# Product ${record.productNumber} — ${m.storefrontTitle}\n\n` +
`## Source\n\n- Supplied link: ${record.source.suppliedUrl}\n- Canonical product page: ${record.source.canonicalUrl}\n- ASIN: ${record.source.asin}\n\n` +
`## Ready-to-enter values\n\n- Title: ${m.storefrontTitle}\n- Category: ${s.category}\n- Selling price: NPR ${s.pricing.sellingPriceNpr}\n- Original price: NPR ${s.pricing.originalPriceNpr}\n- Discount: ${s.pricing.discountPercent}%\n- Stock: ${s.stockQuantity}\n- Preparation time: ${s.preparationTimeDays} days\n- SKU: ${s.sku}\n- Warranty: Leave blank\n- Return terms: ${s.returnWording}\n- Listing purpose: ${s.listingPurpose}\n- Tags: ${s.tags.join(', ')}\n\n` +
`## Rewritten marketing copy\n\n${m.description}\n\nKey features:\n\n${m.keyFeatures.map(x => `- ${x}`).join('\n')}\n\nSEO title: ${m.seoTitle}\n\nSEO description: ${m.seoDescription}\n\n` +
`## Verified source facts\n\n- Brand: ${v.brand}\n- Manufacturer: ${v.manufacturer}\n- Model/product identifier: ${v.modelOrIdentifier}\n- Materials: ${v.materials}\n- Colour/variant: ${v.colourAndVariant}\n- Dimensions: ${v.dimensions}\n- Weight: ${v.weight}\n- Package contents: ${v.packageContents}\n- Care instructions: ${v.careInstructions}\n- Country of origin: ${v.countryOfOrigin}\n- Amazon return eligibility observed: ${v.returnEligibility}\n- Warranty: Not stated; leave blank\n\n` +
`## Values requiring Seller input\n\n${record.valuesSellerMustSupply.map(x => `- ${x}`).join('\n')}\n\n` +
`## Image selection\n\n${imageNote}\n\n${record.images.order.map((x,i) => `${i+1}. ${x}`).join('\n')}\n\nNo videos, customer-review images, ads, screenshots, ratings, prices or unrelated recommendations were selected.\n\n` +
`## Legal/authenticity and release controls\n\n${record.legalOrAuthenticityConcerns.map(x => `- ${x}`).join('\n')}\n\nThis package is prepared locally only. It has not been entered, activated or published on Hastabazaar.\n`;
}

async function main() {
  fs.mkdirSync(root, { recursive: true });
  const summary = [];
  for (const p of products) {
    const productDir = path.join(root, `product${p.n}`);
    const imagesDir = path.join(productDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    for (const entry of fs.readdirSync(imagesDir)) {
      if (/^hb-er-.*\.(?:jpg|jpeg|png)$/i.test(entry)) fs.unlinkSync(path.join(imagesDir, entry));
    }
    const { manifestImages, duplicates } = await downloadImages(p, imagesDir);
    const record = buildRecord(p, manifestImages, duplicates);
    fs.writeFileSync(path.join(productDir, 'product-data.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(productDir, 'details.md'), markdown(record), 'utf8');
    const manifest = {
      productNumber: p.n,
      sourcePage: p.shortUrl,
      canonicalSourcePage: `https://www.amazon.in/dp/${p.asin}`,
      selectionRule: 'Up to four distinct ordinary product images from the Amazon product gallery; videos, review images, ads and unrelated media excluded.',
      videoDownloaded: false,
      exactDuplicatesFoundAndExcluded: duplicates,
      images: manifestImages,
    };
    fs.writeFileSync(path.join(imagesDir, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    summary.push({ product: p.n, asin: p.asin, priceNpr: record.suggestedValues.pricing.sellingPriceNpr, originalNpr: record.suggestedValues.pricing.originalPriceNpr, images: manifestImages.length });
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
