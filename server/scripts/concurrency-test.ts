import { PrismaClient } from '@prisma/client';
import { reserveStock } from '../src/modules/inventory/inventory.service.js';
import { InsufficientStockError } from '../src/modules/inventory/inventory.errors.js';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-retail' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { organizationId: org.id, code: 'LOS-01' } });
  const product = await prisma.product.findFirstOrThrow({ where: { organizationId: org.id, sku: 'IPH15-128' } });

  const before = await prisma.inventory.findFirstOrThrow({ where: { productId: product.id, branchId: branch.id } });
  console.log(`Before: onHand=${before.quantityOnHand} reserved=${before.quantityReserved} (available=${before.quantityOnHand - before.quantityReserved})`);

  if (before.quantityOnHand - before.quantityReserved !== 1) {
    throw new Error('Expected exactly 1 unit available for this test — re-run `npm run seed` first.');
  }

  console.log('Firing two simultaneous reservations for 1 unit each (only one should succeed)...');

  const attempt = (label: string) =>
    reserveStock({
      organizationId: org.id,
      productId: product.id,
      branchId: branch.id,
      quantity: 1,
      referenceType: 'test-order',
      referenceId: label,
      performedBy: 'concurrency-test',
    })
      .then(() => ({ label, outcome: 'RESERVED' as const }))
      .catch((err) => {
        if (err instanceof InsufficientStockError) {
          return { label, outcome: 'REJECTED_409' as const };
        }
        throw err;
      });

  const [a, b] = await Promise.all([attempt('customer-A'), attempt('customer-B')]);
  console.log('Result A:', a);
  console.log('Result B:', b);

  const after = await prisma.inventory.findFirstOrThrow({ where: { productId: product.id, branchId: branch.id } });
  console.log(`After: onHand=${after.quantityOnHand} reserved=${after.quantityReserved} (available=${after.quantityOnHand - after.quantityReserved})`);

  const reservedCount = [a, b].filter((r) => r.outcome === 'RESERVED').length;
  const rejectedCount = [a, b].filter((r) => r.outcome === 'REJECTED_409').length;

  if (reservedCount === 1 && rejectedCount === 1 && after.quantityReserved === 1 && after.quantityOnHand - after.quantityReserved === 0) {
    console.log('\n✅ PASS — exactly one request was reserved, the other got INSUFFICIENT_STOCK, no overselling.');
  } else {
    console.error('\n❌ FAIL — concurrency guarantee violated.');
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
