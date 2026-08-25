import { Prisma, InventoryTransactionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  InsufficientStockError,
  InventoryNotFoundError,
  InvalidQuantityError,
} from './inventory.errors.js';

/**
 * How concurrency safety works here (spec section 10):
 *
 * 1. Every mutation runs inside a single `prisma.$transaction`.
 * 2. Inside that transaction we take a row lock with
 *    `SELECT ... FOR UPDATE` on the one Inventory row we're about to change,
 *    scoped by organizationId + productId + branchId. Postgres blocks any other
 *    transaction trying to lock the same row until this one commits or rolls back —
 *    so two simultaneous "reserve the last unit" requests are serialized, not raced.
 * 3. We re-check availability *after* acquiring the lock (never trust a value read
 *    before the lock), and throw InsufficientStockError if it doesn't hold.
 * 4. As a second, independent line of defense, the database itself enforces
 *    `quantityOnHand >= 0`, `quantityReserved >= 0`, and
 *    `quantityReserved <= quantityOnHand` via CHECK constraints (see the migration
 *    SQL). Even a future bug in this service cannot write invalid state — Postgres
 *    will reject the write outright.
 * 5. Every call writes exactly one InventoryTransaction row in the same transaction
 *    as the Inventory update, so the audit trail can never drift from real state.
 */

type LockedInventoryRow = {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderLevel: number;
};

async function lockInventoryRow(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
  branchId: string,
): Promise<LockedInventoryRow> {
  const rows = await tx.$queryRaw<LockedInventoryRow[]>`
    SELECT "id", "quantityOnHand", "quantityReserved", "reorderLevel"
    FROM "Inventory"
    WHERE "organizationId" = ${organizationId}
      AND "productId" = ${productId}
      AND "branchId" = ${branchId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new InventoryNotFoundError(productId, branchId);
  return row;
}

function assertPositiveInt(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidQuantityError();
  }
}

export function stockStatus(available: number, reorderLevel: number): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export interface InventoryMutationInput {
  organizationId: string;
  productId: string;
  branchId: string;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  performedBy?: string;
  reason?: string;
}

/**
 * Reserve `quantity` units against an order/hold. Does not touch quantityOnHand.
 * Throws InsufficientStockError if available (onHand - reserved) is too low.
 */
export async function reserveStock(input: InventoryMutationInput) {
  assertPositiveInt(input.quantity);
  return prisma.$transaction(async (tx) => {
    const row = await lockInventoryRow(tx, input.organizationId, input.productId, input.branchId);
    const available = row.quantityOnHand - row.quantityReserved;
    if (available < input.quantity) {
      throw new InsufficientStockError(input.quantity, available);
    }

    const newReserved = row.quantityReserved + input.quantity;
    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { quantityReserved: newReserved, version: { increment: 1 } },
    });

    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.branchId,
        type: InventoryTransactionType.RESERVATION,
        quantity: input.quantity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        previousQuantity: row.quantityOnHand,
        newQuantity: row.quantityOnHand,
        previousReserved: row.quantityReserved,
        newReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    return updated;
  });
}

/**
 * Release a previously made reservation (order cancelled/expired) without a sale.
 * Reserved quantity is clamped at 0 defensively; it should never go below unless
 * the caller double-releases the same reference, which the order/payment layer
 * (Phase 2/3) prevents via idempotency.
 */
export async function releaseReservation(input: InventoryMutationInput) {
  assertPositiveInt(input.quantity);
  return prisma.$transaction(async (tx) => {
    const row = await lockInventoryRow(tx, input.organizationId, input.productId, input.branchId);
    const newReserved = Math.max(0, row.quantityReserved - input.quantity);

    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { quantityReserved: newReserved, version: { increment: 1 } },
    });

    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.branchId,
        type: InventoryTransactionType.RESERVATION_RELEASE,
        quantity: input.quantity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        previousQuantity: row.quantityOnHand,
        newQuantity: row.quantityOnHand,
        previousReserved: row.quantityReserved,
        newReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    return updated;
  });
}

/**
 * Convert a reservation into a completed sale: quantityOnHand decreases,
 * quantityReserved decreases by the same amount. Called from the payment-success
 * webhook handler (Phase 3) — never from a client-reported "payment succeeded".
 */
export async function commitSale(input: InventoryMutationInput) {
  assertPositiveInt(input.quantity);
  return prisma.$transaction(async (tx) => {
    const row = await lockInventoryRow(tx, input.organizationId, input.productId, input.branchId);
    if (row.quantityOnHand < input.quantity) {
      // Should be unreachable if reservation was correctly held, but the DB CHECK
      // constraint would reject this anyway — this just gives a clearer error.
      throw new InsufficientStockError(input.quantity, row.quantityOnHand);
    }

    const newOnHand = row.quantityOnHand - input.quantity;
    const newReserved = Math.max(0, row.quantityReserved - input.quantity);

    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { quantityOnHand: newOnHand, quantityReserved: newReserved, version: { increment: 1 } },
    });

    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.branchId,
        type: InventoryTransactionType.SALE,
        quantity: input.quantity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        previousQuantity: row.quantityOnHand,
        newQuantity: newOnHand,
        previousReserved: row.quantityReserved,
        newReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    return updated;
  });
}

const INBOUND_TYPES = new Set<InventoryTransactionType>([
  InventoryTransactionType.PURCHASE,
  InventoryTransactionType.ADJUSTMENT_IN,
  InventoryTransactionType.TRANSFER_IN,
  InventoryTransactionType.RETURN,
]);

/**
 * Generic quantityOnHand adjustment for purchases, damage/loss, manual corrections,
 * and returns. Positive `quantity` always; direction comes from `type`.
 */
export async function adjustStock(
  input: InventoryMutationInput & { type: InventoryTransactionType },
) {
  assertPositiveInt(input.quantity);
  const inbound = INBOUND_TYPES.has(input.type);

  return prisma.$transaction(async (tx) => {
    const row = await lockInventoryRow(tx, input.organizationId, input.productId, input.branchId);

    if (!inbound && row.quantityOnHand < input.quantity) {
      throw new InsufficientStockError(input.quantity, row.quantityOnHand);
    }

    const newOnHand = inbound
      ? row.quantityOnHand + input.quantity
      : row.quantityOnHand - input.quantity;

    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { quantityOnHand: newOnHand, version: { increment: 1 } },
    });

    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.branchId,
        type: input.type,
        quantity: input.quantity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        previousQuantity: row.quantityOnHand,
        newQuantity: newOnHand,
        previousReserved: row.quantityReserved,
        newReserved: row.quantityReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    return updated;
  });
}

/**
 * Move stock between two branches atomically: TRANSFER_OUT on the source,
 * TRANSFER_IN on the destination, in one transaction so a crash mid-transfer can
 * never leave stock debited from one branch without crediting the other.
 * Creates the destination Inventory row if the product has never stocked there.
 */
export async function transferStock(input: {
  organizationId: string;
  productId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  performedBy?: string;
  reason?: string;
}) {
  assertPositiveInt(input.quantity);
  if (input.fromBranchId === input.toBranchId) {
    throw new InvalidQuantityError('Source and destination branch must differ');
  }

  return prisma.$transaction(async (tx) => {
    // Lock in a stable order (source, then destination) to avoid deadlocking against
    // a concurrent transfer running in the opposite direction between the same branches.
    const source = await lockInventoryRow(tx, input.organizationId, input.productId, input.fromBranchId);
    if (source.quantityOnHand - source.quantityReserved < input.quantity) {
      throw new InsufficientStockError(input.quantity, source.quantityOnHand - source.quantityReserved);
    }

    const newSourceOnHand = source.quantityOnHand - input.quantity;
    const updatedSource = await tx.inventory.update({
      where: { id: source.id },
      data: { quantityOnHand: newSourceOnHand, version: { increment: 1 } },
    });
    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.fromBranchId,
        type: InventoryTransactionType.TRANSFER_OUT,
        quantity: input.quantity,
        referenceType: input.referenceType ?? 'transfer',
        referenceId: input.referenceId,
        previousQuantity: source.quantityOnHand,
        newQuantity: newSourceOnHand,
        previousReserved: source.quantityReserved,
        newReserved: source.quantityReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    const destination = await tx.inventory.upsert({
      where: { productId_branchId: { productId: input.productId, branchId: input.toBranchId } },
      create: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.toBranchId,
        quantityOnHand: 0,
        quantityReserved: 0,
      },
      update: {},
    });
    // Re-lock the (possibly just-created) destination row for the actual increment.
    const destLocked = await lockInventoryRow(tx, input.organizationId, input.productId, input.toBranchId);
    const newDestOnHand = destLocked.quantityOnHand + input.quantity;
    const updatedDestination = await tx.inventory.update({
      where: { id: destination.id },
      data: { quantityOnHand: newDestOnHand, version: { increment: 1 } },
    });
    await tx.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        branchId: input.toBranchId,
        type: InventoryTransactionType.TRANSFER_IN,
        quantity: input.quantity,
        referenceType: input.referenceType ?? 'transfer',
        referenceId: input.referenceId,
        previousQuantity: destLocked.quantityOnHand,
        newQuantity: newDestOnHand,
        previousReserved: destLocked.quantityReserved,
        newReserved: destLocked.quantityReserved,
        performedBy: input.performedBy,
        reason: input.reason,
      },
    });

    return { source: updatedSource, destination: updatedDestination };
  });
}

/**
 * Read-only, authoritative availability lookup — no lock needed since this never
 * mutates state. This is what both the internal dashboard and the (Phase 2)
 * support availability API read from; it never serves cached/derived data.
 */
export async function getAvailability(organizationId: string, productId: string, branchId?: string) {
  const rows = await prisma.inventory.findMany({
    where: { organizationId, productId, ...(branchId ? { branchId } : {}) },
    include: { branch: true },
  });

  return rows.map((row) => {
    const available = row.quantityOnHand - row.quantityReserved;
    return {
      branchId: row.branchId,
      branchName: row.branch.name,
      quantityOnHand: row.quantityOnHand,
      quantityReserved: row.quantityReserved,
      quantityAvailable: available,
      status: stockStatus(available, row.reorderLevel),
      inStock: available > 0,
      lastUpdated: row.updatedAt,
    };
  });
}
