import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from './env.js';

export interface AccessTokenPayload {
  sub: string; // user id
  orgId: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/**
 * Opaque, high-entropy tokens for refresh sessions and password resets. We never
 * store these directly — only sha256(token) — so a leaked database row (backup,
 * read replica, log line) can't be replayed as a live session or reset link.
 */
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
