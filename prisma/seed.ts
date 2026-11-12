import { PrismaClient, RoleCode, VehicleStatus, VehicleType, Transmission } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { code: RoleCode.ADMIN, name: 'Administrator' },
    { code: RoleCode.USER, name: 'User' },
    { code: RoleCode.DRIVER, name: 'Driver' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  console.log('Roles seeded successfully');

  const locations = [
    { name: 'Halim', code: '102', latitude: -6.2494, longitude: 106.8914 },
    { name: 'Karawang', code: '202', latitude: -6.3802, longitude: 107.2488 },
    { name: 'Karawang', code: '204', latitude: -6.369, longitude: 107.262 },
    { name: 'Padalarang', code: '802', latitude: -6.837, longitude: 107.4845 },
    { name: 'Tegalluar Station', code: '402', latitude: -6.9297, longitude: 107.6623 },
    { name: 'Tegalluar Depo', code: '502', latitude: -6.921, longitude: 107.652 },
  ];

  const locMap = new Map<string, string>();

  for (const loc of locations) {
    let existing = await prisma.location.findFirst({
      where: { name: loc.name, code: loc.code },
    });
    if (!existing) {
      existing = await prisma.location.create({
        data: loc,
      });
    } else {
      await prisma.location.update({
        where: { id: existing.id },
        data: { latitude: loc.latitude, longitude: loc.longitude },
      });
    }
    locMap.set(loc.code, existing.id);
  }

  console.log('Locations seeded successfully');

  // ---------- 7 Vehicles Per Location (5 Available, 1 Inactive, 1 Maintenance) ----------
  const fleetSpecs = [
    // 1. Halim (102)
    { locCode: '102', plateNumber: 'B 1234 CD', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '102', plateNumber: 'B 1021 KCF', brand: 'Toyota', model: 'Innova Zenix', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '102', plateNumber: 'B 1022 KCF', brand: 'Toyota', model: 'Fortuner 2.8 VRZ', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '102', plateNumber: 'B 1023 KCF', brand: 'Hyundai', model: 'Stargazer Prime', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '102', plateNumber: 'B 1024 KCF', brand: 'Toyota', model: 'HiAce Commuter', vehicleType: VehicleType.VAN, seatingCapacity: 12, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '102', plateNumber: 'B 7007 LM', brand: 'Toyota', model: 'Hilux Single Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '102', plateNumber: 'B 1027 KCF', brand: 'Daihatsu', model: 'Gran Max Blind Van', vehicleType: VehicleType.VAN, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },

    // 2. Karawang Hub 1 (202)
    { locCode: '202', plateNumber: 'D 5678 EF', brand: 'Toyota', model: 'Innova Reborn', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '202', plateNumber: 'T 2021 KCF', brand: 'Mitsubishi', model: 'Xpander Ultimate', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '202', plateNumber: 'T 2022 KCF', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '202', plateNumber: 'T 2023 KCF', brand: 'Honda', model: 'BR-V Prestige', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '202', plateNumber: 'T 2024 KCF', brand: 'Isuzu', model: 'D-Max Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '202', plateNumber: 'T 2026 KCF', brand: 'Suzuki', model: 'Carry Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '202', plateNumber: 'T 2027 KCF', brand: 'Daihatsu', model: 'Luxio 1.5 X', vehicleType: VehicleType.VAN, seatingCapacity: 8, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },

    // 3. Karawang Hub 2 (204)
    { locCode: '204', plateNumber: 'D 8888 GH', brand: 'Mitsubishi', model: 'Xpander Sport', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '204', plateNumber: 'T 2041 KCF', brand: 'Toyota', model: 'Rush GR Sport', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '204', plateNumber: 'T 2042 KCF', brand: 'Mitsubishi', model: 'Pajero Sport Dakar', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '204', plateNumber: 'T 2043 KCF', brand: 'Toyota', model: 'Veloz Q CVT', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '204', plateNumber: 'T 2044 KCF', brand: 'Toyota', model: 'Hilux Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '204', plateNumber: 'T 2046 KCF', brand: 'Daihatsu', model: 'Gran Max Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '204', plateNumber: 'T 2047 KCF', brand: 'Toyota', model: 'Avanza 1.3 E', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },

    // 4. Padalarang (802)
    { locCode: '802', plateNumber: 'B 9999 XY', brand: 'Toyota', model: 'Fortuner 2.4 G', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '802', plateNumber: 'D 8021 KCF', brand: 'Toyota', model: 'Innova Zenix Hybrid', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '802', plateNumber: 'D 8022 KCF', brand: 'Honda', model: 'HR-V SE', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '802', plateNumber: 'D 8023 KCF', brand: 'Toyota', model: 'Avanza 1.5 G', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '802', plateNumber: 'D 8024 KCF', brand: 'Toyota', model: 'HiAce Premio', vehicleType: VehicleType.VAN, seatingCapacity: 10, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '802', plateNumber: 'D 8026 KCF', brand: 'Mitsubishi', model: 'Triton Single Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 2, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '802', plateNumber: 'D 8027 KCF', brand: 'Nissan', model: 'Serena Highway Star', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.MAINTENANCE },

    // 5. Tegalluar Station (402)
    { locCode: '402', plateNumber: 'T 2020 AB', brand: 'Honda', model: 'Brio RS', vehicleType: VehicleType.SEDAN, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '402', plateNumber: 'D 4021 KCF', brand: 'Toyota', model: 'Innova Reborn Diesel', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '402', plateNumber: 'D 4022 KCF', brand: 'Hyundai', model: 'Creta Prime', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '402', plateNumber: 'D 4023 KCF', brand: 'Mitsubishi', model: 'Xpander Cross', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '402', plateNumber: 'D 4024 KCF', brand: 'Toyota', model: 'Veloz 1.5 Q', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '402', plateNumber: 'D 4026 KCF', brand: 'Daihatsu', model: 'Gran Max Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '402', plateNumber: 'D 4027 KCF', brand: 'Suzuki', model: 'APV Arena', vehicleType: VehicleType.VAN, seatingCapacity: 8, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },

    // 6. Tegalluar Depo (502)
    { locCode: '502', plateNumber: 'D 5021 KCF', brand: 'Toyota', model: 'Hilux 4x4 Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '502', plateNumber: 'D 5022 KCF', brand: 'Mitsubishi', model: 'Triton 4x4', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '502', plateNumber: 'D 5023 KCF', brand: 'Toyota', model: 'Fortuner 4x4', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC, status: VehicleStatus.AVAILABLE },
    { locCode: '502', plateNumber: 'D 5024 KCF', brand: 'Isuzu', model: 'Elf Microbus', vehicleType: VehicleType.VAN, seatingCapacity: 16, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '502', plateNumber: 'D 5025 KCF', brand: 'Toyota', model: 'HiAce Commuter', vehicleType: VehicleType.VAN, seatingCapacity: 12, transmission: Transmission.MANUAL, status: VehicleStatus.AVAILABLE },
    { locCode: '502', plateNumber: 'D 5026 KCF', brand: 'Mitsubishi', model: 'Colt L300 Pick Up', vehicleType: VehicleType.TRUCK, seatingCapacity: 3, transmission: Transmission.MANUAL, status: VehicleStatus.INACTIVE },
    { locCode: '502', plateNumber: 'T 3003 JK', brand: 'Daihatsu', model: 'Gran Max Blind Van', vehicleType: VehicleType.VAN, seatingCapacity: 6, transmission: Transmission.MANUAL, status: VehicleStatus.MAINTENANCE },
  ];

  for (const v of fleetSpecs) {
    const locId = locMap.get(v.locCode);
    if (!locId) continue;

    await prisma.vehicle.upsert({
      where: { plateNumber: v.plateNumber },
      update: {
        brand: v.brand,
        model: v.model,
        vehicleType: v.vehicleType,
        seatingCapacity: v.seatingCapacity,
        transmission: v.transmission,
        homeLocationId: locId,
        currentLocationId: locId,
        status: v.status,
      },
      create: {
        plateNumber: v.plateNumber,
        brand: v.brand,
        model: v.model,
        vehicleType: v.vehicleType,
        seatingCapacity: v.seatingCapacity,
        transmission: v.transmission,
        homeLocationId: locId,
        currentLocationId: locId,
        status: v.status,
      },
    });
  }

  console.log('Vehicles seeded successfully: 42 units (7 per location: 5 AVAILABLE, 1 INACTIVE, 1 MAINTENANCE)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
