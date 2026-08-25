import { PrismaClient } from '@prisma/client';
import * as authService from '../src/modules/auth/auth.service.js';
import { AuthError } from '../src/modules/auth/auth.errors.js';

const prisma = new PrismaClient();
const ctx = { userAgent: 'test-script', ip: '127.0.0.1' };

async function main() {
  const email = `owner+${Date.now()}@example.com`;
  const password = 'a-long-enough-password';

  console.log('Registering...');
  const reg = await authService.registerOrganization({
    organizationName: 'Auth Test Co',
    name: 'Test Owner',
    email,
    password,
    ctx,
  });
  console.log('✅ Registered', reg.user.email, 'role:', reg.user.role);

  console.log('\nRejecting wrong password...');
  try {
    await authService.login({ email, password: 'wrong-password', ctx });
    console.error('❌ FAIL — wrong password was accepted');
    process.exitCode = 1;
  } catch (err) {
    if (err instanceof AuthError && err.code === 'INVALID_CREDENTIALS') {
      console.log('✅ PASS — wrong password rejected');
    } else {
      throw err;
    }
  }

  console.log('\nLogging in with correct password...');
  const loginResult = await authService.login({ email, password, ctx });
  console.log('✅ Logged in, access token issued');

  console.log('\nRotating refresh token...');
  const refreshed = await authService.refreshSession(loginResult.refreshToken, ctx);
  try {
    await authService.refreshSession(loginResult.refreshToken, ctx);
    console.error('❌ FAIL — old refresh token was reusable after rotation');
    process.exitCode = 1;
  } catch {
    console.log('✅ PASS — old refresh token rejected after rotation');
  }

  console.log('\nRequesting password reset (checking dev console for the link)...');
  await authService.requestPasswordReset(email);
  console.log('✅ Reset requested — see the [dev email] log line above for the link');

  console.log('\nDone. New access token from rotation:', Boolean(refreshed.accessToken));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
