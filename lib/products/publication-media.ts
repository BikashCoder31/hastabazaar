/** Code-owned SQL projections: retained historical files are not current public media. */
function alias(value:string){if(!/^[a-z_]+$/.test(value))throw new Error('Use a code-owned media alias.');return value;}
export function currentProductMediaSql(media='product_media'){
 const m=alias(media);return `(NOT EXISTS(SELECT 1 FROM product_publication_heads media_head WHERE media_head.product_id=${m}.product_id) OR EXISTS(SELECT 1 FROM product_publication_heads media_head JOIN product_publication_media current_media ON current_media.version_id=media_head.current_version_id WHERE media_head.product_id=${m}.product_id AND current_media.media_id=${m}.id))`;
}
export function currentProductMediaOrder(media='product_media'){
 const m=alias(media);return `COALESCE((SELECT current_media.sort_order FROM product_publication_heads media_head JOIN product_publication_media current_media ON current_media.version_id=media_head.current_version_id WHERE media_head.product_id=${m}.product_id AND current_media.media_id=${m}.id),${m}.sort_order)`;
}
