import { z } from 'zod';
import type { AppConfig } from './config';

const accountSchema = z.object({
  email: z.string().email(),
  planType: z.string().min(1).max(80),
  creditBalance: z.number().finite().nonnegative(),
  creditLimit: z.number().finite().nonnegative(),
  projectCount: z.number().int().nonnegative(),
});

export type AntigravityAccountData = z.infer<typeof accountSchema>;

export class UpstreamConfigurationError extends Error {
  constructor(message = 'Antigravity upstream is not configured') {
    super(message);
    this.name = 'UpstreamConfigurationError';
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(message = 'Antigravity upstream is unavailable') {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

export interface AntigravityClient {
  fetchAccountData(credential: string): Promise<AntigravityAccountData>;
  validateCredential(credential: string): Promise<boolean>;
  configured: boolean;
  mockMode: boolean;
}

type FetchLike = typeof fetch;

async function request(
  config: AppConfig,
  fetchImpl: FetchLike,
  endpoint: 'account' | 'validate',
  credential: string,
): Promise<{ status: number; data: unknown }> {
  if (!config.antigravityApiUrl) throw new UpstreamConfigurationError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const response = await fetchImpl(`${config.antigravityApiUrl}/${endpoint}`, {
      headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > 262_144) throw new UpstreamUnavailableError('Antigravity response exceeded the size limit');
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new UpstreamUnavailableError('Antigravity returned invalid JSON');
      }
    }
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) throw error;
    throw new UpstreamUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

export function createAntigravityClient(config: AppConfig, fetchImpl: FetchLike = globalThis.fetch): AntigravityClient {
  if (typeof fetchImpl !== 'function') throw new UpstreamConfigurationError('Fetch API is unavailable');
  return {
    configured: Boolean(config.antigravityApiUrl),
    mockMode: config.antigravityMockMode,

    async validateCredential(credential: string): Promise<boolean> {
      if (config.antigravityMockMode) return credential.startsWith('demo_') && credential.length >= 12;
      const result = await request(config, fetchImpl, 'validate', credential);
      if (result.status >= 200 && result.status < 300) return true;
      if (result.status >= 400 && result.status < 500) return false;
      throw new UpstreamUnavailableError();
    },

    async fetchAccountData(credential: string): Promise<AntigravityAccountData> {
      if (config.antigravityMockMode) {
        if (!(credential.startsWith('demo_') && credential.length >= 12)) {
          throw new UpstreamUnavailableError('Demo credential is invalid');
        }
        return {
          email: 'demo@local.invalid',
          planType: 'demo',
          creditBalance: 30,
          creditLimit: 30,
          projectCount: 0,
        };
      }
      const result = await request(config, fetchImpl, 'account', credential);
      if (result.status === 401 || result.status === 403) throw new UpstreamUnavailableError('Antigravity credential was rejected');
      if (result.status < 200 || result.status >= 300) throw new UpstreamUnavailableError();
      const parsed = accountSchema.safeParse(result.data);
      if (!parsed.success) throw new UpstreamUnavailableError('Antigravity response schema was invalid');
      return parsed.data;
    },
  };
}
