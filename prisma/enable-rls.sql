-- ============================================================================
-- enable-rls.sql — Enable Row-Level Security on every table in `public`,
-- with NO policies, so the Supabase public API (anon / authenticated roles via
-- PostgREST and Realtime) is closed entirely while the backend keeps working.
--
-- Safe to run in the Supabase SQL Editor right now. Idempotent: re-running is a
-- no-op for tables that already have RLS enabled.
--
-- Why this does NOT break the app:
--   * Prisma connects as the `postgres` role (table owner, BYPASSRLS) -> unaffected.
--   * `fleet_chat_messages` (Supabase-only table) is read/written via
--     prisma.$queryRawUnsafe; the anon-key SDK is only a fallback.
--   * Storage uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
--   * Live Tracking / Notifications / Offers use the app's own WebSocket server
--     (Cloudflare Durable Object), not Supabase postgres_changes.
--
-- NOTE: this script ENABLES RLS and DROPS every existing policy on public
-- tables, so an old always-true ("USING (true)") policy cannot keep granting
-- access. Run it once in the Supabase SQL Editor to fully close public access.
-- ============================================================================

BEGIN;

-- 1) Explicit statements for every Prisma-managed table in the public schema
--    (matches prisma/schema.prisma @@map names).
ALTER TABLE "public"."locations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicles"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."drivers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bookings"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trips"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_locations"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."driver_locations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_offers"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."driver_sessions"    ENABLE ROW LEVEL SECURITY;

-- 2) Defensive catch-all: enable RLS on any remaining `public` table or
--    partition that is not yet protected, including:
--      * monthly `driver_locations_YYYYMM` partitions (created at runtime);
--      * Supabase-only tables not modeled in Prisma (e.g. `fleet_chat_messages`);
--      * Prisma's `_prisma_migrations` bookkeeping table.
--    The `relrowsecurity` guard keeps this idempotent.
DO $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'enable-rls: RLS enabled on % additional table(s)', n;
END $$;

-- 3) Drop every pre-existing policy on public tables. With RLS enabled and zero
--    policies, anon/authenticated are deny-all by default. This removes any
--    lingering always-true ("USING (true)") policy from Supabase's auto-created
--    tables (e.g. fleet_chat_messages) so access is truly closed. Idempotent.
DO $$
DECLARE
  pol RECORD;
  n integer := 0;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'enable-rls: dropped % policy/policies', n;
END $$;

COMMIT;
