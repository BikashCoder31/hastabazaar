-- Source-only native observations. No legacy period, orderability or price is inferred.
CREATE TABLE product_orderable_price_observations (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),
 offer_version_id TEXT NOT NULL REFERENCES product_offer_versions(id),
 public_version_id TEXT NOT NULL REFERENCES product_publication_candidates(id),
 publication_id TEXT NOT NULL REFERENCES product_publication_decisions(id),
 physical_json TEXT NOT NULL,
 scope_json TEXT NOT NULL,
 selling_paisa INTEGER NOT NULL CHECK(selling_paisa>0),
 currency TEXT NOT NULL CHECK(currency='NPR'),
 observed_at INTEGER NOT NULL CHECK(observed_at>=0),
 actor_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX product_orderable_price_history ON product_orderable_price_observations(product_id,seller_id,observed_at);
--> statement-breakpoint
CREATE TRIGGER orderable_price_observation_immutable BEFORE UPDATE ON product_orderable_price_observations BEGIN SELECT RAISE(ABORT,'orderable_price_observation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER orderable_price_observation_retained BEFORE DELETE ON product_orderable_price_observations BEGIN SELECT RAISE(ABORT,'orderable_price_observation_retained'); END;

--> statement-breakpoint
-- Preserve the entire incoming-FK chain with checks enabled. Execute this migration
-- in one transaction; no public observations or prior approvals are inferred.
CREATE TABLE product_price_reference_reviews_next(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),offer_id TEXT NOT NULL,version_id TEXT NOT NULL REFERENCES product_offer_versions(id),review_revision INTEGER NOT NULL,physical_json TEXT NOT NULL,selling_paisa INTEGER NOT NULL CHECK(selling_paisa>0),compare_paisa INTEGER NOT NULL CHECK(compare_paisa>selling_paisa),decision TEXT NOT NULL CHECK(decision IN ('approved','suppressed')),evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('historical_order','external_offer','review_finding','platform_orderable')),evidence_reference TEXT NOT NULL,offered_from INTEGER,offered_to INTEGER,reason TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,history_basis TEXT,CHECK((evidence_kind='platform_orderable' AND history_basis IS NOT NULL AND length(trim(history_basis))>=10) OR (evidence_kind<>'platform_orderable' AND history_basis IS NULL)),UNIQUE(product_id,offer_id,version_id,review_revision),CHECK((evidence_kind='review_finding' AND decision='suppressed' AND offered_from IS NULL AND offered_to IS NULL) OR (evidence_kind<>'review_finding' AND offered_from IS NOT NULL AND offered_to IS NOT NULL AND offered_from>=0 AND offered_to>=offered_from AND offered_to<=created_at)));
--> statement-breakpoint
CREATE TABLE product_discount_cycles_next(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),reference_id TEXT NOT NULL REFERENCES product_price_reference_reviews_next(id),selling_paisa INTEGER NOT NULL,compare_paisa INTEGER NOT NULL,price_text TEXT NOT NULL,compare_text TEXT NOT NULL,first_published_at INTEGER NOT NULL,visible_since INTEGER,dismissed_at INTEGER,day23 TEXT NOT NULL DEFAULT 'pending' CHECK(day23 IN ('pending','sent','skipped')),day29 TEXT NOT NULL DEFAULT 'pending' CHECK(day29 IN ('pending','sent','skipped')),revision INTEGER NOT NULL DEFAULT 0,UNIQUE(product_id,offer_id,selling_paisa,compare_paisa),CHECK(selling_paisa>0 AND compare_paisa>selling_paisa AND revision>=0));
--> statement-breakpoint
CREATE TABLE product_discount_advisory_items_next(advisory_id TEXT NOT NULL REFERENCES product_discount_advisories(id),cycle_id TEXT NOT NULL REFERENCES product_discount_cycles_next(id),PRIMARY KEY(advisory_id,cycle_id));
--> statement-breakpoint
INSERT INTO product_price_reference_reviews_next SELECT *,NULL FROM product_price_reference_reviews;
--> statement-breakpoint
INSERT INTO product_discount_cycles_next SELECT * FROM product_discount_cycles;
--> statement-breakpoint
INSERT INTO product_discount_advisory_items_next SELECT * FROM product_discount_advisory_items;
--> statement-breakpoint
DROP TABLE product_discount_advisory_items;
--> statement-breakpoint
DROP TABLE product_discount_cycles;
--> statement-breakpoint
DROP TABLE product_price_reference_reviews;
--> statement-breakpoint
ALTER TABLE product_price_reference_reviews_next RENAME TO product_price_reference_reviews;
--> statement-breakpoint
ALTER TABLE product_discount_cycles_next RENAME TO product_discount_cycles;
--> statement-breakpoint
ALTER TABLE product_discount_advisory_items_next RENAME TO product_discount_advisory_items;
--> statement-breakpoint
CREATE INDEX product_discount_pending ON product_discount_cycles(product_id,first_published_at);
--> statement-breakpoint
CREATE TRIGGER price_reference_immutable BEFORE UPDATE ON product_price_reference_reviews BEGIN SELECT RAISE(ABORT,'price_reference_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER price_reference_retained BEFORE DELETE ON product_price_reference_reviews BEGIN SELECT RAISE(ABORT,'price_reference_retained'); END;
