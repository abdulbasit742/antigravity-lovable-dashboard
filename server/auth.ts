import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { AppConfig } from './config';

export const SESSION_COOKIE = 'antigravity_dashboard_session';

export interface SessionClaims {
  sub: 'operator';
  iat: number;
  exp: number;
  nonce: string;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(secret: string, ttlSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const claims: SessionClaims = {
    sub: 'operator',
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: randomBytes(16).toString('base64url'),
  };
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionClaims | null {
  if (!token || token.length > 2048) return null;
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra) return null;
  const expected = Buffer.from(signature(payload, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionClaims>;
    if (claims.sub !== 'operator' || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    if (typeof claims.nonce !== 'string' || claims.nonce.length < 16) return null;
    if ((claims.iat as number) > nowSeconds + 60 || (claims.exp as number) <= nowSeconds) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readSession(req: Request, config: AppConfig): SessionClaims | null {
  return verifySessionToken(readCookie(req.headers.cookie, SESSION_COOKIE), config.authSecret);
}

export function setSessionCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionTtlSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
  });
}

export async function verifyOperatorPassword(password: unknown, passwordHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) return false;
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

export function isOriginAllowed(req: Request, config: AppConfig): boolean {
  const origin = req.get('origin');
  if (!origin) return true;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  const hostOrigin = `${req.protocol}://${req.get('host')}`;
  return normalized === hostOrigin || config.corsOrigins.includes(normalized);
}

interface AttemptState {
  failures: number[];
  blockedUntil: number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly blockMs = 15 * 60_000,
  ) {}

  canAttempt(key: string, now = Date.now()): boolean {
    const state = this.attempts.get(key);
    if (!state) return true;
    if (state.blockedUntil > now) return false;
    state.failures = state.failures.filter((timestamp) => timestamp > now - this.windowMs);
    if (!state.failures.length) this.attempts.delete(key);
    return true;
  }

  recordFailure(key: string, now = Date.now()): void {
    const state = this.attempts.get(key) ?? { failures: [], blockedUntil: 0 };
    state.failures = state.failures.filter((timestamp) => timestamp > now - this.windowMs);
    state.failures.push(now);
    if (state.failures.length >= this.maxFailures) state.blockedUntil = now + this.blockMs;
    this.attempts.set(key, state);
    if (this.attempts.size > 10_000) this.attempts.delete(this.attempts.keys().next().value as string);
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}
