/**
 * DEMO SEED — LOCAL REVIEW ONLY. Never run against production.
 * Creates demo accounts + vehicles spread across operational locations
 * so the booking → dispatch → offer → accept → tracking flow can be
 * reviewed end-to-end. All passwords: Demo1234 (bcrypt).
 * Idempotent: upsert by unique email / plate number.
 */
import { PrismaClient, RoleCode, VehicleStatus, VehicleType, Transmission, DriverStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo1234';

async function role(code: RoleCode) {
  return prisma.role.findUniqueOrThrow({ where: { code } });
}

async function location(name: string, code: string) {
  return prisma.location.findFirstOrThrow({ where: { name, code } });
}

async function main() {
  const [adminRole, userRole, driverRole] = await Promise.all([
    role(RoleCode.ADMIN),
    role(RoleCode.USER),
    role(RoleCode.DRIVER),
  ]);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const halim = await location('Halim', '102');
  const karawang201 = await location('Karawang', '201');
  const karawang202 = await location('Karawang', '202');
  const padalarang = await location('Padalarang', '802');
  const tegalluarStation = await location('Tegalluar Station', '402');
  const tegalluarDepot = await location('Tegalluar Depot', '202');

  // ---------- Admin ----------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.test' },
    update: {},
    create: {
      email: 'admin@demo.test',
      passwordHash: hash,
      name: 'Admin Demo',
      phone: '081100000001',
      roleId: adminRole.id,
    },
  });

  // ---------- Regular user ----------
  await prisma.user.upsert({
    where: { email: 'user@demo.test' },
    update: {},
    create: {
      email: 'user@demo.test',
      passwordHash: hash,
      name: 'User Demo',
      phone: '081100000002',
      roleId: userRole.id,
    },
  });

  // ---------- Drivers + vehicles ----------
  const driversSpec = [
    {
      email: 'driver1@demo.test',
      name: 'Budi Santoso',
      phone: '081200000001',
      license: 'SIM-0001',
      vehicle: {
        plateNumber: 'B 1234 CD',
        brand: 'Toyota',
        model: 'Avanza',
        vehicleType: VehicleType.MPV,
        seatingCapacity: 7,
        transmission: Transmission.AUTOMATIC,
        home: halim,
        status: VehicleStatus.AVAILABLE,
      },
    },
    {
      email: 'driver2@demo.test',
      name: 'Agus Wijaya',
      phone: '081200000002',
      license: 'SIM-0002',
      vehicle: {
        plateNumber: 'D 5678 EF',
        brand: 'Toyota',
        model: 'Innova Reborn',
        vehicleType: VehicleType.MPV,
        seatingCapacity: 7,
        transmission: Transmission.AUTOMATIC,
        home: karawang201,
        status: VehicleStatus.AVAILABLE,
      },
    },
    {
      email: 'driver3@demo.test',
      name: 'Slamet Riyadi',
      phone: '081200000003',
      license: 'SIM-0003',
      vehicle: {
        plateNumber: 'B 9999 XY',
        brand: 'Toyota',
        model: 'Fortuner',
        vehicleType: VehicleType.SUV,
        seatingCapacity: 5,
        transmission: Transmission.AUTOMATIC,
        home: padalarang,
        status: VehicleStatus.AVAILABLE,
      },
    },
    {
      email: 'driver4@demo.test',
      name: 'Joko Prasetyo',
      phone: '081200000004',
      license: 'SIM-0004',
      vehicle: {
        plateNumber: 'T 2020 AB',
        brand: 'Honda',
        model: 'Brio',
        vehicleType: VehicleType.SEDAN,
        seatingCapacity: 5,
        transmission: Transmission.MANUAL,
        home: tegalluarStation,
        status: VehicleStatus.AVAILABLE,
      },
    },
  ];

  for (const spec of driversSpec) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: {},
      create: {
        email: spec.email,
        passwordHash: hash,
        name: spec.name,
        phone: spec.phone,
        roleId: driverRole.id,
      },
    });

    const vehicle = await prisma.vehicle.upsert({
      where: { plateNumber: spec.vehicle.plateNumber },
      update: {
        homeLocationId: spec.vehicle.home.id,
        currentLocationId: spec.vehicle.home.id,
        status: spec.vehicle.status,
      },
      create: {
        plateNumber: spec.vehicle.plateNumber,
        brand: spec.vehicle.brand,
        model: spec.vehicle.model,
        vehicleType: spec.vehicle.vehicleType,
        seatingCapacity: spec.vehicle.seatingCapacity,
        transmission: spec.vehicle.transmission,
        homeLocationId: spec.vehicle.home.id,
        currentLocationId: spec.vehicle.home.id,
        status: spec.vehicle.status,
      },
    });

    const driver = await prisma.driver.upsert({
      where: { userId: user.id },
      update: {
        licenseNumber: spec.license,
        status: DriverStatus.AVAILABLE,
        currentVehicleId: vehicle.id,
      },
      create: {
        userId: user.id,
        licenseNumber: spec.license,
        status: DriverStatus.AVAILABLE,
        currentVehicleId: vehicle.id,
      },
    });

    // Keep vehicle.currentDriverId mirror consistent
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { currentDriverId: driver.id },
    });
  }

  // ---------- Extra vehicles (assigned home locations, no driver yet) ----------
  const extraVehicles = [
    {
      plateNumber: 'D 8888 GH',
      brand: 'Mitsubishi',
      model: 'Xpander',
      vehicleType: VehicleType.MPV,
      seatingCapacity: 7,
      transmission: Transmission.AUTOMATIC,
      home: karawang202,
      status: VehicleStatus.AVAILABLE,
    },
    {
      plateNumber: 'T 3003 JK',
      brand: 'Daihatsu',
      model: 'Gran Max',
      vehicleType: VehicleType.VAN,
      seatingCapacity: 6,
      transmission: Transmission.MANUAL,
      home: tegalluarDepot,
      status: VehicleStatus.MAINTENANCE,
    },
    {
      plateNumber: 'B 7007 LM',
      brand: 'Toyota',
      model: 'Hilux',
      vehicleType: VehicleType.TRUCK,
      seatingCapacity: 3,
      transmission: Transmission.MANUAL,
      home: halim,
      status: VehicleStatus.INACTIVE,
    },
  ];

  for (const v of extraVehicles) {
    await prisma.vehicle.upsert({
      where: { plateNumber: v.plateNumber },
      update: {
        homeLocationId: v.home.id,
        currentLocationId: v.home.id,
        status: v.status,
      },
      create: {
        plateNumber: v.plateNumber,
        brand: v.brand,
        model: v.model,
        vehicleType: v.vehicleType,
        seatingCapacity: v.seatingCapacity,
        transmission: v.transmission,
        homeLocationId: v.home.id,
        currentLocationId: v.home.id,
        status: v.status,
      },
    });
  }

  console.log('Demo data seeded successfully (admin/user/driver accounts: password Demo1234)');
  console.log('admin@demo.test | user@demo.test | driver1@demo.test ... driver4@demo.test');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
