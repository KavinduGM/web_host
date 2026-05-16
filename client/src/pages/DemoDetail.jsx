import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function DemoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [demo, setDemo] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [buildLog, setBuildLog] = useState(null);

  async function load() {
    try {
      const d = await api.getDemo(id);
      setDemo(d);
      if (!selectedBuildId && d.builds.length) {
        setSelectedBuildId(d.builds[0].id);
      }
      if (!editing) {
        setForm({
          name: d.name,
          git_url: d.git_url,
          git_branch: d.git_branch,
          build_cmd: d.build_cmd,
          output_dir: d.output_dir,
        });
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!selectedBuildId) return;
    let cancelled = false;
    async function pull() {
      try {
        const log = await api.getBuildLog(id, selectedBuildId);
        if (!cancelled) setBuildLog(log);
      } catch (e) { /* ignore */ }
    }
    pull();
    const t = setInterval(pull, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id, selectedBuildId]);

  async function act(fn) {
    setErr('');
    try {
      await fn();
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function save() {
    try {
      await api.updateDemo(id, form);
      setEditing(false);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${demo.name}"? This removes its files.`)) return;
    try {
      await api.deleteDemo(id);
      nav('/');
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!demo) return <div className="container muted">Loading…</div>;

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>{demo.name}</h1>
        <div className="row gap-sm">
          <span className={`badge ${demo.status}`}>{demo.status}</span>
          {!demo.enabled && <span className="badge disabled">disabled</span>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Demo URL</div>
            {demo.status === 'ready' && demo.enabled ? (
              <a href={demo.url} target="_blank" rel="noreferrer" className="mono">{demo.url}</a>
            ) : (
              <span className="mono muted">{demo.url}</span>
            )}
          </div>
          <div className="row gap-sm">
            <button className="btn primary" onClick={() => act(() => api.rebuild(id))}>Rebuild</button>
            {demo.enabled ? (
              <button className="btn" onClick={() => act(() => api.disable(id))}>Disable</button>
            ) : (
              <button className="btn" onClick={() => act(() => api.enable(id))}>Enable</button>
            )}
            <button className="btn danger" onClick={remove}>Delete</button>
          </div>
        </div>
        {demo.last_error && <div className="error">Last error: {demo.last_error}</div>}
        {err && <div className="error">{err}</div>}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Settings</h2>
          {!editing ? (
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          ) : (
            <div className="row gap-sm">
              <button className="btn primary" onClick={save}>Save</button>
              <button className="btn" onClick={() => { setEditing(false); load(); }}>Cancel</button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Name" value={form.name} edit={editing} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Git URL" value={form.git_url} edit={editing} mono onChange={(v) => setForm({ ...form, git_url: v })} />
          <Field label="Branch" value={form.git_branch} edit={editing} mono onChange={(v) => setForm({ ...form, git_branch: v })} />
          <Field label="Build command" value={form.build_cmd} edit={editing} mono onChange={(v) => setForm({ ...form, build_cmd: v })} />
          <Field label="Output directory" value={form.output_dir} edit={editing} mono onChange={(v) => setForm({ ...form, output_dir: v })} />
          <Field label="Slug" value={demo.slug} edit={false} mono />
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Build history</h2>
        {demo.builds.length === 0 ? (
          <div className="muted">No builds yet.</div>
        ) : (
          <>
            <div className="row gap-sm" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
              {demo.builds.map((b) => (
                <button
                  key={b.id}
                  className={`btn ${selectedBuildId === b.id ? 'primary' : ''}`}
                  onClick={() => setSelectedBuildId(b.id)}
                  title={`Started ${b.started_at}`}
                >
                  #{b.id} · {b.status}
                </button>
              ))}
            </div>
            {buildLog && (
              <>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Build #{buildLog.id} — {buildLog.status}
                  {buildLog.started_at && <> — started {buildLog.started_at}</>}
                  {buildLog.ended_at && <> — ended {buildLog.ended_at}</>}
                </div>
                <pre className="log">{buildLog.log || '(no output yet)'}</pre>
              </>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to="/">← Back to dashboard</Link>
      </div>
    </div>
  );
}

function Field({ label, value, edit, onChange, mono }) {
  return (
    <div className="field">
      <label>{label}</label>
      {edit ? (
        <input
          className={`input ${mono ? 'mono' : ''}`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className={mono ? 'mono' : ''}>{value || <span className="muted">—</span>}</div>
      )}
    </div>
  );
}
