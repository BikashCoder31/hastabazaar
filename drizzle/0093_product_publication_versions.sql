-- Source only. Candidate/publication history is separate from operational stock.
CREATE TABLE product_publication_links(draft_id TEXT PRIMARY KEY REFERENCES product_intake_drafts(id),product_id TEXT NOT NULL UNIQUE REFERENCES products(id),base_version_id TEXT REFERENCES product_publication_candidates(id),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
--> statement-breakpoint
CREATE TABLE product_publication_candidates(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),case_id TEXT NOT NULL REFERENCES product_intake_cases(id),workspace_version_id TEXT NOT NULL REFERENCES product_intake_workspace_versions(id),offer_version_id TEXT NOT NULL UNIQUE REFERENCES product_offer_versions(id),category_version_id TEXT NOT NULL REFERENCES category_template_versions(id),base_version_id TEXT REFERENCES product_publication_candidates(id),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_publication_decisions(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES product_publication_candidates(id),action TEXT NOT NULL CHECK(action IN ('approve_only','approve_and_publish','publish_approved','request_changes','reject')),review_json TEXT NOT NULL CHECK(json_valid(review_json)),public_json TEXT CHECK(public_json IS NULL OR json_valid(public_json)),ordering_facts_ready INTEGER NOT NULL DEFAULT 0 CHECK(ordering_facts_ready IN (0,1)),actor_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_publication_heads(product_id TEXT PRIMARY KEY REFERENCES products(id),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),pending_version_id TEXT REFERENCES product_publication_candidates(id),current_version_id TEXT REFERENCES product_publication_candidates(id),approved_decision_id TEXT REFERENCES product_publication_decisions(id),current_publication_id TEXT REFERENCES product_publication_decisions(id),last_event_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_publication_media(version_id TEXT NOT NULL REFERENCES product_publication_candidates(id),media_id TEXT NOT NULL REFERENCES product_media(id),sort_order INTEGER NOT NULL CHECK(sort_order>=0),PRIMARY KEY(version_id,media_id),UNIQUE(version_id,sort_order));
--> statement-breakpoint
CREATE INDEX product_publication_candidates_case ON product_publication_candidates(case_id,created_at);
--> statement-breakpoint
CREATE TRIGGER product_publication_link_source BEFORE INSERT ON product_publication_links WHEN NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN products p ON p.seller_id=d.seller_id WHERE d.id=NEW.draft_id AND p.id=NEW.product_id) BEGIN SELECT RAISE(ABORT,'publication_link_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_link_revision BEFORE UPDATE ON product_publication_links WHEN NEW.draft_id IS NOT OLD.draft_id OR NEW.product_id IS NOT OLD.product_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=NEW.product_id AND current_version_id IS NEW.base_version_id) BEGIN SELECT RAISE(ABORT,'publication_link_revision'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_candidate_source BEFORE INSERT ON product_publication_candidates WHEN NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_publication_links l ON l.draft_id=c.draft_id JOIN product_intake_workspace_versions v ON v.id=c.version_id JOIN product_offer_versions o ON o.product_id=l.product_id JOIN category_template_versions category ON category.category_id=json_extract(v.snapshot_json,'$.categoryId') WHERE c.id=NEW.case_id AND c.version_id=NEW.workspace_version_id AND l.product_id=NEW.product_id AND ((v.kind='private' AND l.base_version_id IS NEW.base_version_id) OR (v.kind='review_only' AND v.base_public_version_id=NEW.base_version_id AND EXISTS(SELECT 1 FROM product_publication_heads h WHERE h.product_id=l.product_id AND h.current_version_id=NEW.base_version_id))) AND o.id=NEW.offer_version_id AND o.matrix_json=json_extract(v.snapshot_json,'$.offers') AND category.id=NEW.category_version_id) BEGIN SELECT RAISE(ABORT,'publication_candidate_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_candidate_immutable BEFORE UPDATE ON product_publication_candidates BEGIN SELECT RAISE(ABORT,'publication_candidate_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_candidate_retained BEFORE DELETE ON product_publication_candidates BEGIN SELECT RAISE(ABORT,'publication_candidate_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_decision_immutable BEFORE UPDATE ON product_publication_decisions BEGIN SELECT RAISE(ABORT,'publication_decision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_decision_retained BEFORE DELETE ON product_publication_decisions BEGIN SELECT RAISE(ABORT,'publication_decision_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_head_revision BEFORE UPDATE ON product_publication_heads WHEN NEW.product_id IS NOT OLD.product_id OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'publication_head_revision'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_head_source_insert BEFORE INSERT ON product_publication_heads WHEN (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR NEW.current_version_id IS NOT NULL OR NEW.current_publication_id IS NOT NULL OR NEW.approved_decision_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'publication_head_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_head_source_update BEFORE UPDATE ON product_publication_heads WHEN (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR (NEW.current_version_id IS NULL)<>(NEW.current_publication_id IS NULL) OR (NEW.current_publication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.current_publication_id AND c.id=NEW.current_version_id AND c.product_id=NEW.product_id AND d.action IN ('approve_and_publish','publish_approved') AND d.public_json IS NOT NULL)) OR (NEW.approved_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.approved_decision_id AND c.product_id=NEW.product_id AND d.action IN ('approve_only','approve_and_publish') AND d.public_json IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'publication_head_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_media_source BEFORE INSERT ON product_publication_media WHEN NOT EXISTS(SELECT 1 FROM product_publication_candidates c JOIN product_intake_workspace_versions v ON v.id=c.workspace_version_id JOIN product_media m ON m.product_id=c.product_id, json_each(v.snapshot_json,'$.mediaIds') attachment WHERE c.id=NEW.version_id AND m.id=NEW.media_id AND attachment.value=NEW.media_id) BEGIN SELECT RAISE(ABORT,'publication_media_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_media_immutable BEFORE UPDATE ON product_publication_media BEGIN SELECT RAISE(ABORT,'publication_media_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_publication_media_retained BEFORE DELETE ON product_publication_media BEGIN SELECT RAISE(ABORT,'publication_media_retained'); END;

--> statement-breakpoint
CREATE TRIGGER product_review_only_source BEFORE INSERT ON product_intake_workspace_versions WHEN NEW.kind='review_only' AND NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN product_publication_links l ON l.draft_id=d.id JOIN product_publication_heads h ON h.product_id=l.product_id WHERE d.id=NEW.draft_id AND d.revision=NEW.revision AND d.owner_id=NEW.created_by AND h.current_version_id=NEW.base_public_version_id) BEGIN SELECT RAISE(ABORT,'product_review_only_source'); END;
