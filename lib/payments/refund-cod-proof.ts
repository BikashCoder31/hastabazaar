function column(alias: string, name: string) {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Use an internal COD proof alias.');
  return `${alias}.${name}`;
}

/** Cash independently recorded against this exact parcel. */
export function postedCodCollectionSql(db: D1Database, parcelAlias: string) {
  const job = column(parcelAlias, 'shipping_job_id');
  const characterLength = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'CHAR_LENGTH' : 'length';
  return `COALESCE((SELECT SUM(collection.amount_paisa) FROM parcel_cash_records collection
    WHERE collection.shipping_job_id=${job} AND HEX(collection.shipping_job_id)=HEX(${job})
      AND collection.kind='collection' AND collection.status='posted'
      AND ${characterLength}(trim(collection.evidence_reference))>=4),0)`;
}

export function pendingCodCollectionSql(parcelAlias: string) {
  const job = column(parcelAlias, 'shipping_job_id');
  return `EXISTS(SELECT 1 FROM parcel_cash_records collection
    WHERE collection.shipping_job_id=${job} AND HEX(collection.shipping_job_id)=HEX(${job})
      AND collection.kind='collection' AND collection.status='pending')`;
}

/** Only reconciled outbound collections can back a transfer. The courier may still hold that cash. */
export function verifiedCodCashSql(db: D1Database, orderAlias: string, originalItemAlias?: string) {
  const order = column(orderAlias, 'id');
  const seller = originalItemAlias ? column(originalItemAlias, 'seller_id') : null;
  return `COALESCE((SELECT SUM(cod_parcel.collected_paisa)
    FROM shipping_parcels cod_parcel JOIN shipping_jobs cod_job ON cod_job.id=cod_parcel.shipping_job_id
      AND HEX(cod_job.id)=HEX(cod_parcel.shipping_job_id)
    WHERE cod_job.order_id=${order} AND HEX(cod_job.order_id)=HEX(${order}) AND cod_job.direction='outbound'
      ${seller ? `AND cod_job.seller_id=${seller} AND HEX(cod_job.seller_id)=HEX(${seller})` : ''}
      AND cod_parcel.collected_paisa>0 AND cod_parcel.collected_paisa<=cod_parcel.cod_due_paisa
      AND cod_parcel.collected_paisa=${postedCodCollectionSql(db, 'cod_parcel')}
      AND NOT ${pendingCodCollectionSql('cod_parcel')}),0)`;
}
