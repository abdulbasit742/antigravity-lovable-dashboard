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
let state: SchedulerStatus = { isRunning: false, lastRun: null, nextRun: null, lastError: null, retryCount: 0 };
let task: cron.ScheduledTask | null = null;

async function runRelayJob(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
}

async function runWithRetry(attempt = 1): Promise<void> {
  try {
    state.isRunning = true;
    state.retryCount = attempt - 1;
    await runRelayJob();
    state.lastRun = new Date().toISOString();
    state.lastError = null;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : 'Scheduler job failed';
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      await runWithRetry(attempt + 1);
    }
  } finally {
    state.isRunning = false;
  }
}

function getNextRun(): string {
  const now = new Date();
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export const autoScheduler = {
  start() {
    if (task) return;
    state.nextRun = getNextRun();
    task = cron.schedule('0 2 * * *', async () => {
      state.nextRun = getNextRun();
      await runWithRetry();
    });
  },
  stop() {
    task?.stop();
    task = null;
  },
  getStatus(): SchedulerStatus {
    return { ...state };
  },
};
