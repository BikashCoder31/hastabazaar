-- Source-only MariaDB counterpart of 0087. No category is automatically mapped or enabled.
CREATE TABLE category_template_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,category_id VARCHAR(191) NOT NULL,version BIGINT NOT NULL CHECK(version>0),
 contract_json LONGTEXT NOT NULL CHECK(json_valid(contract_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 reason VARCHAR(1000) NOT NULL CHECK(CHAR_LENGTH(trim(reason)) BETWEEN 10 AND 1000),UNIQUE(category_id,version),
 FOREIGN KEY (category_id) REFERENCES categories(id),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE category_template_states (
 category_id VARCHAR(191) PRIMARY KEY NOT NULL,version_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL CHECK(revision>=0),last_event_id VARCHAR(191) NOT NULL,updated_by VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (category_id) REFERENCES categories(id),
 FOREIGN KEY (version_id) REFERENCES category_template_versions(id),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_drafts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,owner_id VARCHAR(191) NOT NULL,seller_id VARCHAR(191) NOT NULL,
 product_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),category_id VARCHAR(191),
 answers_json LONGTEXT NOT NULL CHECK(json_valid(answers_json)),category_change_json LONGTEXT CHECK(category_change_json IS NULL OR json_valid(category_change_json)),
 created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (owner_id) REFERENCES users(id),
 FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,draft_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),category_id VARCHAR(191),
 answers_json LONGTEXT NOT NULL CHECK(json_valid(answers_json)),category_contract_version_id VARCHAR(191),created_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL UNIQUE,UNIQUE(draft_id,revision),
 FOREIGN KEY (draft_id) REFERENCES product_intake_drafts(id),
 FOREIGN KEY (category_contract_version_id) REFERENCES category_template_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER category_template_version_immutable BEFORE UPDATE ON category_template_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_version_retention BEFORE DELETE ON category_template_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_head_valid BEFORE UPDATE ON category_template_states FOR EACH ROW BEGIN
IF BINARY NEW.category_id<>BINARY OLD.category_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM category_template_versions WHERE id=NEW.version_id AND category_id=NEW.category_id AND version=NEW.revision+1) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_head_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_head_retention BEFORE DELETE ON category_template_states FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_owner_immutable BEFORE UPDATE ON product_intake_drafts FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.owner_id<>BINARY OLD.owner_id OR BINARY NEW.seller_id<>BINARY OLD.seller_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_revision_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_version_immutable BEFORE UPDATE ON product_intake_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_version_retention BEFORE DELETE ON product_intake_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_version_immutable';
END$$
DELIMITER ;
