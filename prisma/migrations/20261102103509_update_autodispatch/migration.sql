/*
  Warnings:

  - Added the required column `operational_location_id` to the `bookings` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'SEARCHING_DRIVER';
ALTER TYPE "BookingStatus" ADD VALUE 'DRIVER_NOTIFIED';
ALTER TYPE "BookingStatus" ADD VALUE 'DRIVER_EN_ROUTE';
ALTER TYPE "BookingStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_DRIVER_AVAILABLE';
ALTER TYPE "BookingStatus" ADD VALUE 'ADMIN_INTERVENTION';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "destination_lat" DOUBLE PRECISION,
ADD COLUMN     "destination_lng" DOUBLE PRECISION,
ADD COLUMN     "operational_location_id" TEXT NOT NULL,
ADD COLUMN     "pickup_lat" DOUBLE PRECISION,
ADD COLUMN     "pickup_lng" DOUBLE PRECISION,
ADD COLUMN     "vehicle_preference_id" TEXT;

-- AlterTable
ALTER TABLE "driver_locations" ADD COLUMN     "trip_id" TEXT;

-- AlterTable
ALTER TABLE "vehicle_locations" ADD COLUMN     "trip_id" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "current_location_id" TEXT,
ADD COLUMN     "home_location_id" TEXT;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_offers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SENT',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "rank" INTEGER NOT NULL,
    "eta_seconds" INTEGER,
    "eta_estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "booking_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_sessions" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "status" "DriverSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "start_lat" DOUBLE PRECISION,
    "start_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_code_idx" ON "locations"("code");

-- CreateIndex
CREATE INDEX "booking_offers_booking_id_attempt_no_idx" ON "booking_offers"("booking_id", "attempt_no");

-- CreateIndex
CREATE INDEX "booking_offers_driver_id_status_idx" ON "booking_offers"("driver_id", "status");

-- CreateIndex
CREATE INDEX "booking_offers_status_expires_at_idx" ON "booking_offers"("status", "expires_at");

-- CreateIndex
CREATE INDEX "driver_sessions_driver_id_status_idx" ON "driver_sessions"("driver_id", "status");

-- CreateIndex
CREATE INDEX "bookings_operational_location_id_idx" ON "bookings"("operational_location_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_home_location_id_fkey" FOREIGN KEY ("home_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_operational_location_id_fkey" FOREIGN KEY ("operational_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_preference_id_fkey" FOREIGN KEY ("vehicle_preference_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_locations" ADD CONSTRAINT "vehicle_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_offers" ADD CONSTRAINT "booking_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_offers" ADD CONSTRAINT "booking_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: one ACTIVE session per driver
CREATE UNIQUE INDEX driver_sessions_one_active_per_driver ON driver_sessions (driver_id) WHERE status = 'ACTIVE';

