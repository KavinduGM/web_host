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
      <Topbar onLogout={() => setAuthed(false)} />
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
    </div>
  );
}

function Topbar({ onLogout }) {
  const nav = useNavigate();
  const [newCount, setNewCount] = useState(0);

  // Poll the inquiry count so the topbar shows a live "new" badge.
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
    <div className="topbar">
      <div className="row gap-sm">
        <div className="brand">Demo Host</div>
        <nav style={{ marginLeft: 24 }}>
          <NavLink to="/" end>Templates</NavLink>
          <NavLink to="/tenants">Tenants</NavLink>
          <NavLink to="/inquiries">
            Inquiries
            {newCount > 0 && (
              <span
                className="badge"
                style={{
                  marginLeft: 6,
                  background: '#a78bfa',
                  color: '#0c0f14',
                  padding: '1px 7px',
                  fontSize: 10,
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                {newCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/new">+ Template</NavLink>
          <NavLink to="/tenants/new">+ Tenant</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </div>
      <button className="btn" onClick={logout}>Sign out</button>
    </div>
  );
}
