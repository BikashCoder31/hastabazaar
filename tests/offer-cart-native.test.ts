import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {verifySellerDocument} from '../lib/sellers/document-review';
import {getRegisteredSellerTerms,prepareSellerCommissionAcceptance} from '../lib/db/repositories/marketplace-settings';
import {mapLegacyProductOffer,getOfferStock,pauseOfferStock} from '../lib/products/offer-inventory';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine,updateOfferCartLine} from '../lib/cart/offer-cart';
import {getCart,addCartItem,updateCartItem} from '../lib/db/repositories/cart';
void test('random nonpersistent native D1 preserves exact cart receipts, owner scope, stock guards and independent company evidence',async()=>{
 const f=await createIncentiveDb(),now=Date.now()-60_000;
 try{
  await f.db.batch([
   f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('owner','owner@local.hastabazaar.test','Fictional owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1)"),
   f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','seller',1),('reviewer','super_admin',1)"),
   f.db.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id) VALUES('native-cart-terms','independent_seller_commission_bps',1,'1200','published',1,'controlled',1,'Explicit fictional current contract for this isolated native test','reviewer',1,'native-cart-terms')"),
   f.db.prepare("INSERT INTO seller_profiles(id,user_id,applicant_type,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('seller','owner','company','Fictional Company','Fictional Shop','Fixture','FIX-CART','PAN','FIX-PAN','Fictional Owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','approved',1,1)"),
   f.db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cup','native-cart-cup','Fictional cups',1,0,1,1)"),
   f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('p','seller','cup','native-cart-product','FICTIONAL-NATIVE-CART','Fictional retained cup','An explicitly retained original approved fixture row.',12550,2,'Fictional maker','NP','Clay','published',1,1)")
  ]);
  for(const kind of ['representative_identity','pan_certificate','business_registration']){
   await f.db.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,'seller',?,?,'fictional.png','image/png',100,'pending',?)").bind(kind,kind,'private/fixture/'+kind,now).run();
   await verifySellerDocument(f.db,{sellerId:'seller',documentId:kind,actorId:'reviewer',reason:'Independently verify this exact fictional company evidence.',commandId:'native-verify-'+kind,now:now+1,expectedReviewId:null});
  }
  const terms=await getRegisteredSellerTerms(f.db,now+2),accepted=await prepareSellerCommissionAcceptance(f.db,{sellerId:'seller',actorId:'owner',context:terms.context,requestId:'native-owner-terms',now:now+2,mode:'approved_seller'});
  await f.db.batch([f.db.prepare("UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id='seller'").bind(terms.agreementVersion,now+2),...accepted.statements]);
  const mapped=await mapLegacyProductOffer(f.db,{actorId:'reviewer',requestId:'native-cart-mapping',expectedRevision:null,now:now+3},{productId:'p',reason:'Review this original fixture SKU and its exact independent physical unit.',physicalMapping:{baseUnit:'piece',unitsPerOffer:1,stockFamilyKey:'native-cup'}}),set=await getPublicOfferSet(f.db,'p',now+4);assert.equal(set?.orderable,true);
  await f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('legacy-p','seller','cup','native-legacy-cart-product','FICTIONAL-LEGACY-CART','Retained legacy fixture','An explicit isolated legacy baseline.',20000,3,'Fictional maker','NP','Clay','published',1,1)").run();
  const legacy=await addCartItem(f.db,'native-legacy-cart','legacy-p',1,now+4);assert.equal(legacy.itemCount,1);assert.equal((await updateCartItem(f.db,'native-legacy-cart',legacy.items[0].id,2,now+4)).itemCount,2);
  const choice={productId:'p',offerId:mapped.offerId,versionId:mapped.versionId,publicVersionId:null,pricePaisa:12550,quantity:1,requestId:'native-cart-request-001'};
  await Promise.all([addOfferCartLine(f.db,'native-cart',choice,now+4),addOfferCartLine(f.db,'native-cart',choice,now+4)]);let cart=await getCart(f.db,'native-cart');assert.equal(cart.items.length,1);assert.equal(cart.itemCount,1);assert.equal(cart.itemSubtotalPaisa,12550);assert.equal((await getOfferStock(f.db,mapped.offerId))?.available,2);assert.equal((await getOfferStock(f.db,mapped.offerId))?.reserved,0);
  const attempts=await Promise.allSettled(['a','b'].map(suffix=>addOfferCartLine(f.db,'native-cart',{...choice,requestId:'native-additional-'+suffix},now+5)));assert.equal(attempts.filter(row=>row.status==='fulfilled').length,1);cart=await getCart(f.db,'native-cart');assert.equal(cart.itemCount,2);
  await assert.rejects(()=>addCartItem(f.db,'native-cart','p',1,now+6));const line=cart.items[0];assert.ok(line.revision!==undefined);
  await assert.rejects(()=>updateOfferCartLine(f.db,'foreign-cart',{itemId:line.id,quantity:1,revision:line.revision!,requestId:'native-foreign-edit'},now+6));
  const before=await f.db.prepare('SELECT COUNT(*) AS n FROM cart_offer_commands').first<{n:number}>();let changed=false;
  const racing={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!changed){changed=true;const stock=await getOfferStock(f.db,mapped.offerId);await pauseOfferStock(f.db,{actorId:'owner',requestId:'native-cart-stock-pause',expectedRevision:String(stock?.revision),now:now+7},{offerId:mapped.offerId,paused:true,reason:'An independent owner action changed this exact option before the cart commit.'});}return f.db.batch(statements);}} as D1Database;
  await assert.rejects(()=>updateOfferCartLine(racing,'native-cart',{itemId:line.id,quantity:1,revision:line.revision!,requestId:'native-guarded-update'},now+7));assert.equal((await getCart(f.db,'native-cart')).itemCount,2);assert.deepEqual(await f.db.prepare('SELECT COUNT(*) AS n FROM cart_offer_commands').first(),before);
  await addOfferCartLine(f.db,'native-cart',choice,now+8);cart=await getCart(f.db,'native-cart');assert.equal(cart.itemCount,2);assert.equal(cart.hasUnavailableItems,true);assert.equal((await getOfferStock(f.db,mapped.offerId))?.paused,1);
 }finally{await f.dispose();}
});
