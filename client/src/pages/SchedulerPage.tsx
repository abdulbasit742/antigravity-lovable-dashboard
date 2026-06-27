/**
 * TASK 6 — Scheduler Status Page
 * Shows nextRun, lastRun, isRunning, retryCount, lastError.
 */
import { trpc } from '../main';

export default function SchedulerPage() {
  const { data: status, refetch } = trpc.scheduler.getStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });

  return (
    <>
      <h1 className="page-title">Auto Scheduler</h1>
      <p className="page-sub">Nightly credit relay scheduler — runs every day at 02:00</p>

      <div className="card">
        <div className="card-title">
          Scheduler Status
          {status?.isRunning && (
            <span className="badge blue" style={{ marginLeft: 10, animation: 'pulse 1s infinite' }}>● RUNNING</span>
          )}
        </div>

        {status ? (
          <div className="scheduler-row">
            <div className="scheduler-item">
              <div className="scheduler-key">Status</div>
              <div className="scheduler-val">
                <span className={`badge ${status.isRunning ? 'blue' : 'green'}`}>
                  {status.isRunning ? '● Running' : '✓ Idle'}
                </span>
              </div>
            </div>
            <div className="scheduler-item">
              <div className="scheduler-key">Last Run</div>
              <div className="scheduler-val">
                {status.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}
              </div>
            </div>
            <div className="scheduler-item">
              <div className="scheduler-key">Next Run</div>
              <div className="scheduler-val">
                {status.nextRun ? new Date(status.nextRun).toLocaleString() : '—'}
              </div>
            </div>
            <div className="scheduler-item">
              <div className="scheduler-key">Retry Count</div>
              <div className="scheduler-val" style={{ color: status.retryCount > 0 ? 'var(--yellow)' : 'inherit' }}>
                {status.retryCount} / 3
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-300)', padding: '20px 0' }}>Loading scheduler status...</div>
        )}

        {status?.lastError && (
          <div style={{
            marginTop: 20,
            background: '#7f1d1d30',
            border: '1px solid #7f1d1d',
            borderRadius: 8,
            padding: '12px 16px',
            color: 'var(--red)',
            fontSize: 13,
          }}>
            <strong>Last Error:</strong> {status.lastError}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Schedule Configuration</div>
        <div className="scheduler-row">
          <div className="scheduler-item">
            <div className="scheduler-key">Cron Expression</div>
            <div className="scheduler-val" style={{ fontFamily: 'monospace' }}>0 2 * * *</div>
          </div>
          <div className="scheduler-item">
            <div className="scheduler-key">Frequency</div>
            <div className="scheduler-val">Daily at 02:00</div>
          </div>
          <div className="scheduler-item">
            <div className="scheduler-key">Max Retries</div>
            <div className="scheduler-val">3</div>
          </div>
          <div className="scheduler-item">
            <div className="scheduler-key">Retry Delay</div>
            <div className="scheduler-val">5 seconds</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => refetch()}>
            🔄 Refresh Status
          </button>
        </div>
      </div>
    </>
  );
}
