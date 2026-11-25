/**
 * PRODUCTION OPERATIONAL SEED (IDEMPOTENT)
 *
 * Seeds:
 * 1. Core roles (ADMIN, USER, DRIVER) via upsert
 * 2. Official KCIC hub locations if the locations table is empty
 * 3. Starter operational vehicles across KCIC hubs if the vehicles table is empty
 * 4. Official KCIC ADMIN and USER accounts with strong bcrypt-hashed passwords
 *    (preserves existing passwords on re-runs unless SEED_FORCE_PASSWORD_RESET=1
 *     or explicit SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD env vars are passed).
 *
 * Does NOT seed @demo.test accounts or enable ALLOW_DEMO_AUTH.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RoleCode, VehicleStatus, VehicleType, Transmission } from '@prisma/client';

if (!process.env.DATABASE_URL && !process.env.DIRECT_URL && !process.env.POSTGRES_PRISMA_URL) {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    /* .env optional */
  }
}

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  '';

if (!connectionString) {
  console.error('Error: DATABASE_URL (or DIRECT_URL) environment variable is required.');
  process.exit(1);
}

const isLocalHost = /localhost|127\.0\.0\.1/i.test(connectionString);
const pool = new pg.Pool({
  connectionString,
  max: 3,
  ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function generateStrongPassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#%*-_=+';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string) => charset[crypto.randomInt(0, charset.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function seedRoles(): Promise<Record<RoleCode, string>> {
  const specs = [
    { code: RoleCode.ADMIN, name: 'Administrator' },
    { code: RoleCode.USER, name: 'User' },
    { code: RoleCode.DRIVER, name: 'Driver' },
  ];

  const roleIds = {} as Record<RoleCode, string>;
  for (const r of specs) {
    const record = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: r,
    });
    roleIds[r.code] = record.id;
  }
  return roleIds;
}

async function seedLocationsIfEmpty(): Promise<Map<string, string>> {
  const defaultLocations = [
    { name: 'Halim', code: '102', latitude: -6.2494, longitude: 106.8914 },
    { name: 'Karawang', code: '202', latitude: -6.3802, longitude: 107.2488 },
    { name: 'Karawang', code: '204', latitude: -6.369, longitude: 107.262 },
    { name: 'Padalarang', code: '802', latitude: -6.837, longitude: 107.4845 },
    { name: 'Tegalluar Station', code: '402', latitude: -6.9297, longitude: 107.6623 },
    { name: 'Tegalluar Depo', code: '502', latitude: -6.921, longitude: 107.652 },
  ];

  const existingCount = await prisma.location.count();
  if (existingCount === 0) {
    for (const loc of defaultLocations) {
      await prisma.location.create({ data: loc });
    }
    console.log(`[seed-prod] Locations seeded: ${defaultLocations.length} KCIC hubs`);
  } else {
    console.log(`[seed-prod] Locations preserved: ${existingCount} existing records`);
  }

  const allLocations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });
  return new Map(allLocations.map((l) => [l.code, l.id]));
}

async function seedStarterVehiclesIfEmpty(locMap: Map<string, string>): Promise<void> {
  const existingCount = await prisma.vehicle.count();
  if (existingCount > 0) {
    console.log(`[seed-prod] Vehicles preserved: ${existingCount} existing records`);
    return;
  }

  const starterVehicles = [
    { locCode: '102', plateNumber: 'B 1021 KCF', brand: 'Toyota', model: 'Innova Zenix', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC },
    { locCode: '102', plateNumber: 'B 1022 KCF', brand: 'Toyota', model: 'Fortuner 2.8 VRZ', vehicleType: VehicleType.SUV, seatingCapacity: 5, transmission: Transmission.AUTOMATIC },
    { locCode: '202', plateNumber: 'T 2021 KCF', brand: 'Mitsubishi', model: 'Xpander Ultimate', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC },
    { locCode: '204', plateNumber: 'T 2041 KCF', brand: 'Toyota', model: 'Rush GR Sport', vehicleType: VehicleType.SUV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC },
    { locCode: '802', plateNumber: 'D 8021 KCF', brand: 'Toyota', model: 'Innova Zenix Hybrid', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC },
    { locCode: '402', plateNumber: 'D 4021 KCF', brand: 'Toyota', model: 'Innova Reborn Diesel', vehicleType: VehicleType.MPV, seatingCapacity: 7, transmission: Transmission.AUTOMATIC },
    { locCode: '502', plateNumber: 'D 5021 KCF', brand: 'Toyota', model: 'Hilux 4x4 Double Cab', vehicleType: VehicleType.TRUCK, seatingCapacity: 5, transmission: Transmission.MANUAL },
  ];

  let created = 0;
  const fallbackLocId = locMap.values().next().value as string | undefined;
  for (const v of starterVehicles) {
    const locId = locMap.get(v.locCode) ?? fallbackLocId;
    if (!locId) continue;

    await prisma.vehicle.upsert({
      where: { plateNumber: v.plateNumber },
      update: {},
      create: {
        plateNumber: v.plateNumber,
        brand: v.brand,
        model: v.model,
        vehicleType: v.vehicleType,
        seatingCapacity: v.seatingCapacity,
        transmission: v.transmission,
        homeLocationId: locId,
        currentLocationId: locId,
        status: VehicleStatus.AVAILABLE,
      },
    });
    created++;
  }
  console.log(`[seed-prod] Starter vehicles seeded: ${created} operational units`);
}

interface OperationalAccountSpec {
  roleCode: RoleCode;
  email: string;
  name: string;
  phone: string;
  explicitPassword?: string;
}

async function upsertOperationalAccount(
  spec: OperationalAccountSpec,
  roleId: string,
  forceReset: boolean
): Promise<{ role: RoleCode; email: string; status: string; initialPassword?: string }> {
  const normalizedEmail = spec.email.trim().toLowerCase();
  if (normalizedEmail.endsWith('@demo.test') || normalizedEmail.endsWith('@test.com')) {
    throw new Error(`Refusing to seed demo domain account in production: ${normalizedEmail}`);
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  const shouldSetPassword = !existing || forceReset || Boolean(spec.explicitPassword);
  const rawPassword = spec.explicitPassword?.trim() || generateStrongPassword(20);

  if (shouldSetPassword && (rawPassword.length < 12 || rawPassword.toLowerCase().includes('demo'))) {
    throw new Error(`Provided password for ${normalizedEmail} is too weak (min 12 chars, non-demo).`);
  }

  const passwordHash = await bcrypt.hash(rawPassword, 12);

  await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      roleId,
      isActive: true,
      ...(shouldSetPassword ? { passwordHash } : {}),
    },
    create: {
      email: normalizedEmail,
      name: spec.name,
      phone: spec.phone,
      roleId,
      passwordHash,
      isActive: true,
    },
  });

  if (!existing) {
    return { role: spec.roleCode, email: normalizedEmail, status: 'CREATED', initialPassword: rawPassword };
  }
  if (shouldSetPassword) {
    return { role: spec.roleCode, email: normalizedEmail, status: 'PASSWORD_UPDATED', initialPassword: rawPassword };
  }
  return { role: spec.roleCode, email: normalizedEmail, status: 'EXISTING_PRESERVED' };
}

async function main() {
  const roleIds = await seedRoles();
  const locMap = await seedLocationsIfEmpty();
  await seedStarterVehiclesIfEmpty(locMap);

  const forceReset = process.env.SEED_FORCE_PASSWORD_RESET === '1';

  const accounts: OperationalAccountSpec[] = [
    {
      roleCode: RoleCode.ADMIN,
      email: process.env.SEED_ADMIN_EMAIL || 'admin.ops@kcic.co.id',
      name: 'Admin Operasional KCIC',
      phone: '081110000001',
      explicitPassword: process.env.SEED_ADMIN_PASSWORD,
    },
    {
      roleCode: RoleCode.USER,
      email: process.env.SEED_USER_EMAIL || 'operasional@kcic.co.id',
      name: 'Staff Operasional KCIC',
      phone: '081110000002',
      explicitPassword: process.env.SEED_USER_PASSWORD,
    },
  ];

  const results = [];
  for (const account of accounts) {
    results.push(await upsertOperationalAccount(account, roleIds[account.roleCode], forceReset));
  }

  console.log('\n[seed-prod] Operational account summary:');
  for (const r of results) {
    if (r.initialPassword) {
      console.log(`  - [${r.role}] ${r.email} | status=${r.status} | password=${r.initialPassword}`);
    } else {
      console.log(`  - [${r.role}] ${r.email} | status=${r.status}`);
    }
  }
  console.log('[seed-prod] Done. Store generated credentials securely and rotate after first sign-in.');
}

main()
  .catch((err) => {
    console.error('[seed-prod] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
