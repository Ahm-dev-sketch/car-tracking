/**
 * DEMO SEED — LOCAL REVIEW ONLY. Never run against production.
 * Creates demo accounts + 7 vehicles per operational location (5 available, 1 inactive, 1 maintenance)
 * for all 6 official KCIC hubs so the booking → dispatch → offer → accept → tracking flow can be
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

interface VehicleSpec {
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: VehicleType;
  seatingCapacity: number;
  transmission: Transmission;
  status: VehicleStatus;
}

interface HubVehicleGroup {
  locName: string;
  locCode: string;
  vehicles: VehicleSpec[];
}

async function main() {
  const [adminRole, userRole, driverRole] = await Promise.all([
    role(RoleCode.ADMIN),
    role(RoleCode.USER),
    role(RoleCode.DRIVER),
  ]);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- Admin ----------
  await prisma.user.upsert({
    where: { email: 'admin@demo.test' },
    update: { passwordHash: hash, isActive: true },
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
    update: { passwordHash: hash, isActive: true },
    create: {
      email: 'user@demo.test',
      passwordHash: hash,
      name: 'User Demo',
      phone: '081100000002',
      roleId: userRole.id,
    },
  });

  // ---------- Drivers (6 drivers across operational hubs) ----------
  const driversSpec = [
    { email: 'driver1@demo.test', name: 'Budi Santoso', phone: '081200000001', license: 'SIM-0001' },
    { email: 'driver2@demo.test', name: 'Agus Wijaya', phone: '081200000002', license: 'SIM-0002' },
    { email: 'driver3@demo.test', name: 'Slamet Riyadi', phone: '081200000003', license: 'SIM-0003' },
    { email: 'driver4@demo.test', name: 'Joko Prasetyo', phone: '081200000004', license: 'SIM-0004' },
    { email: 'driver5@demo.test', name: 'Dedi Supriadi', phone: '081200000005', license: 'SIM-0005' },
    { email: 'driver6@demo.test', name: 'Hendra Kurniawan', phone: '081200000006', license: 'SIM-0006' },
  ];

  for (const d of driversSpec) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: { passwordHash: hash, isActive: true, name: d.name, phone: d.phone },
      create: {
        email: d.email,
        passwordHash: hash,
        name: d.name,
        phone: d.phone,
        roleId: driverRole.id,
      },
    });

    await prisma.driver.upsert({
      where: { userId: user.id },
      update: {
        licenseNumber: d.license,
        status: DriverStatus.OFFLINE,
        currentVehicleId: null,
      },
      create: {
        userId: user.id,
        licenseNumber: d.license,
        status: DriverStatus.OFFLINE,
        currentVehicleId: null,
      },
    });
  }

  // Close standing assignments and stale active sessions so pool is pristine
  await prisma.vehicleAssignment.updateMany({
    where: { unassignedAt: null },
    data: { unassignedAt: new Date(), reason: 'Demo seed: reset to vehicle pool' },
  });
  await prisma.driverSession.updateMany({
    where: { status: 'ACTIVE' },
    data: { status: 'ENDED', endedAt: new Date() },
  });

  // ---------- 7 Vehicles Per Operational Location (5 Available, 1 Inactive, 1 Maintenance) ----------
  const hubFleetSpecs: HubVehicleGroup[] = [
    // 1. Halim (Code: 102)
    {
      locName: 'Halim',
      locCode: '102',
      vehicles: [
        { plateNumber: 'B 1234 CD', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'B 1021 KCF', brand: 'Toyota', model: 'Innova Zenix', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'B 1022 KCF', brand: 'Toyota', model: 'Fortuner 2.8 VRZ', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'B 1023 KCF', brand: 'Hyundai', model: 'Stargazer Prime', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'B 1024 KCF', brand: 'Toyota', model: 'HiAce Commuter', vehicleType: VehicleType.VAN, seatingCapacity: 12, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'B 7007 LM', brand: 'Toyota', model: 'Hilux Single Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'B 1027 KCF', brand: 'Daihatsu', model: 'Gran Max Blind Van', vehicleType: VehicleType.VAN, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
      ],
    },
    // 2. Karawang Hub 1 (Code: 202)
    {
      locName: 'Karawang',
      locCode: '202',
      vehicles: [
        { plateNumber: 'D 5678 EF', brand: 'Toyota', model: 'Innova Reborn', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2021 KCF', brand: 'Mitsubishi', model: 'Xpander Ultimate', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2022 KCF', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2023 KCF', brand: 'Honda', model: 'BR-V Prestige', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2024 KCF', brand: 'Isuzu', model: 'D-Max Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2026 KCF', brand: 'Suzuki', model: 'Carry Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'T 2027 KCF', brand: 'Daihatsu', model: 'Luxio 1.5 X', vehicleType: VehicleType.VAN, seatingCapacity: 8, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
      ],
    },
    // 3. Karawang Hub 2 (Code: 204)
    {
      locName: 'Karawang',
      locCode: '204',
      vehicles: [
        { plateNumber: 'D 8888 GH', brand: 'Mitsubishi', model: 'Xpander Sport', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2041 KCF', brand: 'Toyota', model: 'Rush GR Sport', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2042 KCF', brand: 'Mitsubishi', model: 'Pajero Sport Dakar', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2043 KCF', brand: 'Toyota', model: 'Veloz Q CVT', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2044 KCF', brand: 'Toyota', model: 'Hilux Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'T 2046 KCF', brand: 'Daihatsu', model: 'Gran Max Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'T 2047 KCF', brand: 'Toyota', model: 'Avanza 1.3 E', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
      ],
    },
    // 4. Padalarang (Code: 802)
    {
      locName: 'Padalarang',
      locCode: '802',
      vehicles: [
        { plateNumber: 'B 9999 XY', brand: 'Toyota', model: 'Fortuner 2.4 G', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 8021 KCF', brand: 'Toyota', model: 'Innova Zenix Hybrid', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 8022 KCF', brand: 'Honda', model: 'HR-V SE', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 8023 KCF', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 8024 KCF', brand: 'Toyota', model: 'HiAce Premio', vehicleType: VehicleType.VAN, seatingCapacity: 10, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 8026 KCF', brand: 'Mitsubishi', model: 'Triton Single Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'D 8027 KCF', brand: 'Nissan', model: 'Serena Highway Star', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.MAINTENANCE },
      ],
    },
    // 5. Tegalluar Station (Code: 402)
    {
      locName: 'Tegalluar Station',
      locCode: '402',
      vehicles: [
        { plateNumber: 'T 2020 AB', brand: 'Honda', model: 'Brio RS', vehicleType: VehicleType.SEDAN, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 4021 KCF', brand: 'Toyota', model: 'Innova Reborn Diesel', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 4022 KCF', brand: 'Hyundai', model: 'Creta Prime', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 4023 KCF', brand: 'Mitsubishi', model: 'Xpander Cross', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 4024 KCF', brand: 'Toyota', model: 'Veloz 1.5 Q', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 4026 KCF', brand: 'Daihatsu', model: 'Gran Max Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'D 4027 KCF', brand: 'Suzuki', model: 'APV Arena', vehicleType: VehicleType.VAN, seatingCapacity: 8, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
      ],
    },
    // 6. Tegalluar Depo (Code: 502)
    {
      locName: 'Tegalluar Depo',
      locCode: '502',
      vehicles: [
        { plateNumber: 'D 5021 KCF', brand: 'Toyota', model: 'Hilux 4x4 Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 5022 KCF', brand: 'Mitsubishi', model: 'Triton 4x4', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 5023 KCF', brand: 'Toyota', model: 'Fortuner 4x4', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 5024 KCF', brand: 'Isuzu', model: 'Elf Microbus', vehicleType: VehicleType.VAN, seatingCapacity: 16, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 5025 KCF', brand: 'Toyota', model: 'HiAce Commuter', vehicleType: VehicleType.VAN, seatingCapacity: 12, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
        { plateNumber: 'D 5026 KCF', brand: 'Mitsubishi', model: 'Colt L300 Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
        { plateNumber: 'T 3003 JK', brand: 'Daihatsu', model: 'Gran Max Blind Van', vehicleType: VehicleType.VAN, seatingCapacity: 6, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
      ],
    },
  ];

  const seededPlates = new Set<string>();

  for (const group of hubFleetSpecs) {
    const loc = await location(group.locName, group.locCode);

    for (const v of group.vehicles) {
      seededPlates.add(v.plateNumber);
      await prisma.vehicle.upsert({
        where: { plateNumber: v.plateNumber },
        update: {
          brand: v.brand,
          model: v.model,
          vehicleType: v.vehicleType,
          seatingCapacity: v.seatingCapacity,
          transmission: v.transmission,
          homeLocationId: loc.id,
          currentLocationId: loc.id,
          status: v.status,
          currentDriverId: null,
        },
        create: {
          plateNumber: v.plateNumber,
          brand: v.brand,
          model: v.model,
          vehicleType: v.vehicleType,
          seatingCapacity: v.seatingCapacity,
          transmission: v.transmission,
          homeLocationId: loc.id,
          currentLocationId: loc.id,
          status: v.status,
          currentDriverId: null,
        },
      });
    }
  }

  // Clean up any unreferenced standalone test vehicles outside the official 42 fleet
  const otherVehicles = await prisma.vehicle.findMany({
    where: { plateNumber: { notIn: Array.from(seededPlates) } },
    include: { bookings: { select: { id: true } }, trips: { select: { id: true } } },
  });

  for (const extra of otherVehicles) {
    if (extra.bookings.length === 0 && extra.trips.length === 0) {
      await prisma.vehicleLocation.deleteMany({ where: { vehicleId: extra.id } });
      await prisma.vehicleAssignment.deleteMany({ where: { vehicleId: extra.id } });
      await prisma.vehicle.delete({ where: { id: extra.id } });
    }
  }

  console.log(`Demo data seeded successfully:`);
  console.log(`- 6 Operational Hubs`);
  console.log(`- 42 Total Vehicles (7 per hub: 5 AVAILABLE, 1 INACTIVE, 1 MAINTENANCE)`);
  console.log(`- 6 Drivers (all status: OFFLINE, ready for vehicle assignment)`);
  console.log(`- Admin & User accounts ready with password 'Demo1234'`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
