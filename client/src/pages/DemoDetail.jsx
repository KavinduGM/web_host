import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import SiteConfigForm, { BLANK_SITE_CONFIG, deepFill } from '../components/SiteConfigForm.jsx';

export default function DemoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [demo, setDemo] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [buildLog, setBuildLog] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [defaults, setDefaults] = useState(BLANK_SITE_CONFIG);
  const [defaultsDirty, setDefaultsDirty] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  async function load() {
    try {
      const d = await api.getDemo(id);
      setDemo(d);
      api.listTenantsByTemplate(id).then(setTenants).catch(() => {});
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
          offer_price: d.offer_price || '',
        });
      }
      if (!defaultsDirty) {
        setDefaults(deepFill(BLANK_SITE_CONFIG, d.defaults || {}));
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function saveDefaults() {
    setErr('');
    setSavingDefaults(true);
    try {
      await api.setDemoDefaults(id, defaults);
      setDefaultsDirty(false);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingDefaults(false);
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

  const views = demo.views || {};

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>{demo.name}</h1>
        <div className="row gap-sm">
          <span className={`badge ${demo.status}`}>{demo.status}</span>
          {!demo.enabled && <span className="badge disabled">disabled</span>}
        </div>
      </div>

      {/* Views overview */}
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Total views</div>
          <div className="value">{(views.total || 0).toLocaleString()}</div>
          <div className="sub">since launch</div>
        </div>
        <div className="stat">
          <div className="label">Last 7 days</div>
          <div className="value">{(views.last7d || 0).toLocaleString()}</div>
          <div className="sub">{(views.last24h || 0)} in last 24h</div>
        </div>
        <div className="stat">
          <div className="label">Last visit</div>
          <div className="value" style={{ fontSize: 18 }}>
            {views.last_at ? relativeTime(views.last_at) : '—'}
          </div>
          <div className="sub">{views.last_at || 'no visits yet'}</div>
        </div>
        <div className="stat">
          <div className="label">Inquiries</div>
          <div className="value">—</div>
          <div className="sub"><Link to="/inquiries">view all →</Link></div>
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
          <Field
            label="Offer price (claim widget)"
            value={form.offer_price}
            edit={editing}
            mono
            placeholder={`(inherit global — currently ${demo.offer_price || 'global default'})`}
            onChange={(v) => setForm({ ...form, offer_price: v })}
            hint="Per-template override of the global default. Leave blank to inherit. All tenants of this template inherit this price too unless they override it."
          />
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

      {demo.recent_views && demo.recent_views.length > 0 && (
        <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
          <h2 style={{ margin: 0, padding: '16px 20px 12px' }}>Recent visits</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Referer</th>
                <th>IP</th>
                <th>User agent</th>
              </tr>
            </thead>
            <tbody>
              {demo.recent_views.slice(0, 15).map((v) => (
                <tr key={v.id}>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relativeTime(v.created_at)}</td>
                  <td className="mono" style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.referer || <span className="muted">direct</span>}
                  </td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{v.ip || '—'}</td>
                  <td className="mono muted" style={{ fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.user_agent || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Template defaults</h2>
          <div className="row gap-sm">
            <button
              className="btn primary"
              disabled={savingDefaults || !defaultsDirty}
              onClick={saveDefaults}
            >
              {savingDefaults ? 'Saving…' : defaultsDirty ? 'Save defaults' : 'Saved'}
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
          Fill in the values the template has <strong>baked into its built bundle</strong>
          {' '}— e.g. the literal "Novatec Glass" you see in the rendered site, the template's
          default contact email, phone, address, hero copy, social URLs, etc. When a tenant
          is served, the host tool substitutes each of these strings with the tenant's
          matching value across the served HTML and the bundled JS/CSS. This catches
          anything the template hardcoded in JSX instead of reading from <span className="mono">site.*</span>.
          Strings shorter than 3 characters are skipped to avoid spurious matches.
        </div>
        <SiteConfigForm
          value={defaults}
          onChange={(next) => { setDefaults(next); setDefaultsDirty(true); }}
        />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Tenants from this template</h2>
          <Link
            to={`/tenants/new?template=${demo.id}`}
            className="btn primary"
          >+ New tenant</Link>
        </div>
        {tenants.length === 0 ? (
          <div className="muted" style={{ marginTop: 12 }}>
            No tenants yet. Create one to spin up a re-branded copy of this site (no rebuild required).
          </div>
        ) : (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Name</th><th>Slug</th><th>URL</th><th>Status</th></tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/tenants/${t.id}`}>{t.name}</Link></td>
                  <td className="mono muted">{t.slug}</td>
                  <td>
                    {t.enabled && demo.status === 'ready' ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="mono">{t.url}</a>
                    ) : <span className="muted mono">{t.url}</span>}
                  </td>
                  <td>{t.enabled ? <span className="badge ready">live</span> : <span className="badge disabled">disabled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to="/">← Back to dashboard</Link>
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

function Field({ label, value, edit, onChange, mono, placeholder, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {edit ? (
        <input
          className={`input ${mono ? 'mono' : ''}`}
          value={value || ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className={mono ? 'mono' : ''}>{value || <span className="muted">—</span>}</div>
      )}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
