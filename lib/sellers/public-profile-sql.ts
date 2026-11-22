/** Current public presentation only. Legal identity and historical order snapshots have separate sources. */
export function publicProfileFieldSql(field:'publicName'|'publicCity'|'about'|'specialties',sellerExpression='seller_profiles.id'){
 if(!/^[a-z_]+\.[a-z_]+$/.test(sellerExpression))throw new Error('Invalid public profile source.');
 const column={publicName:'display_name',publicCity:'public_city',about:'about',specialties:'specialties'}[field];
 return `(SELECT public_presentation.${column} FROM seller_public_profile_states public_presentation WHERE public_presentation.seller_id=${sellerExpression})`;
}
