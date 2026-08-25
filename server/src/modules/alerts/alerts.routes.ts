import { Router } from 'express';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as alertsService from './alerts.service.js';

export const alertsRouter = Router();
alertsRouter.use(requireAuth);

alertsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const items = await alertsService.listStockAlerts(req.auth!.organizationId);
    res.json({ success: true, items });
  }),
);
