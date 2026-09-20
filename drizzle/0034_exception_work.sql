CREATE TABLE IF NOT EXISTS exception_work_items (
 id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,order_id TEXT NOT NULL,shipping_job_id TEXT NOT NULL,kind TEXT NOT NULL,cash_record_id TEXT,status TEXT NOT NULL DEFAULT 'open',owner_id TEXT,next_action TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,resolved_at INTEGER,evidence TEXT,
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(created_by) REFERENCES users(id),CHECK(status IN ('open','resolved')),CHECK(kind IN ('failed_delivery','customer_unavailable','incorrect_cash','cancelled_parcel'))
);
CREATE INDEX IF NOT EXISTS idx_exception_work_queue ON exception_work_items(status,updated_at);
CREATE TABLE IF NOT EXISTS exception_work_events (
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,owner_id TEXT,next_action TEXT NOT NULL,note TEXT NOT NULL,evidence TEXT,payload_json TEXT NOT NULL,created_at INTEGER NOT NULL,
 FOREIGN KEY(work_id) REFERENCES exception_work_items(id),FOREIGN KEY(actor_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exception_work_history ON exception_work_events(work_id,created_at);
CREATE TRIGGER IF NOT EXISTS exception_work_events_no_update BEFORE UPDATE ON exception_work_events BEGIN SELECT RAISE(ABORT,'exception_history_immutable'); END;
CREATE TRIGGER IF NOT EXISTS exception_work_events_no_delete BEFORE DELETE ON exception_work_events BEGIN SELECT RAISE(ABORT,'exception_history_immutable'); END;
