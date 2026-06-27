/**
 * TASK 6 — autoScheduler.ts
 * Runs nightly credit relay jobs with retry logic.
 * Exposes getStatus() for the tRPC scheduler.getStatus route.
 */

import cron from 'node-cron';

interface SchedulerStatus {
  isRunning: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastError: string | null;
  retryCount: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

let state: SchedulerStatus = {
  isRunning: false,
  lastRun: null,
  nextRun: null,
  lastError: null,
  retryCount: 0,
};

// Simulate the actual relay job — replace with real logic
async function runRelayJob(): Promise<void> {
  console.log('[autoScheduler] Running relay job...');
  // TODO: call relay logic here
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  console.log('[autoScheduler] Relay job completed.');
}

async function runWithRetry(attempt = 1): Promise<void> {
  try {
    state.isRunning = true;
    state.retryCount = attempt - 1;
    await runRelayJob();
    state.lastRun = new Date().toISOString();
    state.lastError = null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[autoScheduler] Job failed (attempt ${attempt}/${MAX_RETRIES}): ${msg}`);
    state.lastError = msg;
    if (attempt < MAX_RETRIES) {
      console.log(`[autoScheduler] Retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      await runWithRetry(attempt + 1);
    } else {
      console.error('[autoScheduler] Max retries reached. Giving up until next schedule.');
    }
  } finally {
    state.isRunning = false;
  }
}

// Calculate next run time for cron expression "0 2 * * *" (2am daily)
function getNextRun(): string {
  const now = new Date();
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export const autoScheduler = {
  start() {
    state.nextRun = getNextRun();
    // Run every day at 02:00
    cron.schedule('0 2 * * *', async () => {
      state.nextRun = getNextRun();
      console.log(`[autoScheduler] Starting scheduled relay job at ${new Date().toISOString()}`);
      await runWithRetry();
    });
    console.log(`[autoScheduler] Scheduler started. Next run: ${state.nextRun}`);
  },

  getStatus(): SchedulerStatus {
    return { ...state };
  },
};
