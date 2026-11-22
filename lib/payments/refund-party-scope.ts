import { liveSnapshotPartySql } from '../managed-commerce/live-financial-party-sql';
import { responseScopeContains } from '../orders/response-sql';

/** Follow the native returned-credit record even when the retry has no order ID of its own. */
export function linkedOriginalRefundConflictSql(db: D1Database, receiptSql: string, actorSql: string) {
  const jsonValue = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  const retainedParty = (field: 'ownerId' | 'customerId' | 'originalCustomerId') => `${jsonValue}(linked_recovery.original_source_json,'$.${field}')`;

  return `EXISTS(
    SELECT 1 FROM customer_refund_reversals linked_return
    JOIN refund_obligations linked_original ON linked_original.id=linked_return.obligation_id
    JOIN company_money_receipts linked_receipt ON linked_receipt.id=linked_return.receipt_id
    LEFT JOIN company_payment_account_versions receiving_account ON receiving_account.id=linked_receipt.account_version_id
    LEFT JOIN company_payment_accounts account_head ON account_head.id=receiving_account.account_id
    LEFT JOIN company_payment_account_versions latest_account ON latest_account.id=account_head.latest_version_id
    WHERE linked_return.receipt_id=${receiptSql} AND (
      linked_original.customer_id=${actorSql}
      OR EXISTS(SELECT 1 FROM order_items linked_item JOIN seller_profiles linked_seller ON linked_seller.id=linked_item.seller_id
        WHERE linked_item.order_id=linked_original.order_id AND linked_seller.user_id=${actorSql})
      OR EXISTS(SELECT 1 FROM seller_recovery_cases linked_recovery WHERE linked_recovery.refund_id=linked_original.source_id
        AND (${retainedParty('ownerId')}=${actorSql} OR ${retainedParty('customerId')}=${actorSql}
          OR ${retainedParty('originalCustomerId')}=${actorSql}))
      OR EXISTS(SELECT 1 FROM managed_commercial_snapshots linked_snapshot
        JOIN order_items linked_managed_item ON linked_managed_item.id=linked_snapshot.order_item_id
        WHERE linked_managed_item.order_id=linked_original.order_id AND ${liveSnapshotPartySql('linked_snapshot', actorSql)})
      OR receiving_account.id IS NULL OR latest_account.id IS NULL
      OR ${responseScopeContains(db, 'receiving_account.conflicts_json', actorSql)}
      OR ${responseScopeContains(db, 'latest_account.conflicts_json', actorSql)}
    )
  )`;
}
