import { Router } from 'express';
import { z } from 'zod';
import { InventoryTransactionType } from '@prisma/client';
import { asyncRoute } from '../../lib/http.js';
import {
  reserveStock,
  releaseReservation,
  commitSale,
  adjustStock,
  transferStock,
  getAvailability,
} from '../inventory/inventory.service.js';

// These routes exist to exercise and demonstrate the Phase 1 inventory core end to
// end. They take organizationId directly in the body rather than from an auth
// session because auth/tenant-context middleware lands in Phase 2. Do not expose
// these as-is in production — they bypass RBAC entirely.

export const devRouter = Router();

const mutationSchema = z.object({
  organizationId: z.string().min(1),
  productId: z.string().min(1),
  branchId: z.string().min(1),
  quantity: z.number().int().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  performedBy: z.string().optional(),
  reason: z.string().optional(),
});

devRouter.get(
  '/availability/:productId',
  asyncRoute(async (req, res) => {
    const organizationId = String(req.query.organizationId ?? '');
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_ORG', message: 'organizationId query param required' } });
    }
    const availability = await getAvailability(organizationId, req.params.productId, branchId);
    const totalAvailable = availability.reduce((sum, a) => sum + a.quantityAvailable, 0);
    res.json({
      success: true,
      productId: req.params.productId,
      availability,
      totalAvailable,
      inStock: totalAvailable > 0,
    });
  }),
);

devRouter.post(
  '/reserve',
  asyncRoute(async (req, res) => {
    const input = mutationSchema.parse(req.body);
    const result = await reserveStock(input);
    res.json({ success: true, inventory: result });
  }),
);

devRouter.post(
  '/release',
  asyncRoute(async (req, res) => {
    const input = mutationSchema.parse(req.body);
    const result = await releaseReservation(input);
    res.json({ success: true, inventory: result });
  }),
);

devRouter.post(
  '/commit-sale',
  asyncRoute(async (req, res) => {
    const input = mutationSchema.parse(req.body);
    const result = await commitSale(input);
    res.json({ success: true, inventory: result });
  }),
);

devRouter.post(
  '/adjust',
  asyncRoute(async (req, res) => {
    const input = mutationSchema
      .extend({ type: z.nativeEnum(InventoryTransactionType) })
      .parse(req.body);
    const result = await adjustStock(input);
    res.json({ success: true, inventory: result });
  }),
);

devRouter.post(
  '/transfer',
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        organizationId: z.string().min(1),
        productId: z.string().min(1),
        fromBranchId: z.string().min(1),
        toBranchId: z.string().min(1),
        quantity: z.number().int().positive(),
        performedBy: z.string().optional(),
        reason: z.string().optional(),
      })
      .parse(req.body);
    const result = await transferStock(input);
    res.json({ success: true, ...result });
  }),
);
