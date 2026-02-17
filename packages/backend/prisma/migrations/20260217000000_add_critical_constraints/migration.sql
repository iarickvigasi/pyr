-- Critical Database Constraints Migration
-- This migration adds essential constraints for data integrity

-- 1. Add UNIQUE constraint on messages.message_id (partial - only non-null)
-- Prevents duplicate email ingestion from IMAP polling
CREATE UNIQUE INDEX idx_messages_message_id_unique ON messages(message_id) WHERE message_id IS NOT NULL;

-- 2. Add CHECK constraint for CalendarEvent (bookingId XOR eventId)
-- Ensures calendar event links to EITHER booking OR event, never both/neither
ALTER TABLE calendar_events
ADD CONSTRAINT chk_calendar_event_xor CHECK (
  (booking_id IS NULL AND event_id IS NOT NULL) OR
  (booking_id IS NOT NULL AND event_id IS NULL)
);

-- 3. Add CHECK constraint for Guest (email OR phone required)
-- Ensures we always have at least one way to contact the guest
ALTER TABLE guests
ADD CONSTRAINT chk_guest_contact_required CHECK (
  email IS NOT NULL OR phone IS NOT NULL
);

-- 4. Add email format validation
-- Basic email format validation
ALTER TABLE guests
ADD CONSTRAINT chk_guest_email_format CHECK (
  email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
);

-- 5. Add time format validation for events
-- Ensures time is in HH:MM format
ALTER TABLE events
ADD CONSTRAINT chk_event_time_format CHECK (
  time ~ '^\d{2}:\d{2}$'
);

-- 6. Add language validation for guests
-- Only allow 'en' or 'de'
ALTER TABLE guests
ADD CONSTRAINT chk_guest_language CHECK (
  language IN ('en', 'de')
);

-- 7. Add positive amount constraints
-- Ensure monetary amounts are positive
ALTER TABLE invoices
ADD CONSTRAINT chk_invoice_amount_positive CHECK (amount > 0);

ALTER TABLE payments
ADD CONSTRAINT chk_payment_amount_positive CHECK (amount > 0);

-- 8. Add capacity constraints
-- Reasonable upper bounds for occupancy and event capacity
ALTER TABLE room_types
ADD CONSTRAINT chk_room_type_max_occupancy CHECK (max_occupancy > 0 AND max_occupancy <= 20);

ALTER TABLE events
ADD CONSTRAINT chk_event_capacity CHECK (capacity > 0 AND capacity <= 100);

-- 9. Add season price multiplier bounds
-- Keep price multiplier reasonable (0.5x to 3x)
ALTER TABLE seasons
ADD CONSTRAINT chk_season_multiplier CHECK (price_multiplier >= 0.5 AND price_multiplier <= 3.0);

-- 10. Add booking date validation
-- Ensure check-out is after check-in (at least 1 day)
ALTER TABLE bookings
ADD CONSTRAINT chk_booking_dates CHECK (check_out > check_in);
