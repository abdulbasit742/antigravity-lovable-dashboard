import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { ConfigurationError, loadConfig } from './config';

const baseEnv = () => ({
  NODE_ENV: 'test',
  DASHBOARD_AUTH_SECRET: 's'.repeat(40),
  DASHBOARD_ADMIN_PASSWORD_HASH: bcrypt.hashSync('correct horse battery staple', 4),
  ANTIGRAVITY_MOCK_MODE: 'true',
});

describe('loadConfig', () => {
  it('loads a secure test configuration', () => {
    const config = loadConfig(baseEnv());
    expect(config.sessionTtlSeconds).toBe(28_800);
    expect(config.antigravityMockMode).toBe(true);
    expect(config.corsOrigins).toContain('http://localhost:5173');
  });

  it('rejects short auth secrets', () => {
    expect(() => loadConfig({ ...baseEnv(), DASHBOARD_AUTH_SECRET: 'short' })).toThrow(ConfigurationError);
  });

  it('rejects plaintext passwords', () => {
    expect(() => loadConfig({ ...baseEnv(), DASHBOARD_ADMIN_PASSWORD_HASH: 'password123456' })).toThrow(/bcrypt/);
  });

  it('rejects wildcard CORS', () => {
    expect(() => loadConfig({ ...baseEnv(), CORS_ORIGINS: '*' })).toThrow(/wildcard/);
  });

  it('requires HTTPS upstreams in production and disables mock mode', () => {
    expect(() => loadConfig({ ...baseEnv(), NODE_ENV: 'production' })).toThrow(/MOCK_MODE/);
    expect(() => loadConfig({
      ...baseEnv(), NODE_ENV: 'production', ANTIGRAVITY_MOCK_MODE: 'false', ANTIGRAVITY_API_URL: 'http://example.com',
    })).toThrow(/HTTPS/);
  });
});
