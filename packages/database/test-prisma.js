const { PrismaClient } = require('@prisma/client');

async function test() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_DIRECT_URL } }});
  try {
    await prisma.$connect();
    console.log('PRISMA CONNECTED SUCCESSFULLY');
    const cases = await prisma.case.count();
    console.log('CASES:', cases);
  } catch (e) {
    console.error('PRISMA ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
