import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [demos, setDemos] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [inquiriesCount, setInquiriesCount] = useState(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();

  async function load() {
    try {
      const [d, t, inq] = await Promise.all([
        api.listDemos(),
        api.listTenants().catch(() => []),
        api.listInquiries().catch(() => ({ counts: {}, inquiries: [] })),
      ]);
      setDemos(d);
      setTenants(t);
      setInquiriesCount(inq.inquiries?.length || 0);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function action(fn) {
    try {
      await fn();
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!demos) return <div className="container muted">Loading…</div>;

  const totalViews = demos.reduce((acc, d) => acc + (d.views?.total || 0), 0)
                   + tenants.reduce((acc, t) => acc + (t.views?.total || 0), 0);
  const readyCount = demos.filter((d) => d.status === 'ready' && d.enabled).length;

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 18 }}>
        <h1>Templates</h1>
        <button className="btn primary" onClick={() => nav('/new')}>+ New template</button>
      </div>

      {/* Summary tiles */}
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Templates</div>
          <div className="value">{demos.length}</div>
          <div className="sub">{readyCount} live</div>
        </div>
        <div className="stat">
          <div className="label">Tenants</div>
          <div className="value">{tenants.length}</div>
          <div className="sub">{tenants.filter((t) => t.enabled).length} enabled</div>
        </div>
        <div className="stat">
          <div className="label">Total views</div>
          <div className="value">{totalViews.toLocaleString()}</div>
          <div className="sub">across all demos</div>
        </div>
        <div className="stat">
          <div className="label">Inquiries</div>
          <div className="value">{inquiriesCount ?? 0}</div>
          <div className="sub">
            {inquiriesCount === 0
              ? 'awaiting first claim'
              : <Link to="/inquiries">view all →</Link>}
          </div>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {demos.length === 0 ? (
          <div className="empty">
            No templates yet. <Link to="/new">Create one</Link>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Demo URL</th>
                <th style={{ textAlign: 'right' }}>Views</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/demos/${d.id}`} style={{ fontWeight: 600 }}>{d.name}</Link>
                  </td>
                  <td className="mono muted">{d.slug}</td>
                  <td>
                    <span className={`badge ${d.status}`}>{d.status}</span>
                    {!d.enabled && <span className="badge disabled" style={{ marginLeft: 6 }}>disabled</span>}
                  </td>
                  <td>
                    {d.status === 'ready' && d.enabled ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="mono">{d.url}</a>
                    ) : (
                      <span className="muted mono">{d.url}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {d.views?.total ? d.views.total.toLocaleString() : <span className="muted">—</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{relativeTime(d.updated_at)}</td>
                  <td className="actions">
                    <button className="btn" onClick={() => action(() => api.rebuild(d.id))}>Rebuild</button>{' '}
                    {d.enabled ? (
                      <button className="btn" onClick={() => action(() => api.disable(d.id))}>Disable</button>
                    ) : (
                      <button className="btn" onClick={() => action(() => api.enable(d.id))}>Enable</button>
                    )}{' '}
                    <button
                      className="btn danger"
                      onClick={() => {
                        if (confirm(`Delete "${d.name}"? This removes its files.`)) {
                          action(() => api.deleteDemo(d.id));
                        }
                      }}
                    >
                      Delete
                    </button>
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

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const sec = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (sec < 60)     return `${sec}s ago`;
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(then).toLocaleDateString();
}
