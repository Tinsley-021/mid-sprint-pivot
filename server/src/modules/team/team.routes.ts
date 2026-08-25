import { Router } from 'express';
import { z } from 'zod';
import { Role, UserStatus } from '@prisma/client';
import { asyncRoute } from '../../lib/http.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as teamService from './team.service.js';

export const teamRouter = Router();
teamRouter.use(requireAuth);

teamRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const members = await teamService.listMembers(req.auth!.organizationId);
    res.json({ success: true, members });
  }),
);

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.nativeEnum(Role),
});

teamRouter.post(
  '/invite',
  requireRole(Role.OWNER, Role.ADMIN),
  asyncRoute(async (req, res) => {
    const input = inviteSchema.parse(req.body);
    const member = await teamService.inviteMember({
      organizationId: req.auth!.organizationId,
      email: input.email,
      name: input.name,
      role: input.role,
      invitedByRole: req.auth!.role,
    });
    res.status(201).json({ success: true, member });
  }),
);

const updateSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

teamRouter.patch(
  '/:userId',
  requireRole(Role.OWNER, Role.ADMIN),
  asyncRoute(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const member = await teamService.updateMember({
      organizationId: req.auth!.organizationId,
      targetUserId: req.params.userId,
      actingUserId: req.auth!.userId,
      actingUserRole: req.auth!.role,
      role: input.role,
      status: input.status,
    });
    res.json({ success: true, member });
  }),
);
