-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('MOVING', 'STOPPED', 'GPS_LOST', 'OFFLINE');

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "start_lat" DOUBLE PRECISION NOT NULL,
    "start_lng" DOUBLE PRECISION NOT NULL,
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_locations" (
    "vehicle_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "speed_mps" DOUBLE PRECISION,
    "heading_deg" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movement" "MovementStatus" NOT NULL DEFAULT 'OFFLINE',

    CONSTRAINT "vehicle_locations_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" BIGSERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "speed_mps" DOUBLE PRECISION,
    "heading_deg" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id", "recorded_at")
) PARTITION BY RANGE ("recorded_at");

-- Function to create monthly partition
CREATE OR REPLACE FUNCTION create_driver_location_partition(p_month date)
RETURNS text AS $$
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

    RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create partition on demand if needed
CREATE OR REPLACE FUNCTION driver_locations_before_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_driver_location_partition(NEW.recorded_at::date);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_driver_locations_before_insert ON "driver_locations";
CREATE TRIGGER trg_driver_locations_before_insert
BEFORE INSERT ON "driver_locations"
FOR EACH ROW EXECUTE FUNCTION driver_locations_before_insert();

-- Pre-seed partition range (past 3 months through next 12 months)
DO $$
DECLARE
    v_dt date := date_trunc('month', CURRENT_DATE) - interval '3 months';
    v_end date := date_trunc('month', CURRENT_DATE) + interval '12 months';
BEGIN
    WHILE v_dt <= v_end LOOP
        PERFORM create_driver_location_partition(v_dt);
        v_dt := v_dt + interval '1 month';
    END LOOP;
END $$;

-- CreateIndex
CREATE INDEX "trips_vehicle_id_started_at_idx" ON "trips"("vehicle_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "trips_driver_id_started_at_idx" ON "trips"("driver_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "driver_locations_driver_id_recorded_at_idx" ON "driver_locations"("driver_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_locations" ADD CONSTRAINT "vehicle_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_locations" ADD CONSTRAINT "vehicle_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
