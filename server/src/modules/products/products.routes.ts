import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as productsService from './products.service.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const items = await productsService.listProductStock(req.auth!.organizationId);
    res.json({ success: true, items });
  }),
);

const createProductSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().min(1).max(60),
  category: z.string().max(80).optional(),
  costPrice: z.number().nonnegative().default(0),
  sellingPrice: z.number().positive(),
  reorderLevel: z.number().int().nonnegative().default(0),
  branchId: z.string().min(1),
  quantityOnHand: z.number().int().nonnegative().default(0),
});

productsRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.BRANCH_MANAGER, Role.INVENTORY_MANAGER),
  asyncRoute(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    const { product, inventory } = await productsService.createProduct(req.auth!.organizationId, input);
    res.status(201).json({ success: true, product, inventory });
  }),
);
