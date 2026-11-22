-- Source-only counterpart of 0094.

CREATE TABLE product_availability_events(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),kind VARCHAR(191) NOT NULL CHECK(kind IN ('owner_pause','owner_resume','owner_stop','owner_restore','staff_withdraw','staff_restore')),owner_paused BIGINT NOT NULL CHECK(owner_paused IN (0,1)),owner_withdrawn BIGINT NOT NULL CHECK(owner_withdrawn IN (0,1)),staff_withdrawn BIGINT NOT NULL CHECK(staff_withdrawn IN (0,1)),public_version_id VARCHAR(191),previous_event_id VARCHAR(191),actor_id VARCHAR(191) NOT NULL,reason TEXT NOT NULL CHECK(length(trim(reason))>=10),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(product_id,revision),UNIQUE(actor_id,request_id),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(previous_event_id) REFERENCES product_availability_events(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_availability_states(product_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL CHECK(revision>=0),owner_paused BIGINT NOT NULL CHECK(owner_paused IN (0,1)),owner_withdrawn BIGINT NOT NULL CHECK(owner_withdrawn IN (0,1)),staff_withdrawn BIGINT NOT NULL CHECK(staff_withdrawn IN (0,1)),last_event_id VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(last_event_id) REFERENCES product_availability_events(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER availability_event_source BEFORE INSERT ON product_availability_events FOR EACH ROW BEGIN
IF NEW.revision<>COALESCE((SELECT revision+1 FROM product_availability_states WHERE product_id=NEW.product_id),0)
 OR NOT(NEW.previous_event_id <=> (SELECT last_event_id FROM product_availability_states WHERE product_id=NEW.product_id))
 OR NEW.owner_paused<>CASE WHEN NEW.kind IN ('owner_pause','owner_stop') THEN 1 WHEN NEW.kind='owner_resume' THEN 0 ELSE COALESCE((SELECT owner_paused FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NEW.owner_withdrawn<>CASE WHEN NEW.kind='owner_stop' THEN 1 WHEN NEW.kind='owner_restore' THEN 0 ELSE COALESCE((SELECT owner_withdrawn FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NEW.staff_withdrawn<>CASE WHEN NEW.kind='staff_withdraw' THEN 1 WHEN NEW.kind='staff_restore' THEN 0 ELSE COALESCE((SELECT staff_withdrawn FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NOT EXISTS(SELECT 1 FROM users u JOIN products p ON p.id=NEW.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE u.id=NEW.actor_id AND u.status='active' AND ((NEW.kind LIKE 'owner_%' AND s.user_id=u.id AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','customer'))) OR (NEW.kind LIKE 'staff_%' AND s.user_id<>u.id AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin'))))
 OR (NEW.kind IN ('owner_resume','owner_restore','staff_restore') AND NOT EXISTS(SELECT 1 FROM product_publication_heads h JOIN products p ON p.id=h.product_id WHERE h.product_id=NEW.product_id AND h.current_version_id=NEW.public_version_id AND p.status='published'))
 OR (NEW.kind='owner_resume' AND (NEW.staff_withdrawn=1 OR NEW.owner_withdrawn=1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_source'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_source BEFORE INSERT ON product_availability_states FOR EACH ROW BEGIN
IF NEW.revision<>0 OR NOT EXISTS(SELECT 1 FROM product_availability_events e WHERE e.id=NEW.last_event_id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND e.owner_paused=NEW.owner_paused AND e.owner_withdrawn=NEW.owner_withdrawn AND e.staff_withdrawn=NEW.staff_withdrawn AND e.created_at=NEW.updated_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_source'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_revision BEFORE UPDATE ON product_availability_states FOR EACH ROW BEGIN
IF NEW.product_id<>OLD.product_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_availability_events e WHERE e.id=NEW.last_event_id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND e.owner_paused=NEW.owner_paused AND e.owner_withdrawn=NEW.owner_withdrawn AND e.staff_withdrawn=NEW.staff_withdrawn AND e.created_at=NEW.updated_at) OR NOT EXISTS(SELECT 1 FROM product_availability_events WHERE id=NEW.last_event_id AND previous_event_id=OLD.last_event_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_revision'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_event_immutable BEFORE UPDATE ON product_availability_events FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_event_retained BEFORE DELETE ON product_availability_events FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_retained'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_retained BEFORE DELETE ON product_availability_states FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_retained'; END IF;
END$$
DELIMITER ;
