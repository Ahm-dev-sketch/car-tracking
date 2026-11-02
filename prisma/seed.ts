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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
