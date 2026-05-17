import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewDemo from './pages/NewDemo.jsx';
import DemoDetail from './pages/DemoDetail.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantEditor from './pages/TenantEditor.jsx';

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function Topbar({ onLogout }) {
  const nav = useNavigate();
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
          <NavLink to="/new">+ Template</NavLink>
          <NavLink to="/tenants/new">+ Tenant</NavLink>
        </nav>
      </div>
      <button className="btn" onClick={logout}>Sign out</button>
    </div>
  );
}
