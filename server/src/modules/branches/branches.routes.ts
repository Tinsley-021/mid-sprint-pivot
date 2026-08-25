import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as branchesService from './branches.service.js';

export const branchesRouter = Router();
branchesRouter.use(requireAuth);

branchesRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const branches = await branchesService.listBranches(req.auth!.organizationId);
    res.json({ success: true, branches });
  }),
);

const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
});

branchesRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN),
  asyncRoute(async (req, res) => {
    const input = createBranchSchema.parse(req.body);
    const branch = await branchesService.createBranch(req.auth!.organizationId, input);
    res.status(201).json({ success: true, branch });
  }),
);
