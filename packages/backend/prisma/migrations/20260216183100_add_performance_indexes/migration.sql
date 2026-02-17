-- Add performance indexes for common queries

-- Index for filtering bookings by date range (already have composite, but add individual for specific queries)
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON bookings(check_out) WHERE deleted_at IS NULL;

-- Index for guests by creation date (for recent guests queries)
CREATE INDEX IF NOT EXISTS idx_guests_created_at ON guests(created_at DESC) WHERE deleted_at IS NULL;

-- Index for active bookings (most common query)
CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings(status, check_in, check_out) WHERE deleted_at IS NULL AND status IN ('inquiry', 'confirmed', 'checked_in');

-- Index for upcoming events (most common query)
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events(date, time) WHERE date >= CURRENT_DATE;

-- Index for open conversations (most common query in inbox)
CREATE INDEX IF NOT EXISTS idx_conversations_open ON conversations(status, last_message_at DESC) WHERE status = 'open';

-- Index for recent messages (for conversation threads)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent ON messages(conversation_id, sent_at DESC);

-- Index for pending AI drafts (for review)
CREATE INDEX IF NOT EXISTS idx_ai_drafts_pending ON ai_drafts(status, created_at DESC) WHERE status = 'pending';

-- Index for audit log by actor (for tracking who made changes)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor, created_at DESC);

-- Index for unpaid invoices (common financial query)
CREATE INDEX IF NOT EXISTS idx_invoices_unpaid ON invoices(status, created_at DESC) WHERE status IN ('draft', 'sent');

-- Index for event bookings by status (for waitlist promotion)
CREATE INDEX IF NOT EXISTS idx_event_bookings_status ON event_bookings(event_id, status);
