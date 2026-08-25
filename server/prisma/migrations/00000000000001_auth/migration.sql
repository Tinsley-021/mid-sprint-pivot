-- RetailSync Phase 2: auth session + password reset tables
-- Same note as the init migration: hand-authored because this sandbox can't reach
-- binaries.prisma.sh. Matches prisma/schema.prisma exactly; validated against a
-- live Postgres instance before shipping (see README).

-- Email becomes a single, platform-wide login identity (one account = one person)
-- instead of only unique within an org, since self-serve signup creates a new org
-- per registration rather than adding members to an existing one.
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_email_key";
ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");

CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userAgent" TEXT,
  "ip" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE TABLE "PasswordResetToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
