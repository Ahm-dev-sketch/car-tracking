-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('DROP_OFF', 'STANDBY');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_COMPLETION';

-- AlterTable: booking_offers dispatch round support
ALTER TABLE "booking_offers" ADD COLUMN "round_no" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "cooldown_until" TIMESTAMP(3);

-- AlterTable: drop off/standby modes + nota dinas flow
ALTER TABLE "bookings" ADD COLUMN "service_type" "ServiceType" NOT NULL DEFAULT 'DROP_OFF',
ADD COLUMN "nota_dinas_url" TEXT,
ADD COLUMN "nota_dinas_filename" TEXT;