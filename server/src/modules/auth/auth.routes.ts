import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncRoute } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { hashOpaqueToken } from '../../lib/tokens.js';
import { requireAuth } from './auth.middleware.js';
import { AuthError } from './auth.errors.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'retailsync_rt';
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

function ctxFrom(req: import('express').Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

// Generous but real limits — tight enough to blunt credential stuffing / token
// guessing, loose enough that a genuine user retrying a typo'd password won't get
// locked out reading a support article about it.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const forgotPasswordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});

authRouter.post(
  '/register',
  registerLimiter,
  asyncRoute(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.registerOrganization({ ...input, ctx: ctxFrom(req) });
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    res.status(201).json({ success: true, user: result.user, organization: result.organization, accessToken: result.accessToken });
  }),
);

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post(
  '/login',
  loginLimiter,
  asyncRoute(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login({ ...input, ctx: ctxFrom(req) });
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    res.json({ success: true, user: result.user, accessToken: result.accessToken });
  }),
);

authRouter.post(
  '/refresh',
  asyncRoute(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AuthError('INVALID_REFRESH_TOKEN', 'No active session', 401);
    const result = await authService.refreshSession(token, ctxFrom(req));
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    res.json({ success: true, user: result.user, accessToken: result.accessToken });
  }),
);

authRouter.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ success: true });
  }),
);

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  asyncRoute(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    // Same response whether or not the account exists — see auth.service.ts.
    res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  }),
);

const resetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(10).max(200) });

authRouter.post(
  '/reset-password',
  asyncRoute(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Password updated. Please log in again.' });
  }),
);

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) });

authRouter.post(
  '/change-password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const currentRefreshTokenHash = req.cookies?.[REFRESH_COOKIE]
      ? hashOpaqueToken(req.cookies[REFRESH_COOKIE])
      : undefined;
    await authService.changePassword({
      userId: req.auth!.userId,
      currentPassword,
      newPassword,
      currentRefreshTokenHash,
    });
    res.json({ success: true, message: 'Password changed. Your other sessions have been signed out.' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await authService.getProfile(req.auth!.userId);
    res.json({ success: true, user });
  }),
);

const verifyEmailSchema = z.object({ token: z.string().min(1) });

authRouter.post(
  '/verify-email',
  asyncRoute(async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    await authService.verifyEmail(token);
    res.json({ success: true, message: 'Email verified.' });
  }),
);

authRouter.post(
  '/resend-verification',
  requireAuth,
  forgotPasswordLimiter,
  asyncRoute(async (req, res) => {
    await authService.resendVerificationEmail(req.auth!.userId);
    res.json({ success: true, message: 'If your email isn\u2019;t verified yet, a new link has been sent.' });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  asyncRoute(async (req, res) => {
    const currentTokenHash = req.cookies?.[REFRESH_COOKIE] ? hashOpaqueToken(req.cookies[REFRESH_COOKIE]) : undefined;
    const sessions = await authService.listSessions(req.auth!.userId, currentTokenHash);
    res.json({ success: true, sessions });
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    await authService.revokeSession(req.auth!.userId, req.params.id);
    res.json({ success: true });
  }),
);
