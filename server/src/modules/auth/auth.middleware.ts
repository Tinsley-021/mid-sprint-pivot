import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../../lib/tokens.js';
import { AuthError } from './auth.errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; organizationId: string; role: Role };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AuthError('UNAUTHENTICATED', 'Missing or invalid Authorization header', 401));
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.auth = { userId: payload.sub, organizationId: payload.orgId, role: payload.role as Role };
    next();
  } catch {
    next(new AuthError('UNAUTHENTICATED', 'Access token is invalid or expired', 401));
  }
}

/**
 * Every module built on this (branches, products, orders, ...) reads
 * req.auth.organizationId as the tenant filter for every query — this is what
 * makes tenant isolation enforced by the backend rather than trusted from the
 * client, per the spec's multi-tenancy requirement.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new AuthError('UNAUTHENTICATED', 'Not authenticated', 401));
    if (!roles.includes(req.auth.role)) {
      return next(new AuthError('FORBIDDEN', 'You do not have permission to do this', 403));
    }
    next();
  };
}
