import type { inferAsyncReturnType } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { AppConfig } from './config';
import type { AntigravityClient } from './antigravityApi';
import { readSession } from './auth';

export function createContextFactory(config: AppConfig, antigravity: AntigravityClient) {
  return function createContext({ req, res }: CreateExpressContextOptions) {
    return {
      req,
      res,
      config,
      antigravity,
      session: readSession(req, config),
    };
  };
}

export type Context = inferAsyncReturnType<ReturnType<typeof createContextFactory>>;
