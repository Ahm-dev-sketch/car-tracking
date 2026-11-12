-- Idempotent vehicle rebalance across KCIC hub locations.
-- Runs once via `prisma migrate deploy` during the Vercel build.
-- Only touches AVAILABLE vehicles (never IN_USE / on an active trip),
-- and only acts when the fleet is skewed into a single hub.

DO $$
DECLARE
  loc_count   INT;
  total_avail BIGINT;
  max_cnt     BIGINT;
  empty_cnt   BIGINT;
  skewed      BOOLEAN;
  loc_ids     TEXT[];
  loc_lats    DOUBLE PRECISION[];
  loc_lngs    DOUBLE PRECISION[];
  veh         RECORD;
  idx         INT;
BEGIN
  -- (1) Backfill the 6 official KCIC hub coordinates (idempotent).
  UPDATE locations
     SET latitude  = v.lat,
         longitude = v.lng
    FROM (VALUES
      ('102', -6.2494, 106.8914),
      ('202', -6.3802, 107.2488),
      ('204', -6.3690, 107.2620),
      ('802', -6.8370, 107.4845),
      ('402', -6.9297, 107.6623),
      ('502', -6.9210, 107.6520)
    ) AS v(code, lat, lng)
   WHERE locations.code = v.code
     AND (locations.latitude IS NULL OR locations.longitude IS NULL);

  -- (2) Active, coordinate-bearing hubs (ordered by code for stable round-robin).
  SELECT array_agg(l.id        ORDER BY l.code),
         array_agg(l.latitude  ORDER BY l.code),
         array_agg(l.longitude ORDER BY l.code)
    INTO loc_ids, loc_lats, loc_lngs
    FROM locations l
   WHERE l.is_active = TRUE
     AND l.latitude  IS NOT NULL
     AND l.longitude IS NOT NULL;

  loc_count := array_length(loc_ids, 1);
  IF loc_count IS NULL OR loc_count < 2 THEN
    RAISE NOTICE 'rebalance-vehicles: fewer than 2 coordinate-bearing active locations, skipping';
    RETURN;
  END IF;

  -- (3) Rebalanceable vehicles: AVAILABLE and not on an active trip.
  SELECT count(*)
    INTO total_avail
    FROM vehicles ve
   WHERE ve.status = 'AVAILABLE'
     AND NOT EXISTS (
           SELECT 1 FROM trips t
            WHERE t.vehicle_id = ve.id
              AND t.status = 'ACTIVE'
         );

  IF total_avail = 0 THEN
    RAISE NOTICE 'rebalance-vehicles: no rebalanceable vehicles, skipping';
    RETURN;
  END IF;

  -- (4) Detect skew: one hub holds >80% while some active hub has none.
  SELECT max(b.cnt), count(*) FILTER (WHERE b.cnt = 0)
    INTO max_cnt, empty_cnt
    FROM (
      SELECT l.id,
             COALESCE(count(ve.id), 0) AS cnt
        FROM locations l
        LEFT JOIN vehicles ve
               ON ve.current_location_id = l.id
              AND ve.status = 'AVAILABLE'
              AND NOT EXISTS (
                    SELECT 1 FROM trips t
                     WHERE t.vehicle_id = ve.id
                       AND t.status = 'ACTIVE'
                  )
       WHERE l.is_active = TRUE
       GROUP BY l.id
    ) b;

  skewed := (empty_cnt > 0)
            AND (max_cnt::double precision / total_avail::double precision > 0.8);

  IF NOT skewed THEN
    RAISE NOTICE 'rebalance-vehicles: distribution already balanced, skipping';
    RETURN;
  END IF;

  -- (5) Round-robin reassign available vehicles across the active hubs.
  FOR veh IN
    SELECT ve.id,
           ROW_NUMBER() OVER (ORDER BY ve.plate_number) - 1 AS rn
      FROM vehicles ve
     WHERE ve.status = 'AVAILABLE'
       AND NOT EXISTS (
             SELECT 1 FROM trips t
              WHERE t.vehicle_id = ve.id
                AND t.status = 'ACTIVE'
           )
  LOOP
    idx := (veh.rn::int % loc_count) + 1;

    UPDATE vehicles
       SET current_location_id = loc_ids[idx],
           home_location_id    = loc_ids[idx]
     WHERE id = veh.id;

    -- Park the vehicle's last-known position at its new hub (only if it has one).
    IF loc_lats[idx] IS NOT NULL AND loc_lngs[idx] IS NOT NULL THEN
      UPDATE vehicle_locations
         SET lat         = loc_lats[idx],
             lng         = loc_lngs[idx],
             movement    = 'STOPPED',
             recorded_at = now()
       WHERE vehicle_id = veh.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'rebalance-vehicles: redistributed % available vehicles across % active hubs', total_avail, loc_count;
END $$;