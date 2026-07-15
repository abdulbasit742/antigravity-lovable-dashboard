import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createSessionToken, LoginRateLimiter, readCookie, verifyOperatorPassword, verifySessionToken } from './auth';

describe('operator auth', () => {
  const secret = 'x'.repeat(40);

  it('creates and verifies bounded signed sessions', () => {
    const token = createSessionToken(secret, 900, 1000);
    expect(verifySessionToken(token, secret, 1001)?.sub).toBe('operator');
    expect(verifySessionToken(token, secret, 1900)).toBeNull();
  });

  it('rejects tampered session tokens', () => {
    const token = createSessionToken(secret, 900, 1000);
    expect(verifySessionToken(`${token}x`, secret, 1001)).toBeNull();
    expect(verifySessionToken(token, 'y'.repeat(40), 1001)).toBeNull();
  });

  it('parses encoded cookies safely', () => {
    expect(readCookie('a=1; antigravity_dashboard_session=hello%20world', 'antigravity_dashboard_session')).toBe('hello world');
    expect(readCookie(undefined, 'missing')).toBeUndefined();
  });

  it('verifies bcrypt passwords without accepting short values', async () => {
    const hash = bcrypt.hashSync('correct horse battery staple', 4);
    await expect(verifyOperatorPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyOperatorPassword('bad', hash)).resolves.toBe(false);
  });

  it('rate limits repeated failures and resets on success', () => {
    const limiter = new LoginRateLimiter(2, 1000, 5000);
    limiter.recordFailure('ip', 100);
    expect(limiter.canAttempt('ip', 101)).toBe(true);
    limiter.recordFailure('ip', 200);
    expect(limiter.canAttempt('ip', 201)).toBe(false);
    limiter.recordSuccess('ip');
    expect(limiter.canAttempt('ip', 202)).toBe(true);
  });
});
