-- Source-only counterpart of 0095. No backfill or claimed historical approval.
CREATE TABLE product_legacy_observations(product_id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL UNIQUE,source_fingerprint VARCHAR(64) NOT NULL CHECK(length(source_fingerprint)=64),observed_json LONGTEXT NOT NULL CHECK(JSON_VALID(observed_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_legacy_observation_source BEFORE INSERT ON product_legacy_observations FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_publication_links l JOIN product_intake_drafts d ON d.id=l.draft_id JOIN products p ON p.id=l.product_id JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id WHERE l.product_id=NEW.product_id AND l.draft_id=NEW.draft_id AND d.owner_id=NEW.created_by AND s.user_id=NEW.created_by AND u.status='active' AND JSON_VALUE(NEW.observed_json,'$.product.id')=p.id AND JSON_VALUE(NEW.observed_json,'$.product.seller_id')=s.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_source'; END IF;
END$$
CREATE TRIGGER product_legacy_observation_immutable BEFORE UPDATE ON product_legacy_observations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_immutable'; END$$
CREATE TRIGGER product_legacy_observation_retained BEFORE DELETE ON product_legacy_observations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_retained'; END$$
DELIMITER ;

CREATE TABLE product_legacy_media_copies(draft_id VARCHAR(191) NOT NULL,source_media_id VARCHAR(191) NOT NULL,source_object_key TEXT NOT NULL,intake_media_id VARCHAR(191) NOT NULL UNIQUE,created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(draft_id,source_media_id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(source_media_id) REFERENCES product_media(id),FOREIGN KEY(intake_media_id) REFERENCES product_intake_media(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_legacy_media_copy_source BEFORE INSERT ON product_legacy_media_copies FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_legacy_observations o JOIN product_intake_drafts d ON d.id=o.draft_id JOIN product_media m ON m.product_id=o.product_id JOIN product_intake_media n ON n.draft_id=d.id JOIN users u ON u.id=d.owner_id WHERE d.id=NEW.draft_id AND m.id=NEW.source_media_id AND BINARY m.object_key=BINARY NEW.source_object_key AND n.id=NEW.intake_media_id AND n.owner_id=NEW.created_by AND d.owner_id=NEW.created_by AND n.state='ready' AND u.status='active' AND JSON_CONTAINS(o.observed_json,JSON_OBJECT('id',NEW.source_media_id,'object_key',NEW.source_object_key),'$.media')=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_source'; END IF;
END$$
CREATE TRIGGER product_legacy_media_copy_immutable BEFORE UPDATE ON product_legacy_media_copies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_immutable'; END$$
CREATE TRIGGER product_legacy_media_copy_retained BEFORE DELETE ON product_legacy_media_copies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_retained'; END$$
DELIMITER ;
