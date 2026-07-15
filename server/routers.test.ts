import { describe, beforeEach, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { appRouter, csvCell, resetInMemoryState, validateLaunchUrl } from './routers';
import { loadConfig } from './config';
import type { Context } from './context';

const config = loadConfig({
  NODE_ENV: 'test',
  DASHBOARD_AUTH_SECRET: 'a'.repeat(40),
  DASHBOARD_ADMIN_PASSWORD_HASH: bcrypt.hashSync('correct horse battery staple', 4),
  ANTIGRAVITY_MOCK_MODE: 'true',
});

function context(authenticated = true): Context {
  return {
    req: {} as Context['req'],
    res: {} as Context['res'],
    config,
    session: authenticated ? { sub: 'operator', iat: 1, exp: 9999999999, nonce: '1234567890123456' } : null,
    antigravity: {
      configured: false,
      mockMode: true,
      validateCredential: async () => true,
      fetchAccountData: async () => ({
        email: 'upstream@example.com', planType: 'pro', creditBalance: 20, creditLimit: 30, projectCount: 2,
      }),
    },
  };
}

describe('protected dashboard router', () => {
  beforeEach(() => resetInMemoryState());

  it('rejects callers without an operator session', async () => {
    const caller = appRouter.createCaller(context(false));
    await expect(caller.account.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('never returns account credentials', async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.account.add({ email: 'owner@example.com', credential: 'super-secret-credential' });
    expect(result.account).toMatchObject({ email: 'owner@example.com', credentialConfigured: true });
    expect(JSON.stringify(result)).not.toContain('super-secret-credential');
    expect(JSON.stringify(await caller.account.list())).not.toContain('super-secret-credential');
  });

  it('rejects duplicate account identities', async () => {
    const caller = appRouter.createCaller(context());
    await caller.account.add({ email: 'owner@example.com', credential: 'credential-number-one' });
    await expect(caller.account.add({ email: 'OWNER@example.com', credential: 'credential-number-two' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('restricts screen URLs to safe public HTTPS targets', () => {
    expect(validateLaunchUrl('https://lovable.dev/path')).toBe('https://lovable.dev/path');
    expect(() => validateLaunchUrl('javascript:alert(1)')).toThrow(TRPCError);
    expect(() => validateLaunchUrl('https://127.0.0.1/admin')).toThrow(/public HTTPS/);
    expect(validateLaunchUrl('http://localhost:3000/', true)).toBe('http://localhost:3000/');
  });

  it('neutralizes spreadsheet formulas in CSV cells', () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell('normal@example.com')).toBe('"normal@example.com"');
  });
});
