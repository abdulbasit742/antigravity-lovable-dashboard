import { afterEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { Server } from 'node:http';
import { createApp } from './index';
import { loadConfig } from './config';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start() {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    DASHBOARD_AUTH_SECRET: 'a'.repeat(40),
    DASHBOARD_ADMIN_PASSWORD_HASH: bcrypt.hashSync('correct horse battery staple', 4),
    ANTIGRAVITY_MOCK_MODE: 'true',
    CORS_ORIGINS: 'http://localhost:5173',
  });
  const server = createApp(config).listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return `http://127.0.0.1:${address.port}`;
}

describe('HTTP authentication boundary', () => {
  it('sets an HttpOnly Strict session cookie and reports authenticated state', async () => {
    const base = await start();
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie') || '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: cookie.split(';')[0] } });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toEqual({ authenticated: true });
  });

  it('rejects invalid passwords and disallowed origins', async () => {
    const base = await start();
    const badPassword = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong-password-value' }),
    });
    expect(badPassword.status).toBe(401);
    const badOrigin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    expect(badOrigin.status).toBe(403);
  });

  it('does not expose secrets in health output', async () => {
    const base = await start();
    const response = await fetch(`${base}/health`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain('correct horse');
    expect(text).not.toContain('aaaa');
  });
});
