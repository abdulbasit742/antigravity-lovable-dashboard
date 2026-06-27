/**
 * TASK 4 — Credit Relay Handoff UI
 * Live relay step progress, stop button, export button.
 */
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { trpc } from '../main';

const statusIcon: Record<string, string> = {
  pending: '⏳',
  done: '✅',
  error: '❌',
};

export default function AutomationPage() {
  const { data: session, refetch } = trpc.relay.getSession.useQuery(undefined, {
    refetchInterval: (data) => (data?.isRunning ? 1000 : false),
  });

  const startMutation = trpc.relay.start.useMutation({
    onSuccess: () => { toast.success('Relay started!'); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const stopMutation = trpc.relay.stop.useMutation({
    onSuccess: () => { toast.success('Relay stopped'); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const exportQuery = trpc.relay.export.useQuery(undefined, { enabled: false });

  const handleExport = async () => {
    try {
      const result = await exportQuery.refetch();
      if (!result.data) return;
      const { csv, filename } = result.data;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const doneCount = session?.steps.filter((s) => s.status === 'done').length ?? 0;
  const totalCount = session?.steps.length ?? 0;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <>
      <h1 className="page-title">Credit Relay</h1>
      <p className="page-sub">Handoff credits across all valid accounts</p>

      <div className="actions-row">
        <button
          className="btn btn-primary"
          disabled={startMutation.isLoading || session?.isRunning}
          onClick={() => startMutation.mutate()}
        >
          {session?.isRunning ? '⏳ Running...' : '▶ Start Relay'}
        </button>

        {session?.isRunning && (
          <button className="btn btn-danger" onClick={() => stopMutation.mutate()}>
            ■ Stop Relay
          </button>
        )}

        {session && !session.isRunning && totalCount > 0 && (
          <button className="btn btn-ghost" onClick={handleExport}>
            📥 Export CSV
          </button>
        )}
      </div>

      {session && (
        <div className="card">
          <div className="card-title">
            Session Progress — {doneCount}/{totalCount} complete
            {session.isRunning && <span className="badge blue" style={{ marginLeft: 10 }}>LIVE</span>}
          </div>

          {/* Progress bar */}
          <div className="credit-bar-wrap" style={{ marginBottom: 20 }}>
            <div className="credit-bar-bg" style={{ height: 12 }}>
              <div className="credit-bar-fill" style={{ width: `${progress}%`, background: progress === 100 ? 'var(--green)' : 'var(--accent)' }} />
            </div>
            <span className="credit-bar-label">{progress}%</span>
          </div>

          <div className="relay-steps">
            {session.steps.map((step, i) => (
              <div key={i} className="relay-step">
                <span className="relay-step-icon">{statusIcon[step.status] ?? '⏳'}</span>
                <div className="relay-step-info">
                  <div className="relay-step-email">{step.email}</div>
                  <div className="relay-step-credit">
                    Credits: {step.creditsBefore} → {step.status === 'done' ? step.creditsAfter : '...'}
                    {step.error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>Error: {step.error}</span>}
                  </div>
                </div>
                <span className={`badge ${step.status === 'done' ? 'green' : step.status === 'error' ? 'red' : 'yellow'}`}>
                  {step.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!session && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <div style={{ color: 'var(--text-300)' }}>No relay session yet. Click "Start Relay" to begin.</div>
        </div>
      )}
    </>
  );
}
