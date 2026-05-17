import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Tenants() {
  const [tenants, setTenants] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [err, setErr] = useState('');
  const nav = useNavigate();

  async function load() {
    try {
      const [t, d] = await Promise.all([api.listTenants(), api.listDemos()]);
      setTenants(t);
      setTemplates(d);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  async function act(fn) {
    setErr('');
    try { await fn(); load(); } catch (e) { setErr(e.message); }
  }

  if (!tenants) return <div className="container muted">Loading…</div>;

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Tenants</h1>
        <div className="row gap-sm">
          {templates.length === 0 ? (
            <span className="muted">Create a template first.</span>
          ) : (
            <button className="btn primary" onClick={() => nav('/tenants/new')}>+ New tenant</button>
          )}
        </div>
      </div>
      {err && <div className="error">{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        {tenants.length === 0 ? (
          <div className="empty">
            No tenants yet. Tenants are re-branded views of a built template.
            {templates.length > 0 && <> <Link to="/tenants/new">Create one</Link>.</>}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Template</th>
                <th>Demo URL</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/tenants/${t.id}`}>{t.name}</Link></td>
                  <td className="mono muted">{t.slug}</td>
                  <td className="muted">
                    {t.template ? (
                      <Link to={`/demos/${t.template.id}`}>{t.template.name}</Link>
                    ) : <span className="muted">(deleted)</span>}
                  </td>
                  <td>
                    {t.enabled && t.template?.status === 'ready' ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="mono">{t.url}</a>
                    ) : (
                      <span className="muted mono">{t.url}</span>
                    )}
                  </td>
                  <td>
                    {t.enabled
                      ? <span className="badge ready">live</span>
                      : <span className="badge disabled">disabled</span>}
                  </td>
                  <td className="actions">
                    {t.enabled
                      ? <button className="btn" onClick={() => act(() => api.disableTenant(t.id))}>Disable</button>
                      : <button className="btn" onClick={() => act(() => api.enableTenant(t.id))}>Enable</button>}{' '}
                    <button
                      className="btn danger"
                      onClick={() => {
                        if (confirm(`Delete tenant "${t.name}"? Removes uploads too.`)) {
                          act(() => api.deleteTenant(t.id));
                        }
                      }}
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
