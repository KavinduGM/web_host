import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewDemo from './pages/NewDemo.jsx';
import DemoDetail from './pages/DemoDetail.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantEditor from './pages/TenantEditor.jsx';
import Inquiries from './pages/Inquiries.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login onSuccess={() => setAuthed(true)} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar onLogout={() => setAuthed(false)} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewDemo />} />
          <Route path="/demos/:id" element={<DemoDetail />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/tenants/new" element={<TenantEditor />} />
          <Route path="/tenants/:id" element={<TenantEditor />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Sidebar({ onLogout }) {
  const nav = useNavigate();
  const [newCount, setNewCount] = useState(0);

  // Live "new inquiries" badge — polls every 15s.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const d = await api.listInquiries();
        if (!cancelled) setNewCount(d.counts?.new || 0);
      } catch { /* ignore */ }
    }
    poll();
    const t = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
    nav('/login');
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">D</span>
        <span>Demo Host</span>
      </div>

      <div className="section">Workspace</div>
      <nav>
        <NavLink to="/" end>
          <span className="nav-icon">🗂</span>
          <span>Templates</span>
        </NavLink>
        <NavLink to="/tenants">
          <span className="nav-icon">👥</span>
          <span>Tenants</span>
        </NavLink>
        <NavLink to="/inquiries">
          <span className="nav-icon">📥</span>
          <span>Inquiries</span>
          {newCount > 0 && <span className="nav-badge">{newCount}</span>}
        </NavLink>
      </nav>

      <div className="section">Create</div>
      <nav>
        <NavLink to="/new">
          <span className="nav-icon">＋</span>
          <span>New template</span>
        </NavLink>
        <NavLink to="/tenants/new">
          <span className="nav-icon">＋</span>
          <span>New tenant</span>
        </NavLink>
      </nav>

      <div className="section">System</div>
      <nav>
        <NavLink to="/settings">
          <span className="nav-icon">⚙</span>
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="btn" onClick={logout}>Sign out</button>
      </div>
    </aside>
  );
}
