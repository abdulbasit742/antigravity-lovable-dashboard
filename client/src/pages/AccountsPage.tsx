import { useState } from 'react';
import toast from 'react-hot-toast';
import { trpc } from '../main';

export default function AccountsPage() {
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState('');

  const { data: accounts = [], refetch } = trpc.account.list.useQuery();
  const addMutation = trpc.account.add.useMutation({
    onSuccess: () => {
      toast.success('Account added successfully!');
      setEmail('');
      setCredential('');
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.account.remove.useMutation({
    onSuccess: () => { toast.success('Account removed'); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const syncMutation = trpc.account.sync.useMutation({
    onSuccess: () => { toast.success('Account synced'); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const totalCredits = accounts.reduce((s, a) => s + a.creditBalance, 0);
  const validCount = accounts.filter((a) => a.isValid).length;

  return (
    <>
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub">Manage your Lovable accounts and credentials</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Accounts</div>
          <div className="stat-value accent">{accounts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Valid</div>
          <div className="stat-value green">{validCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Credits</div>
          <div className="stat-value yellow">{totalCredits}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Invalid</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{accounts.length - validCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Add Account</div>
        <div className="input-row">
          <div className="input-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="account@lovable.dev" />
          </div>
          <div className="input-group">
            <label>API Credential / Token</label>
            <input type="password" value={credential} onChange={(e) => setCredential(e.target.value)} placeholder="Enter credential..." />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={!email || !credential || addMutation.isLoading}
          onClick={() => addMutation.mutate({ email, credential })}
        >
          {addMutation.isLoading ? '⏳ Adding...' : '+ Add Account'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">All Accounts ({accounts.length})</div>
        {accounts.length === 0 ? (
          <p style={{ color: 'var(--text-300)', textAlign: 'center', padding: '32px' }}>No accounts yet. Add one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Credits</th>
                  <th>Projects</th>
                  <th>Last Sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td style={{ fontWeight: 600 }}>{account.email}</td>
                    <td>
                      <span className={`badge ${account.isValid ? 'green' : 'red'}`}>
                        {account.isValid ? '✓ Valid' : '✗ Invalid'}
                      </span>
                    </td>
                    <td><span className="badge blue">{account.planType}</span></td>
                    <td>
                      <div className="credit-bar-wrap">
                        <div className="credit-bar-bg">
                          <div
                            className="credit-bar-fill"
                            style={{ width: account.creditLimit > 0 ? `${Math.min(100, (account.creditBalance / account.creditLimit) * 100)}%` : '0%' }}
                          />
                        </div>
                        <span className="credit-bar-label">{account.creditBalance}/{account.creditLimit}</span>
                      </div>
                    </td>
                    <td>{account.projectCount}</td>
                    <td style={{ color: 'var(--text-300)', fontSize: 12 }}>
                      {account.lastSync ? new Date(account.lastSync).toLocaleString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => syncMutation.mutate({ id: account.id })}
                          disabled={syncMutation.isLoading}>
                          🔄 Sync
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => removeMutation.mutate({ id: account.id })}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
