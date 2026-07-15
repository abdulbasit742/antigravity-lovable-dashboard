export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  trustProxy: boolean;
  authSecret: string;
  adminPasswordHash: string;
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  corsOrigins: string[];
  antigravityApiUrl: string | null;
  antigravityMockMode: boolean;
  upstreamTimeoutMs: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} is required`);
  return value;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError(`Invalid boolean value: ${value}`);
}

function integerValue(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigurationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseOrigins(value: string | undefined, nodeEnv: AppConfig['nodeEnv']): string[] {
  const defaults = nodeEnv === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const origins = (value ? value.split(',') : defaults).map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes('*')) throw new ConfigurationError('CORS_ORIGINS cannot contain a wildcard');

  return [...new Set(origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigurationError(`Invalid CORS origin: ${origin}`);
    }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new ConfigurationError(`CORS origin must contain only scheme and host: ${origin}`);
    }
    if (nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new ConfigurationError(`Production CORS origins must use HTTPS: ${origin}`);
    }
    return url.origin;
  }))];
}

function parseUpstreamUrl(value: string | undefined, nodeEnv: AppConfig['nodeEnv']): string | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConfigurationError('ANTIGRAVITY_API_URL must be a valid URL');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigurationError('ANTIGRAVITY_API_URL cannot include credentials, query, or fragment');
  }
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(nodeEnv !== 'production' && isLoopback && url.protocol === 'http:')) {
    throw new ConfigurationError('ANTIGRAVITY_API_URL must use HTTPS (HTTP loopback is development-only)');
  }
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(rawEnv)) {
    throw new ConfigurationError('NODE_ENV must be development, test, or production');
  }
  const nodeEnv = rawEnv as AppConfig['nodeEnv'];
  const authSecret = required(env, 'DASHBOARD_AUTH_SECRET');
  if (authSecret.length < 32) throw new ConfigurationError('DASHBOARD_AUTH_SECRET must be at least 32 characters');

  const adminPasswordHash = required(env, 'DASHBOARD_ADMIN_PASSWORD_HASH');
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(adminPasswordHash)) {
    throw new ConfigurationError('DASHBOARD_ADMIN_PASSWORD_HASH must be a bcrypt hash');
  }

  const antigravityMockMode = booleanValue(env.ANTIGRAVITY_MOCK_MODE, false);
  if (nodeEnv === 'production' && antigravityMockMode) {
    throw new ConfigurationError('ANTIGRAVITY_MOCK_MODE cannot be enabled in production');
  }
  const antigravityApiUrl = parseUpstreamUrl(env.ANTIGRAVITY_API_URL, nodeEnv);
  if (nodeEnv === 'production' && !antigravityApiUrl) {
    throw new ConfigurationError('ANTIGRAVITY_API_URL is required in production');
  }

  return {
    nodeEnv,
    port: integerValue(env.PORT, 3000, 1, 65535, 'PORT'),
    trustProxy: booleanValue(env.TRUST_PROXY, nodeEnv === 'production'),
    authSecret,
    adminPasswordHash,
    sessionTtlSeconds: integerValue(env.SESSION_TTL_SECONDS, 28_800, 900, 86_400, 'SESSION_TTL_SECONDS'),
    cookieSecure: booleanValue(env.SESSION_COOKIE_SECURE, nodeEnv === 'production'),
    corsOrigins: parseOrigins(env.CORS_ORIGINS, nodeEnv),
    antigravityApiUrl,
    antigravityMockMode,
    upstreamTimeoutMs: integerValue(env.ANTIGRAVITY_TIMEOUT_MS, 8_000, 1_000, 30_000, 'ANTIGRAVITY_TIMEOUT_MS'),
  };
}
