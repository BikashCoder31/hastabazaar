import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {mapLegacyProductOffer} from '../../lib/products/offer-inventory';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';

/** Explicit retained-product mapping and current selection in an isolated memory fixture. */
export async function addCommissionRegressionOffer(f:{database:D1Database;sqlite:DatabaseSync},input:{productId:string;reviewerId:string;tokenHash:string;now:number}) {
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const mapped=await mapLegacyProductOffer(f.database,{actorId:input.reviewerId,requestId:'regression-map-'+input.productId,expectedRevision:null,now:input.now},{productId:input.productId,reason:'Review the retained fictional item and explicitly map its original independent physical stock.',physicalMapping:{baseUnit:'piece',unitsPerOffer:1,stockFamilyKey:'regression-stock-'+input.productId}});
 const set=await getPublicOfferSet(f.database,input.productId,input.now);
 assert.ok(set?.orderable,'The verified seller and retained product must actually permit the selected offer.');
 const offer=set.offers.find(row=>row.id===mapped.offerId);
 assert.ok(offer?.orderable);
 await addOfferCartLine(f.database,input.tokenHash,{productId:input.productId,offerId:offer.id,versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:offer.pricePaisa,quantity:1,requestId:'regression-cart-add-'+input.productId},input.now);
 return mapped;
}
