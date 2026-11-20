import {listOfferCartLines,updateOfferCartLine,type CartSelectedOffer,type UpdateOfferCartChoice} from '../../cart/offer-cart';
import {publicCatalogueQuery} from '../../products/public-catalogue-query';
import {publicProductVisibility} from '../../products/eligibility';
import {sellerOrderReadinessGuards} from '../../sellers/order-readiness-guards';
import {CartConflictError,MAX_ITEM_QUANTITY,MAX_CART_LINES,writeCart,cartGuard,findCart,getOrCreateCart} from '../../cart/storage';
export {CartConflictError} from '../../cart/storage';
import {currentProductMediaSql,currentProductMediaOrder} from '../../products/publication-media';
import { publicProductEligibility } from '@/lib/products/eligibility';
import {publicProfileFieldSql} from '@/lib/sellers/public-profile-sql';
import { publicProductName } from '@/lib/products/truthful-presentation';
import {
  publicSellingIdentityColumns,
  type PublicSellingIdentity,
} from '../../products/selling-identity';
export interface CartItemRow extends Partial<PublicSellingIdentity> {
  id: string;
  productId: string;
  sellerId: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  tradingName: string;
  pricePaisa: number | null;
  offerId?:string;offerVersionId?:string;publicVersionId?:string|null;revision?:number;selectedOffer?:CartSelectedOffer;
  requiresOfferSelection?:boolean|number;unavailableReason?:string|null;
  currentChoice?:{versionId:string;publicVersionId:string|null;pricePaisa:number;orderable:boolean}|null;
  quantity: number;
  inventoryQuantity: number;
  preparationDays: number;
  productStatus: string;
  primaryMediaId: string | null;
}

export interface CartView {
  items: readonly CartItemRow[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

export async function getCart(
  database: D1Database,
  tokenHash: string,
): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (!cart)
    return {
      items: [],
      itemSubtotalPaisa: 0,
      itemCount: 0,
      hasUnavailableItems: false,
    };
  const catalogue=await publicCatalogueQuery(database);
  const result = await database
    .prepare(
      `${catalogue.withClause} SELECT ${publicSellingIdentityColumns(catalogue.now)}, cart_items.created_at AS createdAt, CASE WHEN ${catalogue.mapped()} THEN 1 ELSE 0 END AS requiresOfferSelection, cart_items.id, cart_items.product_id AS productId,
        products.seller_id AS sellerId,
        products.slug, CASE WHEN ${publicProductVisibility('products',catalogue.now)} THEN products.name_en ELSE 'Unavailable product' END AS nameEn, CASE WHEN ${publicProductVisibility('products',catalogue.now)} THEN products.name_ne ELSE NULL END AS nameNe,
        ${publicProfileFieldSql('publicName')} AS tradingName,
        CASE WHEN ${publicProductVisibility('products',catalogue.now)} AND NOT (${catalogue.mapped()}) THEN products.price_paisa ELSE NULL END AS pricePaisa, cart_items.quantity,
        products.inventory_quantity AS inventoryQuantity,
        products.preparation_days AS preparationDays,
        CASE WHEN ${catalogue.purchasable()} AND NOT (${catalogue.mapped()}) THEN 'published' ELSE 'archived' END AS productStatus,
        (SELECT product_media.id FROM product_media
          WHERE product_media.product_id = products.id AND ${currentProductMediaSql('product_media')}
          ORDER BY ${currentProductMediaOrder('product_media')} ASC LIMIT 1) AS primaryMediaId
       FROM cart_items
       INNER JOIN products ON products.id = cart_items.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       WHERE cart_items.cart_id = ?
       ORDER BY cart_items.created_at ASC`,
    )
    .bind(cart.id)
    .all<CartItemRow&{createdAt:number}>();
  const items=[...result.results,...await listOfferCartLines(database,cart.id,catalogue.now)].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(({createdAt:_,...item})=>({...item,nameEn:publicProductName(item.nameEn),...(item.requiresOfferSelection?{unavailableReason:'Choose a current product option before checkout.'}:{})}));
  return {
    items,
    itemSubtotalPaisa: items.reduce(
      (total, item) => total + (item.pricePaisa===null?0:item.pricePaisa * item.quantity),
      0,
    ),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    hasUnavailableItems: items.some(
      (item) =>
        item.pricePaisa===null || item.productStatus !== 'published' ||
        item.inventoryQuantity < item.quantity,
    ),
  };
}

export async function addCartItem(
  database: D1Database,
  tokenHash: string,
  productId: string,
  quantity: number,
  now: number,
): Promise<CartView> {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    throw new CartConflictError(
      `Choose a quantity from 1 to ${MAX_ITEM_QUANTITY}.`,
    );
  }
  const product = await database
    .prepare(
      `SELECT inventory_quantity AS inventoryQuantity,seller_id AS sellerId FROM products WHERE id = ? AND ${publicProductEligibility('products',now)} AND NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=products.id AND inventory_mapped=1) LIMIT 1`,
    )
    .bind(productId)
    .first<{ inventoryQuantity: number;sellerId:string }>();
  if (!product || product.inventoryQuantity < 1)
    throw new CartConflictError('This product is currently unavailable.');
  let readiness:D1PreparedStatement[];try{readiness=await sellerOrderReadinessGuards(database,product.sellerId,now);}catch{throw new CartConflictError('This seller is not currently accepting orders for this product.');}
  const cart = await getOrCreateCart(database, tokenHash, now);
  const guard = cartGuard(
    database,
    `
    EXISTS(SELECT 1 FROM carts WHERE id=? AND anonymous_token_hash=?)
    AND EXISTS(SELECT 1 FROM products WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=products.id AND inventory_mapped=1) AND inventory_quantity >= COALESCE((SELECT quantity FROM cart_items WHERE cart_id=? AND product_id=?),0)+?)
    AND COALESCE((SELECT quantity FROM cart_items WHERE cart_id=? AND product_id=?),0)+?<=?
    AND (EXISTS(SELECT 1 FROM cart_items WHERE cart_id=? AND product_id=?)
      OR ((SELECT COUNT(*) FROM cart_items WHERE cart_id=?)+(SELECT COUNT(*) FROM cart_offer_lines WHERE cart_id=?))<?)`,
    [
      cart.id,
      tokenHash,
      productId,
      cart.id,
      productId,
      quantity,
      cart.id,
      productId,
      quantity,
      MAX_ITEM_QUANTITY,
      cart.id,
      productId,
      cart.id,
      cart.id,
      MAX_CART_LINES,
    ],
  );
  await writeCart(database, cart.id, now, [
    guard[0],
    ...readiness,
    ...cartGuard(database,`EXISTS(SELECT 1 FROM products WHERE id=? AND ${publicProductEligibility('products',now)})`,[productId]),
    database
      .prepare(
        'UPDATE cart_items SET quantity=quantity+?,updated_at=? WHERE cart_id=? AND product_id=?',
      )
      .bind(quantity, now, cart.id, productId),
    database
      .prepare(`INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM cart_items WHERE cart_id=? AND product_id=?)`)
      .bind(
        crypto.randomUUID(),
        cart.id,
        productId,
        quantity,
        now,
        now,
        cart.id,
        productId,
      ),
    guard[1],
  ]);
  return getCart(database, tokenHash);
}

export async function updateCartItem(
  database: D1Database,
  tokenHash: string,
  itemId: string,
  quantity: number,
  now: number,
  offerUpdate?:Omit<UpdateOfferCartChoice,'itemId'|'quantity'>,
): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (!cart) throw new CartConflictError('Cart not found.');
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    throw new CartConflictError(
      `Choose a quantity from 0 to ${MAX_ITEM_QUANTITY}.`,
    );
  }
  if (quantity === 0) {
    return removeCartItem(database, tokenHash, itemId);
  }
  const selected=await database.prepare('SELECT 1 FROM cart_offer_lines WHERE id=? AND cart_id=?').bind(itemId,cart.id).first();
  if(selected){if(!offerUpdate)throw new CartConflictError('Review the current saved option before changing its quantity.');await updateOfferCartLine(database,tokenHash,{...offerUpdate,itemId,quantity},now);return getCart(database,tokenHash);}
  const item = await database
    .prepare(
      `SELECT products.inventory_quantity AS inventoryQuantity, products.status,products.seller_id AS sellerId,products.id AS productId
       FROM cart_items INNER JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.id = ? AND cart_items.cart_id = ? LIMIT 1`,
    )
    .bind(itemId, cart.id)
    .first<{ inventoryQuantity: number; status: string;sellerId:string;productId:string }>();
  if (!item) throw new CartConflictError('Cart item not found.');
  if (item.status !== 'published' || item.inventoryQuantity < quantity) {
    throw new CartConflictError(
      `Only ${item.inventoryQuantity} currently available.`,
    );
  }
  let readiness:D1PreparedStatement[];try{readiness=await sellerOrderReadinessGuards(database,item.sellerId,now);}catch{throw new CartConflictError('This seller is not currently accepting orders for this product.');}
  const guard = cartGuard(
    database,
    `EXISTS(SELECT 1 FROM cart_items JOIN products ON products.id=cart_items.product_id
    WHERE cart_items.id=? AND cart_items.cart_id=? AND NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=products.id AND inventory_mapped=1) AND products.inventory_quantity>=?)`,
    [itemId, cart.id, quantity],
  );
  await writeCart(database, cart.id, now, [
    guard[0],
    ...readiness,
    ...cartGuard(database,`EXISTS(SELECT 1 FROM products WHERE id=? AND ${publicProductEligibility('products',now)})`,[item.productId]),
    database
      .prepare(
        `UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND cart_id = ?`,
      )
      .bind(quantity, now, itemId, cart.id),
    guard[1],
  ]);
  return getCart(database, tokenHash);
}

export async function removeCartItem(
  database: D1Database,
  tokenHash: string,
  itemId: string,
): Promise<CartView> {
  const cart = await findCart(database, tokenHash);
  if (cart)
    await writeCart(database, cart.id, Date.now(), [
      database.prepare('DELETE FROM cart_offer_lines WHERE id=? AND cart_id=?').bind(itemId,cart.id),
      database
        .prepare(`DELETE FROM cart_items WHERE id = ? AND cart_id = ?`)
        .bind(itemId, cart.id),
    ]);
  return getCart(database, tokenHash);
}

export async function getCartId(
  database: D1Database,
  tokenHash: string,
): Promise<string | null> {
  return (await findCart(database, tokenHash))?.id ?? null;
}
