import 'dotenv/config';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContextFactory } from './context';
import { autoScheduler } from './autoScheduler';
import { createAntigravityClient } from './antigravityApi';
import { loadConfig, type AppConfig } from './config';
import {
  clearSessionCookie,
  createSessionToken,
  isOriginAllowed,
  LoginRateLimiter,
  readSession,
  setSessionCookie,
  verifyOperatorPassword,
} from './auth';

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  );
  next();
}

export function createApp(config: AppConfig) {
  const app = express();
  const antigravity = createAntigravityClient(config);
  const createContext = createContextFactory(config, antigravity);
  const limiter = new LoginRateLimiter();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(cors({
    credentials: true,
    methods: ['GET', 'POST'],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
  }));
  app.use(express.json({ limit: '32kb' }));

  const requireTrustedOrigin = (req: Request, res: Response, next: NextFunction) => {
    if (!isOriginAllowed(req, config)) {
      res.status(403).json({ error: { code: 'origin_not_allowed', message: 'Request origin is not allowed' } });
      return;
    }
    next();
  };

  app.post('/api/auth/login', requireTrustedOrigin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    if (!limiter.canAttempt(key)) {
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many failed login attempts' } });
      return;
    }
    const valid = await verifyOperatorPassword(req.body?.password, config.adminPasswordHash);
    if (!valid) {
      limiter.recordFailure(key);
      res.status(401).json({ error: { code: 'invalid_credentials', message: 'Invalid operator password' } });
      return;
    }
    limiter.recordSuccess(key);
    setSessionCookie(res, createSessionToken(config.authSecret, config.sessionTtlSeconds), config);
    res.status(200).json({ authenticated: true, expiresInSeconds: config.sessionTtlSeconds });
  });

  app.get('/api/auth/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = readSession(req, config);
    res.status(session ? 200 : 401).json({ authenticated: Boolean(session) });
  });

  app.post('/api/auth/logout', requireTrustedOrigin, (_req, res) => {
    clearSessionCookie(res, config);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ authenticated: false });
  });

  app.use('/trpc', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && !isOriginAllowed(req, config)) {
      res.status(403).json({ error: { code: 'origin_not_allowed', message: 'Request origin is not allowed' } });
      return;
    }
    next();
  }, createExpressMiddleware({ router: appRouter, createContext }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      authentication: 'required',
      antigravityConfigured: antigravity.configured,
      mockMode: antigravity.mockMode,
      timestamp: new Date().toISOString(),
    });
  });

  if (config.nodeEnv === 'production') {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[http]', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ error: { code: 'internal_error', message: 'Request could not be completed' } });
  });

  return app;
}

export function startServer(config: AppConfig = loadConfig()) {
  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} [${config.nodeEnv}]`);
    autoScheduler.start();
  });
  const shutdown = () => {
    autoScheduler.stop();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (require.main === module) startServer();

export type AppRouter = typeof appRouter;
