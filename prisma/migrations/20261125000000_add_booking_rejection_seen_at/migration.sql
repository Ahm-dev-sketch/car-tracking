-- Add rejection_seen_at to bookings so users can acknowledge rejected bookings
-- without losing action-required badge counts on active bookings.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "rejection_seen_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "bookings_user_id_status_rejection_seen_at_idx"
  ON "bookings" ("user_id", "status", "rejection_seen_at");
