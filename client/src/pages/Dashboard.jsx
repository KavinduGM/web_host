import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [demos, setDemos] = useState(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();

  async function load() {
    try {
      setDemos(await api.listDemos());
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
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

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Demos</h1>
        <button className="btn primary" onClick={() => nav('/new')}>+ New demo</button>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ padding: 0 }}>
        {demos.length === 0 ? (
          <div className="empty">
            No demos yet. <Link to="/new">Create one</Link>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Demo URL</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/demos/${d.id}`}>{d.name}</Link>
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
                  <td className="muted">{d.updated_at}</td>
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
