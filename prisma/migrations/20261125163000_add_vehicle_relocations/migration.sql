-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RelocationStatus') THEN
    CREATE TYPE "RelocationStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "vehicle_relocations" (
  "id" TEXT NOT NULL,
  "relocation_code" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "driver_id" TEXT,
  "from_location_id" TEXT NOT NULL,
  "to_location_id" TEXT NOT NULL,
  "status" "RelocationStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "departed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_relocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_relocations_relocation_code_key" ON "vehicle_relocations"("relocation_code");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_status_scheduled_at_idx" ON "vehicle_relocations"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_vehicle_id_status_idx" ON "vehicle_relocations"("vehicle_id", "status");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_driver_id_status_idx" ON "vehicle_relocations"("driver_id", "status");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_from_location_id_idx" ON "vehicle_relocations"("from_location_id");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_to_location_id_idx" ON "vehicle_relocations"("to_location_id");
CREATE INDEX IF NOT EXISTS "vehicle_relocations_created_by_id_idx" ON "vehicle_relocations"("created_by_id");

-- AddForeignKey
ALTER TABLE "vehicle_relocations" ADD CONSTRAINT "vehicle_relocations_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_relocations" ADD CONSTRAINT "vehicle_relocations_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_relocations" ADD CONSTRAINT "vehicle_relocations_from_location_id_fkey"
  FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_relocations" ADD CONSTRAINT "vehicle_relocations_to_location_id_fkey"
  FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_relocations" ADD CONSTRAINT "vehicle_relocations_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
