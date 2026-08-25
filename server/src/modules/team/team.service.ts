import { Role, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { hashPassword } from '../../lib/password.js';
import { generateOpaqueToken } from '../../lib/tokens.js';
import { emailSender } from '../../lib/email.js';
import { AuthError } from '../auth/auth.errors.js';

// Roles assignable through this API. SUPER_ADMIN is a platform-level role, not
// something one tenant's OWNER/ADMIN can grant to a teammate.
const ASSIGNABLE_ROLES: Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.BRANCH_MANAGER,
  Role.INVENTORY_MANAGER,
  Role.CASHIER,
  Role.SUPPORT_AGENT,
  Role.ACCOUNTANT,
];

// Only an OWNER can grant OWNER or ADMIN — an ADMIN inviting/promoting someone
// to their own level (or above) would be a privilege-escalation hole.
const OWNER_ONLY_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

function publicMember(u: {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listMembers(organizationId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
  return users.map(publicMember);
}

export interface InviteInput {
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  invitedByRole: Role;
}

export async function inviteMember(input: InviteInput) {
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    throw new AuthError('INVALID_ROLE', 'That role cannot be assigned', 400);
  }
  if (OWNER_ONLY_ROLES.includes(input.role) && input.invitedByRole !== Role.OWNER) {
    throw new AuthError('FORBIDDEN', 'Only an owner can grant Owner or Admin access', 403);
  }

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError('EMAIL_IN_USE', 'Someone with this email already has an account', 409);
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });

  // The invited user can't log in with this — it's a random hash discarded
  // immediately. They authenticate for the first time by consuming the
  // set-password token below, the same single-use flow as a password reset.
  const passwordHash = await hashPassword(generateOpaqueToken().raw);

  const user = await prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash,
    },
  });

  const { raw, hash } = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  const setPasswordUrl = `${env.APP_URL}/reset-password?token=${raw}`;
  await emailSender.sendTeamInvite(user.email, user.name, organization.name, setPasswordUrl);

  return publicMember(user);
}

export interface UpdateMemberInput {
  organizationId: string;
  targetUserId: string;
  actingUserId: string;
  actingUserRole: Role;
  role?: Role;
  status?: UserStatus;
}

export async function updateMember(input: UpdateMemberInput) {
  const target = await prisma.user.findFirst({ where: { id: input.targetUserId, organizationId: input.organizationId } });
  if (!target) throw new AuthError('USER_NOT_FOUND', 'Team member not found', 404);

  if (target.id === input.actingUserId) {
    throw new AuthError('CANNOT_MODIFY_SELF', 'You can\u2019;t change your own role or status here', 400);
  }

  if (input.role) {
    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      throw new AuthError('INVALID_ROLE', 'That role cannot be assigned', 400);
    }
    if (OWNER_ONLY_ROLES.includes(input.role) && input.actingUserRole !== Role.OWNER) {
      throw new AuthError('FORBIDDEN', 'Only an owner can grant Owner or Admin access', 403);
    }
    if (OWNER_ONLY_ROLES.includes(target.role) && input.actingUserRole !== Role.OWNER) {
      throw new AuthError('FORBIDDEN', 'Only an owner can change another Owner or Admin\u2019;s role', 403);
    }
  }

  if (input.status === UserStatus.SUSPENDED && target.role === Role.OWNER) {
    const activeOwners = await prisma.user.count({
      where: { organizationId: input.organizationId, role: Role.OWNER, status: UserStatus.ACTIVE },
    });
    if (activeOwners <= 1) {
      throw new AuthError('LAST_OWNER', 'An organization needs at least one active owner', 400);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: target.id },
      data: { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) },
    });
    if (input.status === UserStatus.SUSPENDED) {
      // Suspending someone should end their existing sessions immediately,
      // not just block future logins.
      await tx.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return u;
  });

  return publicMember(updated);
}
