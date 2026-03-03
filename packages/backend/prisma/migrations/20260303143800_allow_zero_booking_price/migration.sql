-- Allow zero-price bookings (e.g. hosted/help-exchange stays)
-- Keep constraint aligned with API validation (totalPrice >= 0)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_booking_price_positive;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_booking_price_non_negative;
ALTER TABLE bookings
ADD CONSTRAINT check_booking_price_non_negative CHECK (total_price >= 0);
