import { FormEvent, useEffect, useState } from 'react';
import AccountsPage from './pages/AccountsPage';
import AutomationPage from './pages/AutomationPage';
import ScreenControlPage from './pages/ScreenControlPage';
import SchedulerPage from './pages/SchedulerPage';
import { AUTH_EXPIRED_EVENT, getOperatorSession, loginOperator, logoutOperator } from './session';
import './auth.css';

type Page = 'accounts' | 'automation' | 'screen' | 'scheduler';
type AuthState = 'loading' | 'anonymous' | 'authenticated';

const navItems: { id: Page; icon: string; label: string }[] = [
  { id: 'accounts', icon: '👤', label: 'Accounts' },
  { id: 'automation', icon: '⚡', label: 'Relay' },
  { id: 'screen', icon: '🖥️', label: 'Screen Wall' },
  { id: 'scheduler', icon: '🕐', label: 'Scheduler' },
];

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await loginOperator(password);
      setPassword('');
      onAuthenticated();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark" aria-hidden="true">⚡</div>
        <p className="auth-eyebrow">Protected control plane</p>
        <h1>Antigravity Dashboard</h1>
        <p className="auth-copy">Sign in with the operator password. The password is verified by the server and is never stored in browser storage.</p>
        <label htmlFor="operator-password">Operator password</label>
        <input
          id="operator-password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          maxLength={256}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={submitting || password.length < 12}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('accounts');
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    let mounted = true;
    getOperatorSession()
      .then((authenticated) => mounted && setAuthState(authenticated ? 'authenticated' : 'anonymous'))
      .catch(() => mounted && setAuthState('anonymous'));
    const expire = () => setAuthState('anonymous');
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    return () => {
      mounted = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
    };
  }, []);

  if (authState === 'loading') {
    return <main className="auth-shell"><p className="auth-loading" role="status">Checking operator session…</p></main>;
  }
  if (authState === 'anonymous') {
    return <LoginScreen onAuthenticated={() => setAuthState('authenticated')} />;
  }

  const logout = async () => {
    await logoutOperator().catch(() => undefined);
    setAuthState('anonymous');
  };

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="sidebar-logo">
          ⚡ Antigravity<span>Protected operator console</span>
        </div>
        <nav aria-label="Dashboard sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="nav-item logout-button" type="button" onClick={logout}>
          <span className="nav-icon" aria-hidden="true">↪</span>
          <span>Sign out</span>
        </button>
      </aside>

      <main className="main" id="main-content">
        {page === 'accounts' && <AccountsPage />}
        {page === 'automation' && <AutomationPage />}
        {page === 'screen' && <ScreenControlPage />}
        {page === 'scheduler' && <SchedulerPage />}
      </main>
    </div>
  );
}
