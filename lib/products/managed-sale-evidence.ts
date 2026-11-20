import {managedAgreementVersionSql} from '../db/repositories/managed-maker-details';

/** Current immutable acceptance, shared by public identity and sale eligibility. */
export function currentManagedSaleEvidence(seller:string,owner:string,now:number) {
 if(!/^[a-z_]+\.[a-z_]+$/.test(seller)||!/^[a-z_]+\.[a-z_]+$/.test(owner)||!Number.isSafeInteger(now)||now<0)throw new Error('Invalid managed evidence lookup.');
 const version=managedAgreementVersionSql(seller);
 return `FROM managed_maker_application_details d JOIN seller_documents document ON document.id=d.identity_document_id
  WHERE d.seller_id=${seller} AND d.agreement_accepted_by=${owner}
   AND document.seller_id=d.seller_id AND document.status<>'rejected' AND d.agreement_accepted_at<=${now}
   AND instr(document.object_key,'private/seller-documents/'||d.seller_id||'/')=1
   AND d.agreement_version=(${version}) AND json_extract(d.agreement_snapshot_json,'$.version')=(${version})
   AND COALESCE(json_extract(d.agreement_snapshot_json,'$.settingVersionIds.account'),'')=COALESCE((SELECT id FROM business_setting_versions
    WHERE setting_key='managed_maker_company_account' AND status='published' AND effective_from<=${now}
     AND (effective_until IS NULL OR effective_until>${now}) ORDER BY effective_from DESC,version DESC LIMIT 1),'')
   AND COALESCE(json_extract(d.agreement_snapshot_json,'$.settingVersionIds.retention'),'')=COALESCE((SELECT id FROM business_setting_versions
    WHERE setting_key='managed_sale_linked_platform_retention_bps' AND status='published' AND effective_from<=${now}
     AND (effective_until IS NULL OR effective_until>${now}) ORDER BY effective_from DESC,version DESC LIMIT 1),'')`;
}
