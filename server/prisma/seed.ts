import { PrismaClient } from '@prisma/client';

// Development-only seed data. Do not run against a production database.
const prisma = new PrismaClient();

async function main() {
  await prisma.inventoryTransaction.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: 'Acme Retail Group', slug: 'acme-retail' },
  });

  const otherOrg = await prisma.organization.create({
    data: { name: 'Zenith Stores', slug: 'zenith-stores' },
  });

  const lagos = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Lagos Central', code: 'LOS-01', city: 'Lagos', country: 'Nigeria' },
  });
  const kaduna = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Kaduna Branch', code: 'KAD-01', city: 'Kaduna', country: 'Nigeria' },
  });

  const iphone = await prisma.product.create({
    data: {
      organizationId: org.id,
      name: 'iPhone 15',
      sku: 'IPH15-128',
      costPrice: '520000',
      sellingPrice: '650000',
      reorderLevel: 3,
      reorderQuantity: 10,
    },
  });

  const headphones = await prisma.product.create({
    data: {
      organizationId: org.id,
      name: 'Sony WH-1000XM5',
      sku: 'SONY-XM5',
      costPrice: '480000',
      sellingPrice: '620000',
      reorderLevel: 5,
      reorderQuantity: 15,
    },
  });

  await prisma.inventory.create({
    data: { organizationId: org.id, productId: iphone.id, branchId: lagos.id, quantityOnHand: 1, reorderLevel: 3 },
  });
  await prisma.inventory.create({
    data: { organizationId: org.id, productId: iphone.id, branchId: kaduna.id, quantityOnHand: 0, reorderLevel: 3 },
  });
  await prisma.inventory.create({
    data: { organizationId: org.id, productId: headphones.id, branchId: lagos.id, quantityOnHand: 12, reorderLevel: 5 },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded:');
  // eslint-disable-next-line no-console
  console.log({ orgId: org.id, otherOrgId: otherOrg.id, lagosBranchId: lagos.id, kadunaBranchId: kaduna.id, iphoneId: iphone.id, headphonesId: headphones.id });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
