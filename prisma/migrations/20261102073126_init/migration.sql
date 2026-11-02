-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER', 'DRIVER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_USE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'MPV', 'VAN', 'TRUCK');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_TRIP');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "seating_capacity" INTEGER NOT NULL,
    "transmission" "Transmission",
    "image_url" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "current_driver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "current_vehicle_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_current_driver_id_key" ON "vehicles"("current_driver_id");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicles_seating_capacity_idx" ON "vehicles"("seating_capacity");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_number_key" ON "drivers"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_current_vehicle_id_key" ON "drivers"("current_vehicle_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_driver_id_fkey" FOREIGN KEY ("current_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_current_vehicle_id_fkey" FOREIGN KEY ("current_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
