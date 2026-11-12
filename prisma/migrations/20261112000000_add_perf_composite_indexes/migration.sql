-- Add performance composite indexes (non-destructive, additive only)

CREATE INDEX IF NOT EXISTS "bookings_status_created_at_idx" ON "bookings" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "bookings_driver_id_status_idx" ON "bookings" ("driver_id", "status");
CREATE INDEX IF NOT EXISTS "trips_driver_id_status_idx" ON "trips" ("driver_id", "status");
CREATE INDEX IF NOT EXISTS "trips_booking_id_status_idx" ON "trips" ("booking_id", "status");
CREATE INDEX IF NOT EXISTS "vehicle_locations_trip_id_recorded_at_idx" ON "vehicle_locations" ("trip_id", "recorded_at" DESC);
CREATE INDEX IF NOT EXISTS "driver_locations_trip_id_recorded_at_idx" ON "driver_locations" ("trip_id", "recorded_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_created_at_idx" ON "notifications" ("user_id", "read_at", "created_at");