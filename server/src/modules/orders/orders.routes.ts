import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as ordersService from './orders.service.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const items = await ordersService.listOrders(req.auth!.organizationId);
    res.json({ success: true, items });
  }),
);

const createOrderSchema = z.object({
  productId: z.string().min(1),
  branchId: z.string().min(1),
  customer: z.string().max(160).optional(),
  quantity: z.number().int().positive().max(1000).default(1),
});

ordersRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN, Role.BRANCH_MANAGER, Role.CASHIER, Role.INVENTORY_MANAGER),
  asyncRoute(async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    const result = await ordersService.createOrder({
      organizationId: req.auth!.organizationId,
      productId: input.productId,
      branchId: input.branchId,
      customerName: input.customer,
      quantity: input.quantity,
      performedBy: req.auth!.userId,
    });
    res.status(201).json({ success: true, ...result });
  }),
);
