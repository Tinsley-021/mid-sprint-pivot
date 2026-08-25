import { prisma } from '../../lib/prisma.js';
import { InventoryError } from '../inventory/inventory.errors.js';

/**
 * The tenant-isolation pattern every future module (products, orders, customers...)
 * should follow: organizationId always comes from the authenticated request
 * (req.auth.organizationId in the route), never from the request body, and every
 * query includes it. This is what makes cross-tenant access impossible by
 * construction rather than by remembering to check.
 */

export async function listBranches(organizationId: string) {
  return prisma.branch.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
}

export async function createBranch(organizationId: string, input: { name: string; code: string; city?: string; country?: string }) {
  const existing = await prisma.branch.findFirst({ where: { organizationId, code: input.code } });
  if (existing) {
    throw new InventoryError('BRANCH_CODE_TAKEN', `Branch code "${input.code}" is already in use`, 409);
  }
  return prisma.branch.create({
    data: {
      organizationId,
      name: input.name,
      code: input.code,
      city: input.city,
      country: input.country,
    },
  });
}
