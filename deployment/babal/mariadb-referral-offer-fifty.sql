-- Apply after the referrals/wallet migration, during deployment maintenance.
-- Repeat imports do not overwrite later Super Admin settings. Do not delete the audit marker.
START TRANSACTION;
-- One-time owner-requested offer change. Existing redemptions and wallet entries are untouched.
UPDATE referral_campaign
SET friend_discount_paisa=5000, reward_paisa=5000, updated_at=UNIX_TIMESTAMP()*1000
WHERE id='default' AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE id='release-referrals-fifty-20260911');

INSERT IGNORE INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
SELECT 'release-referrals-fifty-20260911',NULL,'referral.offer.migrated','referral_campaign','default',
'Owner requested NPR 50 for both future referral discount and reward; historical amounts retained.',
'{"friendDiscountPaisa":5000,"rewardPaisa":5000}',UNIX_TIMESTAMP()*1000
WHERE EXISTS (SELECT 1 FROM referral_campaign WHERE id='default');

COMMIT;

