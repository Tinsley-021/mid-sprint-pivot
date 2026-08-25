import { Router } from 'express';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as customersService from './customers.service.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const customers = await customersService.listCustomers(req.auth!.organizationId);
    res.json({ success: true, customers });
  }),
);
