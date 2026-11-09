-- Supabase Database Linter hardening
-- 1) Enable RLS on every public table (owner keeps bypass => app traffic unaffected;
--    anon/authenticated become deny-all because no policies exist).
-- 2) Drop always-true policies on fleet_chat_messages (Supabase-only table).
-- 3) Pin search_path on manually created functions.
-- 4) Index unindexed foreign keys (Prisma naming: table_column_idx).

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
  RAISE NOTICE 'RLS enabled on % table(s)', n;
END $$;

-- fleet_chat_messages exists only on Supabase; all three policies are always-true.
DO $$
BEGIN
  IF to_regclass('public.fleet_chat_messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow read fleet chat messages" ON public.fleet_chat_messages';
    EXECUTE 'DROP POLICY IF EXISTS "Allow update is_read status" ON public.fleet_chat_messages';
    EXECUTE 'DROP POLICY IF EXISTS "Allow insert fleet chat messages" ON public.fleet_chat_messages';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.create_driver_location_partition(date)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_driver_location_partition(date) SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.driver_locations_before_insert()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.driver_locations_before_insert() SET search_path = public, pg_temp';
  END IF;
END $$;

-- Recreate partition factory: new partitions start with RLS off, so enable it per creation.
DO $$
BEGIN
  IF to_regprocedure('public.create_driver_location_partition(date)') IS NOT NULL THEN
    EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.create_driver_location_partition(p_month date)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_partition_date text;
    v_partition_name text;
    v_start_date text;
    v_end_date text;
BEGIN
    v_partition_date := to_char(p_month, 'YYYYMM');
    v_partition_name := 'driver_locations_' || v_partition_date;
    v_start_date := to_char(date_trunc('month', p_month), 'YYYY-MM-DD');
    v_end_date := to_char(date_trunc('month', p_month) + interval '1 month', 'YYYY-MM-DD');

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF driver_locations FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);

    RETURN v_partition_name;
END;
$function$
    $fn$;
  END IF;
END $$;

-- 4) Unindexed foreign keys (driver_locations is partitioned: parent index covers
--    existing partitions and future ones).
CREATE INDEX IF NOT EXISTS "vehicles_current_location_id_idx" ON public.vehicles ("current_location_id");
CREATE INDEX IF NOT EXISTS "vehicles_home_location_id_idx" ON public.vehicles ("home_location_id");
CREATE INDEX IF NOT EXISTS "bookings_driver_id_idx" ON public.bookings ("driver_id");
CREATE INDEX IF NOT EXISTS "bookings_vehicle_preference_id_idx" ON public.bookings ("vehicle_preference_id");
CREATE INDEX IF NOT EXISTS "trips_booking_id_idx" ON public.trips ("booking_id");
CREATE INDEX IF NOT EXISTS "vehicle_locations_driver_id_idx" ON public.vehicle_locations ("driver_id");
CREATE INDEX IF NOT EXISTS "vehicle_locations_trip_id_idx" ON public.vehicle_locations ("trip_id");
CREATE INDEX IF NOT EXISTS "driver_locations_trip_id_idx" ON public.driver_locations ("trip_id");
CREATE INDEX IF NOT EXISTS "driver_locations_vehicle_id_idx" ON public.driver_locations ("vehicle_id");
CREATE INDEX IF NOT EXISTS "driver_sessions_vehicle_id_idx" ON public.driver_sessions ("vehicle_id");