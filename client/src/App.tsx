import { useState } from 'react';
import AccountsPage from './pages/AccountsPage';
import AutomationPage from './pages/AutomationPage';
import ScreenControlPage from './pages/ScreenControlPage';
import SchedulerPage from './pages/SchedulerPage';

type Page = 'accounts' | 'automation' | 'screen' | 'scheduler';

const navItems: { id: Page; icon: string; label: string }[] = [
  { id: 'accounts', icon: '👤', label: 'Accounts' },
  { id: 'automation', icon: '⚡', label: 'Relay' },
  { id: 'screen', icon: '🖥️', label: 'Screen Wall' },
  { id: 'scheduler', icon: '🕐', label: 'Scheduler' },
];

export default function App() {
  const [page, setPage] = useState<Page>('accounts');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          ⚡ Antigravity<span>Dashboard v1.0</span>
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </aside>

      <main className="main">
        {page === 'accounts' && <AccountsPage />}
        {page === 'automation' && <AutomationPage />}
        {page === 'screen' && <ScreenControlPage />}
        {page === 'scheduler' && <SchedulerPage />}
      </main>
    </div>
  );
}
