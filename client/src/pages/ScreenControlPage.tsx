/**
 * TASK 3 — 12-Screen Wall
 * Each slot has its own isolated profile, launch/stop controls, and status.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { trpc } from '../main';

export default function ScreenControlPage() {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [urlInput, setUrlInput] = useState('https://lovable.dev');

  const { data: screens, refetch } = trpc.screen.getAll.useQuery();
  const launchMutation = trpc.screen.launch.useMutation({
    onSuccess: () => { toast.success(`Screen ${selectedSlot! + 1} launched!`); refetch(); setSelectedSlot(null); },
    onError: (err) => toast.error(err.message),
  });
  const stopMutation = trpc.screen.stop.useMutation({
    onSuccess: (_, vars) => { toast.success(`Screen ${vars.screenIndex + 1} stopped`); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const slots = screens ? Object.entries(screens) : [];
  const runningCount = slots.filter(([, s]) => s.isRunning).length;

  const launchAll = () => {
    slots.forEach(([idx, s]) => {
      if (!s.isRunning) {
        launchMutation.mutate({ screenIndex: parseInt(idx), url: urlInput });
      }
    });
  };
  const stopAll = () => {
    slots.forEach(([idx, s]) => {
      if (s.isRunning) stopMutation.mutate({ screenIndex: parseInt(idx) });
    });
  };

  return (
    <>
      <h1 className="page-title">Screen Wall</h1>
      <p className="page-sub">12 isolated Chrome profiles — launch and control each independently</p>

      <div className="actions-row">
        <div className="input-group" style={{ flex: '0 0 300px' }}>
          <label>Default URL</label>
          <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://lovable.dev" />
        </div>
        <button className="btn btn-primary" onClick={launchAll} disabled={launchMutation.isLoading}>
          ▶ Launch All
        </button>
        <button className="btn btn-danger" onClick={stopAll} disabled={runningCount === 0}>
          ■ Stop All
        </button>
        <span style={{ color: 'var(--text-300)', fontSize: 13, marginLeft: 8 }}>
          {runningCount}/12 running
        </span>
      </div>

      <div className="card">
        <div className="card-title">12-Screen Wall</div>
        <div className="screen-grid">
          {Array.from({ length: 12 }, (_, i) => {
            const slot = screens?.[i];
            const isRunning = slot?.isRunning ?? false;
            return (
              <div
                key={i}
                className={`screen-slot ${isRunning ? 'running' : ''}`}
                onClick={() => !isRunning && setSelectedSlot(selectedSlot === i ? null : i)}
              >
                <span className="screen-num">#{i + 1}</span>
                <div className={`screen-dot ${isRunning ? 'active' : ''}`} />
                {isRunning ? (
                  <>
                    <span className="screen-url">{slot?.url}</span>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: 11, marginTop: 4 }}
                      onClick={(e) => { e.stopPropagation(); stopMutation.mutate({ screenIndex: i }); }}
                    >
                      Stop
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--text-300)' }}>
                      {selectedSlot === i ? 'Click Launch ↓' : 'Click to select'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-300)', marginTop: 2 }}>
                      Profile {i + 1}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {selectedSlot !== null && (
          <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="card-title">Launch Screen #{selectedSlot + 1} — Profile {selectedSlot + 1}</div>
            <div className="input-row">
              <div className="input-group">
                <label>URL to open</label>
                <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-success"
                onClick={() => launchMutation.mutate({ screenIndex: selectedSlot, url: urlInput })}
                disabled={launchMutation.isLoading}
              >
                ▶ Launch
              </button>
              <button className="btn btn-ghost" onClick={() => setSelectedSlot(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
