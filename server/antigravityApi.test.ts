import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createAntigravityClient, UpstreamConfigurationError } from './antigravityApi';
import { loadConfig } from './config';

function config(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DASHBOARD_AUTH_SECRET: 'a'.repeat(40),
    DASHBOARD_ADMIN_PASSWORD_HASH: bcrypt.hashSync('correct horse battery staple', 4),
    ANTIGRAVITY_API_URL: 'https://api.example.test/v1',
    ...overrides,
  });
}

describe('Antigravity client', () => {
  it('never treats a missing upstream as valid', async () => {
    const client = createAntigravityClient(config({ ANTIGRAVITY_API_URL: undefined }));
    await expect(client.validateCredential('long-enough-credential')).rejects.toBeInstanceOf(UpstreamConfigurationError);
  });

  it('supports explicit non-production demo mode only', async () => {
    const client = createAntigravityClient(config({ ANTIGRAVITY_API_URL: undefined, ANTIGRAVITY_MOCK_MODE: 'true' }));
    await expect(client.validateCredential('demo_credential')).resolves.toBe(true);
    await expect(client.validateCredential('production-token')).resolves.toBe(false);
  });

  it('uses fixed endpoints and validates account response shape', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      email: 'owner@example.com', planType: 'pro', creditBalance: 10, creditLimit: 30, projectCount: 2,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createAntigravityClient(config(), fetchImpl as typeof fetch);
    await expect(client.fetchAccountData('secret-credential')).resolves.toMatchObject({ planType: 'pro' });
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.example.test/v1/account');
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer secret-credential');
  });

  it('redacts network failures behind a stable error', async () => {
    const client = createAntigravityClient(config(), (async () => { throw new Error('credential=secret'); }) as typeof fetch);
    await expect(client.fetchAccountData('secret')).rejects.toEqual(expect.objectContaining({
      name: 'UpstreamUnavailableError', message: 'Antigravity upstream is unavailable',
    }));
  });
});
