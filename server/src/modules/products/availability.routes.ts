import { Router } from 'express';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as productsService from './products.service.js';

/**
 * Read-only stock-truth lookup by product name/SKU, scoped to the caller's
 * organization. This is what a support desk or AI assistant should query
 * before telling a customer whether something is in stock — same live
 * Inventory rows the dashboard reads, never a cached/derived copy.
 */
export const availabilityRouter = Router();
availabilityRouter.use(requireAuth);

availabilityRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const query = String(req.query.query ?? '');
    const products = await productsService.searchAvailability(req.auth!.organizationId, query);
    res.json({ success: true, query, found: products.length > 0, products });
  }),
);
