CREATE TABLE seller_document_change_requests (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  document_id TEXT NOT NULL REFERENCES seller_documents(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','completed')),
  requested_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  review_reason TEXT
);
CREATE INDEX idx_seller_document_change_requests_seller ON seller_document_change_requests(seller_id,status);
