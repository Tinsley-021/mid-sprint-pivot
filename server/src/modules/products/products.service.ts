import { prisma } from '../../lib/prisma.js';
import { stockStatus } from '../inventory/inventory.service.js';
import { InventoryError } from '../inventory/inventory.errors.js';

/**
 * Products are org-wide; stock is per-branch (Inventory). The management
 * dashboard wants one row per product *per branch* — the same shape the
 * inventory core already produces via Inventory + its Product/Branch
 * relations — so we flatten that here rather than inventing a second
 * source of truth.
 */
export async function listProductStock(organizationId: string) {
  const rows = await prisma.inventory.findMany({
    where: { organizationId },
    include: { product: true, branch: true },
    orderBy: [{ product: { name: 'asc' } }],
  });

  return rows.map((row) => {
    const available = row.quantityOnHand - row.quantityReserved;
    return {
      id: row.id,
      productId: row.productId,
      name: row.product.name,
      sku: row.product.sku,
      category: row.product.category ?? 'Uncategorized',
      price: Number(row.product.sellingPrice),
      branchId: row.branchId,
      branchName: row.branch.name,
      quantity: row.quantityOnHand,
      reserved: row.quantityReserved,
      reorderLevel: row.reorderLevel,
      status: stockStatus(available, row.reorderLevel),
    };
  });
}

export interface CreateProductInput {
  name: string;
  sku: string;
  category?: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  branchId: string;
  quantityOnHand: number;
}

/**
 * Create a new product and stock it at one branch. If the SKU already
 * exists for this org, we treat this as "stock the existing product at
 * (another) branch" instead of erroring — that's the more useful behavior
 * for an admin restocking the same item at a new location.
 */
export async function createProduct(organizationId: string, input: CreateProductInput) {
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId } });
  if (!branch) throw new InventoryError('BRANCH_NOT_FOUND', 'Branch not found', 404);

  let product = await prisma.product.findFirst({ where: { organizationId, sku: input.sku } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        organizationId,
        name: input.name,
        sku: input.sku,
        category: input.category,
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        reorderLevel: input.reorderLevel,
      },
    });
  }

  const inventory = await prisma.inventory.upsert({
    where: { productId_branchId: { productId: product.id, branchId: input.branchId } },
    create: {
      organizationId,
      productId: product.id,
      branchId: input.branchId,
      quantityOnHand: input.quantityOnHand,
      reorderLevel: input.reorderLevel,
    },
    update: {
      quantityOnHand: { increment: input.quantityOnHand },
    },
  });

  return { product, inventory };
}

export async function searchAvailability(organizationId: string, query: string) {
  const q = query.trim();
  const rows = await prisma.inventory.findMany({
    where: {
      organizationId,
      ...(q
        ? {
            product: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    include: { product: true, branch: true },
  });

  return rows.map((row) => {
    const available = row.quantityOnHand - row.quantityReserved;
    return {
      id: row.id,
      productId: row.productId,
      name: row.product.name,
      sku: row.product.sku,
      branch: row.branch.name,
      branchId: row.branchId,
      availableQuantity: Math.max(0, available),
      inStock: available > 0,
    };
  });
}
