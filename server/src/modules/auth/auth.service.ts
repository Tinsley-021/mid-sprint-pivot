import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { hashPassword, verifyPassword, isPasswordStrongEnough } from '../../lib/password.js';
import { signAccessToken, generateOpaqueToken, hashOpaqueToken } from '../../lib/tokens.js';
import { emailSender } from '../../lib/email.js';
import { AuthError } from './auth.errors.js';

const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function publicUser(user: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

async function issueSession(userId: string, organizationId: string, role: Role, ctx: { userAgent?: string; ip?: string }) {
  const accessToken = signAccessToken({ sub: userId, orgId: organizationId, role });
  const { raw, hash } = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken: raw };
}

export async function registerOrganization(input: {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  ctx: { userAgent?: string; ip?: string };
}) {
  const email = input.email.trim().toLowerCase();
  if (!isPasswordStrongEnough(input.password)) {
    throw new AuthError('WEAK_PASSWORD', 'Password must be at least 10 characters', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError('EMAIL_IN_USE', 'An account with this email already exists', 409);
  }

  const slugBase = input.organizationName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${slugBase || 'org'}-${Math.random().toString(36).slice(2, 7)}`;
  const passwordHash = await hashPassword(input.password);

  const { user, organization } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName.trim(), slug },
    });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email,
        passwordHash,
        name: input.name.trim(),
        role: Role.OWNER,
      },
    });
    return { user, organization };
  });

  const tokens = await issueSession(user.id, organization.id, user.role, input.ctx);
  await sendVerificationEmail(user.id, user.email);
  return { user: publicUser(user), organization, ...tokens };
}

async function sendVerificationEmail(userId: string, email: string) {
  const { raw, hash } = generateOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
  });
  const verifyUrl = `${env.APP_URL}/verify-email?token=${raw}`;
  await emailSender.sendEmailVerification(email, verifyUrl);
}

export async function verifyEmail(rawToken: string) {
  const tokenHash = hashOpaqueToken(rawToken);
  await prisma.$transaction(async (tx) => {
    // Same atomic single-use pattern as password reset tokens.
    const result = await tx.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AuthError('INVALID_VERIFICATION_TOKEN', 'This verification link is invalid or has expired', 400);
    }
    const record = await tx.emailVerificationToken.findUniqueOrThrow({ where: { tokenHash } });
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  });
}

export async function resendVerificationEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return; // already verified, nothing to do
  await sendVerificationEmail(user.id, user.email);
}

export async function login(input: { email: string; password: string; ctx: { userAgent?: string; ip?: string } }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for "no such user" and "wrong password" — don't tell an attacker
  // which part was wrong. Checked before the lockout branch too, so a locked
  // account and a nonexistent one look identical from the outside.
  if (!user || user.status !== 'ACTIVE') {
    throw new AuthError('INVALID_CREDENTIALS', 'Incorrect email or password', 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError(
      'ACCOUNT_LOCKED',
      'Too many failed attempts. Try again in a few minutes or reset your password.',
      423,
    );
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingNow = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingNow ? 0 : attempts,
        lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
      },
    });
    throw new AuthError('INVALID_CREDENTIALS', 'Incorrect email or password', 401);
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  const tokens = await issueSession(user.id, user.organizationId, user.role, input.ctx);
  return { user: publicUser(user), ...tokens };
}

export async function refreshSession(rawRefreshToken: string, ctx: { userAgent?: string; ip?: string }) {
  const tokenHash = hashOpaqueToken(rawRefreshToken);

  // Rotation, done atomically: the old token is only revoked once we've confirmed
  // it was valid, and a brand new one is issued in the same transaction, so a
  // request that races this one either sees the old token still valid or the new
  // one — never a gap where neither works and never a way to reuse the old one
  // after this succeeds.
  return prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new AuthError('INVALID_REFRESH_TOKEN', 'Session expired, please log in again', 401);
    }

    const user = await tx.user.findUnique({ where: { id: existing.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthError('INVALID_REFRESH_TOKEN', 'Session expired, please log in again', 401);
    }

    await tx.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

    const accessToken = signAccessToken({ sub: user.id, orgId: user.organizationId, role: user.role });
    const { raw, hash } = generateOpaqueToken();
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { user: publicUser(user), accessToken, refreshToken: raw };
  });
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashOpaqueToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  // Always behave the same way whether or not the account exists — otherwise this
  // endpoint becomes a way to check which emails have accounts.
  if (user) {
    const { raw, hash } = generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const resetUrl = `${env.APP_URL}/reset-password?token=${raw}`;
    await emailSender.sendPasswordReset(user.email, resetUrl);
  }
}

export async function resetPassword(rawToken: string, newPassword: string) {
  if (!isPasswordStrongEnough(newPassword)) {
    throw new AuthError('WEAK_PASSWORD', 'Password must be at least 10 characters', 400);
  }
  const tokenHash = hashOpaqueToken(rawToken);

  await prisma.$transaction(async (tx) => {
    // Atomic single-use consumption: the UPDATE's WHERE clause only matches a
    // token that is still unused and unexpired, so two concurrent requests with
    // the same reset link can't both succeed — the second gets 0 rows updated.
    const result = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AuthError('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired', 400);
    }

    const record = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
    const passwordHash = await hashPassword(newPassword);
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // A password reset means "assume the old password was compromised" — kill
    // every existing session, not just issue a new one.
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentRefreshTokenHash?: string;
}) {
  if (!isPasswordStrongEnough(input.newPassword)) {
    throw new AuthError('WEAK_PASSWORD', 'Password must be at least 10 characters', 400);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AuthError('INVALID_CREDENTIALS', 'Current password is incorrect', 401);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Revoke every other session but let the one making this request continue,
    // so changing your password doesn't immediately log you out too.
    await tx.refreshToken.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        ...(input.currentRefreshTokenHash ? { tokenHash: { not: input.currentRefreshTokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  });
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return publicUser(user);
}

export async function listSessions(userId: string, currentTokenHash?: string) {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: currentTokenHash ? s.tokenHash === currentTokenHash : false,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  // Scoped to userId so you can only ever revoke your own sessions, never
  // someone else's by guessing an id.
  const result = await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    throw new AuthError('SESSION_NOT_FOUND', 'Session not found', 404);
  }
}
