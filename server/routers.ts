import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from './trpc';
import { autoScheduler } from './autoScheduler';
import { UpstreamConfigurationError, UpstreamUnavailableError } from './antigravityApi';

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

interface PublicAccount extends Omit<Account, 'credential'> {
  credentialConfigured: true;
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
const screenWallState: Record<number, { profilePath: string; isRunning: boolean; url: string }> = {};
for (let i = 0; i < 12; i += 1) {
  screenWallState[i] = { profilePath: `profile_${i}`, isRunning: false, url: '' };
}

export function resetInMemoryState(): void {
  accounts.splice(0, accounts.length);
  relaySession = null;
  for (let i = 0; i < 12; i += 1) {
    screenWallState[i] = { profilePath: `profile_${i}`, isRunning: false, url: '' };
  }
}

export function toPublicAccount(account: Account): PublicAccount {
  const { credential: _credential, ...safe } = account;
  return { ...safe, credentialConfigured: true };
}

function upstreamError(error: unknown, action: string): never {
  if (error instanceof UpstreamConfigurationError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Antigravity API is not configured' });
  }
  if (error instanceof UpstreamUnavailableError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Antigravity ${action} failed` });
  }
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${action} failed` });
}

export function validateLaunchUrl(value: string, allowLoopbackHttp = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Launch URL is invalid' });
  }
  if (url.username || url.password || url.protocol === 'file:') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Launch URL cannot contain credentials' });
  }
  const hostname = url.hostname.toLowerCase();
  const privateHost = hostname === 'localhost'
    || hostname === '::1'
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || hostname.endsWith('.local');
  const allowedProtocol = url.protocol === 'https:'
    || (allowLoopbackHttp && url.protocol === 'http:' && privateHost);
  if (!allowedProtocol || (privateHost && !(allowLoopbackHttp && url.protocol === 'http:'))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Launch URL must be a public HTTPS URL' });
  }
  return url.toString();
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const accountRouter = router({
  list: protectedProcedure.query(() => accounts.map(toPublicAccount)),

  add: protectedProcedure
    .input(z.object({
      email: z.string().trim().email().max(254),
      credential: z.string().min(10).max(4096),
    }))
    .mutation(async ({ input, ctx }) => {
      if (accounts.length >= 100) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Account limit reached' });
      if (accounts.some((account) => account.email.toLowerCase() === input.email.toLowerCase())) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Account already exists' });
      }
      try {
        const isValid = await ctx.antigravity.validateCredential(input.credential);
        if (!isValid) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Credential was rejected' });
        const fetched = await ctx.antigravity.fetchAccountData(input.credential);
        const account: Account = {
          id: randomUUID(),
          email: input.email.toLowerCase(),
          credential: input.credential,
          planType: fetched.planType,
          creditBalance: fetched.creditBalance,
          creditLimit: fetched.creditLimit,
          projectCount: fetched.projectCount,
          isValid: true,
          lastSync: new Date().toISOString(),
        };
        accounts.push(account);
        return { success: true, account: toPublicAccount(account) };
      } catch (error) {
        upstreamError(error, 'account validation');
      }
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) => {
      const index = accounts.findIndex((account) => account.id === input.id);
      if (index === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      accounts.splice(index, 1);
      return { success: true };
    }),

  sync: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const account = accounts.find((candidate) => candidate.id === input.id);
      if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      try {
        const data = await ctx.antigravity.fetchAccountData(account.credential);
        account.planType = data.planType;
        account.creditBalance = data.creditBalance;
        account.creditLimit = data.creditLimit;
        account.projectCount = data.projectCount;
        account.isValid = true;
        account.lastSync = new Date().toISOString();
        return { success: true, account: toPublicAccount(account) };
      } catch (error) {
        account.isValid = false;
        upstreamError(error, 'account sync');
      }
    }),
});

const relayRouter = router({
  getSession: protectedProcedure.query(() => relaySession),

  start: protectedProcedure.mutation(async () => {
    if (relaySession?.isRunning) throw new TRPCError({ code: 'CONFLICT', message: 'Relay session already running' });
    const validAccounts = accounts.filter((account) => account.isValid);
    if (!validAccounts.length) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No valid accounts to relay' });

    const session: RelaySession = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      steps: validAccounts.map((account) => ({
        accountId: account.id,
        email: account.email,
        creditsBefore: account.creditBalance,
        creditsAfter: 0,
        status: 'pending',
      })),
      isRunning: true,
    };
    relaySession = session;

    void (async () => {
      for (const step of session.steps) {
        if (!session.isRunning) break;
        try {
          const account = accounts.find((candidate) => candidate.id === step.accountId);
          if (!account) throw new Error('Account was removed');
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!session.isRunning) break;
          step.creditsAfter = account.creditBalance;
          step.status = 'done';
        } catch {
          step.status = 'error';
          step.error = 'Relay step failed';
        }
      }
      session.isRunning = false;
    })();

    return { success: true, sessionId: session.id };
  }),

  stop: protectedProcedure.mutation(() => {
    if (!relaySession?.isRunning) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No active relay session' });
    relaySession.isRunning = false;
    return { success: true };
  }),

  export: protectedProcedure.query(() => {
    if (!relaySession) throw new TRPCError({ code: 'NOT_FOUND', message: 'No relay session to export' });
    const rows = [
      ['Account', 'Credits Before', 'Credits After', 'Status', 'Error'],
      ...relaySession.steps.map((step) => [
        step.email,
        step.creditsBefore,
        step.creditsAfter,
        step.status,
        step.error ?? '',
      ]),
    ];
    return {
      csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      filename: `relay_${relaySession.id}.csv`,
    };
  }),
});

const screenRouter = router({
  getAll: protectedProcedure.query(() => screenWallState),

  launch: protectedProcedure
    .input(z.object({ screenIndex: z.number().int().min(0).max(11), url: z.string().trim().min(1).max(2048).optional() }))
    .mutation(({ input, ctx }) => {
      const slot = screenWallState[input.screenIndex];
      if (!slot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Screen slot not found' });
      if (slot.isRunning) throw new TRPCError({ code: 'CONFLICT', message: 'Screen already running' });
      slot.isRunning = true;
      slot.url = validateLaunchUrl(input.url ?? 'https://lovable.dev/', ctx.config.nodeEnv !== 'production');
      return { success: true, slot };
    }),

  stop: protectedProcedure
    .input(z.object({ screenIndex: z.number().int().min(0).max(11) }))
    .mutation(({ input }) => {
      const slot = screenWallState[input.screenIndex];
      if (!slot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Screen slot not found' });
      slot.isRunning = false;
      slot.url = '';
      return { success: true };
    }),
});

const schedulerRouter = router({
  getStatus: protectedProcedure.query(() => autoScheduler.getStatus()),
});

export const appRouter = router({
  account: accountRouter,
  relay: relayRouter,
  screen: screenRouter,
  scheduler: schedulerRouter,
});

export type AppRouter = typeof appRouter;
