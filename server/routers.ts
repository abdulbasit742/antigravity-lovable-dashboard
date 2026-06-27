/**
 * TASK 5 — All tRPC routes with full try/catch error handling.
 */

import { router, publicProcedure } from './trpc';
import { z } from 'zod';
import {
  fetchAntigravityAccountData,
  validateAntigravityCredential,
} from './antigravityApi';
import { autoScheduler } from './autoScheduler';

// --- In-memory store (replace with DB in production) ---
interface Account {
  id: string;
  email: string;
  credential: string;
  planType: string;
  creditBalance: number;
  creditLimit: number;
  projectCount: number;
  isValid: boolean;
  lastSync: string;
}

interface RelayStep {
  accountId: string;
  email: string;
  creditsBefore: number;
  creditsAfter: number;
  status: 'pending' | 'done' | 'error';
  error?: string;
}

interface RelaySession {
  id: string;
  startedAt: string;
  steps: RelayStep[];
  isRunning: boolean;
}

const accounts: Account[] = [];
let relaySession: RelaySession | null = null;
let screenWallState: Record<number, { profilePath: string; isRunning: boolean; url: string }> = {};

// Initialize 12 screen slots
for (let i = 0; i < 12; i++) {
  screenWallState[i] = { profilePath: `profile_${i}`, isRunning: false, url: '' };
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Routers ---

const accountRouter = router({
  list: publicProcedure.query(() => {
    try {
      return accounts;
    } catch (err: unknown) {
      throw new Error('Failed to list accounts: ' + (err instanceof Error ? err.message : String(err)));
    }
  }),

  add: publicProcedure
    .input(z.object({ email: z.string().email(), credential: z.string().min(10) }))
    .mutation(async ({ input }) => {
      try {
        const isValid = await validateAntigravityCredential(input.credential);
        let data = { planType: 'unknown', creditBalance: 0, creditLimit: 0, projectCount: 0 };
        if (isValid) {
          try {
            const fetched = await fetchAntigravityAccountData(input.credential);
            data = {
              planType: fetched.planType,
              creditBalance: fetched.creditBalance,
              creditLimit: fetched.creditLimit,
              projectCount: fetched.projectCount,
            };
          } catch {
            // Non-fatal: continue with defaults
          }
        }
        const account: Account = {
          id: generateId(),
          email: input.email,
          credential: input.credential,
          isValid,
          lastSync: new Date().toISOString(),
          ...data,
        };
        accounts.push(account);
        return { success: true, account };
      } catch (err: unknown) {
        throw new Error('Failed to add account: ' + (err instanceof Error ? err.message : String(err)));
      }
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      try {
        const idx = accounts.findIndex((a) => a.id === input.id);
        if (idx === -1) throw new Error('Account not found');
        accounts.splice(idx, 1);
        return { success: true };
      } catch (err: unknown) {
        throw new Error('Failed to remove account: ' + (err instanceof Error ? err.message : String(err)));
      }
    }),

  sync: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const account = accounts.find((a) => a.id === input.id);
        if (!account) throw new Error('Account not found');
        const data = await fetchAntigravityAccountData(account.credential);
        account.planType = data.planType;
        account.creditBalance = data.creditBalance;
        account.creditLimit = data.creditLimit;
        account.projectCount = data.projectCount;
        account.lastSync = new Date().toISOString();
        return { success: true, account };
      } catch (err: unknown) {
        throw new Error('Sync failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    }),
});

const relayRouter = router({
  getSession: publicProcedure.query(() => {
    return relaySession;
  }),

  start: publicProcedure.mutation(async () => {
    try {
      if (relaySession?.isRunning) {
        throw new Error('Relay session already running');
      }
      const validAccounts = accounts.filter((a) => a.isValid);
      if (validAccounts.length === 0) throw new Error('No valid accounts to relay');

      relaySession = {
        id: generateId(),
        startedAt: new Date().toISOString(),
        steps: validAccounts.map((a) => ({
          accountId: a.id,
          email: a.email,
          creditsBefore: a.creditBalance,
          creditsAfter: 0,
          status: 'pending',
        })),
        isRunning: true,
      };

      // Run relay asynchronously
      (async () => {
        if (!relaySession) return;
        for (const step of relaySession.steps) {
          try {
            const account = accounts.find((a) => a.id === step.accountId);
            if (!account) continue;
            // Simulate relay — replace with real handoff logic
            await new Promise((r) => setTimeout(r, 300));
            step.creditsAfter = account.creditBalance;
            step.status = 'done';
          } catch (err: unknown) {
            step.status = 'error';
            step.error = err instanceof Error ? err.message : String(err);
          }
        }
        relaySession.isRunning = false;
      })();

      return { success: true, sessionId: relaySession.id };
    } catch (err: unknown) {
      throw new Error('Failed to start relay: ' + (err instanceof Error ? err.message : String(err)));
    }
  }),

  stop: publicProcedure.mutation(() => {
    try {
      if (!relaySession || !relaySession.isRunning) {
        throw new Error('No active relay session');
      }
      relaySession.isRunning = false;
      return { success: true };
    } catch (err: unknown) {
      throw new Error('Failed to stop relay: ' + (err instanceof Error ? err.message : String(err)));
    }
  }),

  export: publicProcedure.query(() => {
    try {
      if (!relaySession) throw new Error('No relay session to export');
      const csv = [
        'Account,Credits Before,Credits After,Status,Error',
        ...relaySession.steps.map(
          (s) => `${s.email},${s.creditsBefore},${s.creditsAfter},${s.status},${s.error ?? ''}`
        ),
      ].join('\n');
      return { csv, filename: `relay_${relaySession.id}.csv` };
    } catch (err: unknown) {
      throw new Error('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }),
});

const screenRouter = router({
  getAll: publicProcedure.query(() => {
    return screenWallState;
  }),

  launch: publicProcedure
    .input(z.object({ screenIndex: z.number().min(0).max(11), url: z.string().url().optional() }))
    .mutation(({ input }) => {
      try {
        const slot = screenWallState[input.screenIndex];
        if (!slot) throw new Error(`Screen slot ${input.screenIndex} not found`);
        if (slot.isRunning) throw new Error(`Screen ${input.screenIndex} already running`);
        slot.isRunning = true;
        slot.url = input.url ?? 'https://lovable.dev';
        return { success: true, slot };
      } catch (err: unknown) {
        throw new Error('Failed to launch screen: ' + (err instanceof Error ? err.message : String(err)));
      }
    }),

  stop: publicProcedure
    .input(z.object({ screenIndex: z.number().min(0).max(11) }))
    .mutation(({ input }) => {
      try {
        const slot = screenWallState[input.screenIndex];
        if (!slot) throw new Error(`Screen slot ${input.screenIndex} not found`);
        slot.isRunning = false;
        slot.url = '';
        return { success: true };
      } catch (err: unknown) {
        throw new Error('Failed to stop screen: ' + (err instanceof Error ? err.message : String(err)));
      }
    }),
});

const schedulerRouter = router({
  getStatus: publicProcedure.query(() => {
    try {
      return autoScheduler.getStatus();
    } catch (err: unknown) {
      throw new Error('Failed to get scheduler status: ' + (err instanceof Error ? err.message : String(err)));
    }
  }),
});

export const appRouter = router({
  account: accountRouter,
  relay: relayRouter,
  screen: screenRouter,
  scheduler: schedulerRouter,
});

export type AppRouter = typeof appRouter;
