-- Add CHECK constraints for data integrity

-- Bookings: check_out must be after check_in
ALTER TABLE bookings
ADD CONSTRAINT check_booking_dates CHECK (check_out > check_in);

-- Bookings: total_price must be positive
ALTER TABLE bookings
ADD CONSTRAINT check_booking_price_positive CHECK (total_price > 0);

-- RoomTypes: base_price must be positive
ALTER TABLE room_types
ADD CONSTRAINT check_room_type_price_positive CHECK (base_price > 0);

-- RoomTypes: max_occupancy must be positive
ALTER TABLE room_types
ADD CONSTRAINT check_room_type_occupancy_positive CHECK (max_occupancy > 0);

-- Seasons: end_date must be after start_date
ALTER TABLE seasons
ADD CONSTRAINT check_season_dates CHECK (end_date > start_date);

-- Seasons: price_multiplier must be positive
ALTER TABLE seasons
ADD CONSTRAINT check_season_multiplier_positive CHECK (price_multiplier > 0);

-- Events: capacity must be positive
ALTER TABLE events
ADD CONSTRAINT check_event_capacity_positive CHECK (capacity > 0);

-- Invoices: amount must be positive
ALTER TABLE invoices
ADD CONSTRAINT check_invoice_amount_positive CHECK (amount > 0);

-- Payments: amount must be positive
ALTER TABLE payments
ADD CONSTRAINT check_payment_amount_positive CHECK (amount > 0);

-- AiDrafts: tokens_used must be non-negative
ALTER TABLE ai_drafts
ADD CONSTRAINT check_ai_draft_tokens_non_negative CHECK (tokens_used >= 0);
