import { PrismaClient, RoleCode } from '@prisma/client';

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
    { name: 'Halim', code: '102' },
    { name: 'Karawang', code: '202' },
    { name: 'Karawang', code: '204' },
    { name: 'Padalarang', code: '802' },
    { name: 'Tegalluar Station', code: '402' },
    { name: 'Tegalluar Depo', code: '502' },
  ];

  for (const loc of locations) {
    const existing = await prisma.location.findFirst({
      where: { name: loc.name, code: loc.code },
    });
    if (!existing) {
      await prisma.location.create({
        data: loc,
      });
    }
  }

  console.log('Locations seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
