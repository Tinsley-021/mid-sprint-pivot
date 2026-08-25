import { prisma } from '../../lib/prisma.js';

/**
 * Alerts are derived live from Inventory rather than read from the (persisted)
 * Alert table, so this can never show a stale signal — the same "never
 * cached/derived" rule the inventory core follows for getAvailability. The
 * Alert model still exists for durable, dismissible notifications (payment
 * failures, etc.) added in a later phase.
 */
export async function listStockAlerts(organizationId: string) {
  const rows = await prisma.inventory.findMany({
    where: { organizationId },
    include: { product: true, branch: true },
  });

  return rows
    .map((row) => ({ row, available: row.quantityOnHand - row.quantityReserved }))
    .filter(({ row, available }) => available <= row.reorderLevel)
    .sort((a, b) => a.available - b.available)
    .map(({ row, available }) => ({
      id: row.id,
      product: row.product.name,
      branch: row.branch.name,
      quantity: Math.max(0, available),
      reorderLevel: row.reorderLevel,
      severity: available <= 0 ? 'critical' : 'low',
    }));
}
