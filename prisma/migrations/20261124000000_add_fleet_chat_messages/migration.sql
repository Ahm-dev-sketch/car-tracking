-- Idempotent: creates the table on localhost and no-ops on production Supabase
-- where fleet_chat_messages already exists (created out-of-band).
CREATE TABLE IF NOT EXISTS fleet_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT,
    trip_id TEXT,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    sender_role TEXT DEFAULT 'USER',
    receiver_id TEXT,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fleet_chat_booking ON fleet_chat_messages(booking_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_fleet_chat_trip ON fleet_chat_messages(trip_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_fleet_chat_sender_receiver ON fleet_chat_messages(sender_id, receiver_id);
ALTER TABLE fleet_chat_messages ENABLE ROW LEVEL SECURITY;
