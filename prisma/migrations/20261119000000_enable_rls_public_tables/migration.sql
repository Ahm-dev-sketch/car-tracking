-- Enable Row-Level Security on every table in the `public` schema, with NO
-- policies, so the Supabase public API (anon/authenticated roles via PostgREST)
-- is closed entirely while the backend (Prisma over the `postgres` role) keeps
-- working.
--
-- Why this is safe for the app:
--   * Prisma connects as the `postgres` role — the table owner, which has
--     BYPASSRLS — so it is unaffected by RLS.
--   * `fleet_chat_messages` (a Supabase-only table, not a Prisma model) is
--     already read/written via prisma.$queryRawUnsafe, with the anon-key SDK as
--     a fallback only (see src/app/api/chat/messages/route.ts).
--   * Storage uses the service-role key and Realtime broadcast is not subject
--     to table RLS.
--
-- This migration intentionally does NOT create any policy: with RLS enabled and
-- zero policies, `anon` and `authenticated` see zero rows (deny-all by default).

-- 1) Explicit statements for every Prisma-managed table in the public schema
--    (self-documenting, matches prisma/schema.prisma @@map names).
ALTER TABLE "public"."locations"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicles"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."drivers"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bookings"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trips"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vehicle_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."driver_locations"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_offers"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."driver_sessions"   ENABLE ROW LEVEL SECURITY;

-- 2) Defensive catch-all: enable RLS on any remaining `public` table or
--    partition that is not yet protected, including:
--      * monthly `driver_locations_YYYYMM` partitions (created at runtime by
--        the `create_driver_location_partition` trigger function);
--      * Supabase-only tables not modeled in Prisma (e.g. `fleet_chat_messages`);
--      * Prisma's own `_prisma_migrations` bookkeeping table.
--    `relrowsecurity` guard keeps this idempotent.
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
  RAISE NOTICE 'rls-enable-public: RLS enabled on % additional table(s)', n;
END $$;
