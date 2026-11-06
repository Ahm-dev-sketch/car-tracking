-- ==============================================================================
-- KCIC FLEET TRACKING - REAL-TIME IN-APP CHAT & WEBRTC SIGNALING MIGRATION
-- Jalankan skrip ini di SQL Editor Supabase Dashboard Anda.
-- ==============================================================================

-- 1. Buat Tabel Pesan Chat Antara Driver, Admin, dan User/Passenger
CREATE TABLE IF NOT EXISTS fleet_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT,
    trip_id TEXT,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    sender_role TEXT DEFAULT 'USER', -- 'DRIVER', 'ADMIN', 'USER'
    receiver_id TEXT,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index Performa Pencarian Pesan Percakapan
CREATE INDEX IF NOT EXISTS idx_fleet_chat_booking ON fleet_chat_messages(booking_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_fleet_chat_trip ON fleet_chat_messages(trip_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_fleet_chat_sender_receiver ON fleet_chat_messages(sender_id, receiver_id);

-- 3. Aktifkan Supabase Realtime Replication pada Tabel Chat
-- Ini memungkinkan Supabase WebSocket client mendengarkan event INSERT secara instan (postgres_changes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND tablename = 'fleet_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fleet_chat_messages;
  END IF;
END $$;

-- 4. Konfigurasi Row Level Security (RLS)
ALTER TABLE fleet_chat_messages ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses Baca (SELECT): izinkan client dengan anon_key atau authenticated membaca pesan
CREATE POLICY "Allow read fleet chat messages"
    ON fleet_chat_messages
    FOR SELECT
    USING (true);

-- Kebijakan Akses Tulis (INSERT): izinkan client mengirim pesan
CREATE POLICY "Allow insert fleet chat messages"
    ON fleet_chat_messages
    FOR INSERT
    WITH CHECK (true);

-- Kebijakan Update status baca (UPDATE is_read)
CREATE POLICY "Allow update is_read status"
    ON fleet_chat_messages
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Catatan untuk WebRTC Voice Call Signaling:
-- Panggilan suara WebRTC menggunakan channel 'broadcast' Supabase Realtime (ephemeral WebSocket).
-- Fitur broadcast tidak memerlukan tabel database fisik, melainkan langsung bekerja pada channel
-- seperti `call:booking-{id}` atau `call:trip-{id}`.
