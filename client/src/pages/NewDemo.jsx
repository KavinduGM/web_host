import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function NewDemo() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    git_url: '',
    git_branch: 'main',
    build_cmd: 'npm ci && npm run build',
    output_dir: 'dist',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function autoSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const demo = await api.createDemo(form);
      nav(`/demos/${demo.id}`);
    } catch (e) {
      setErr(e.message || 'Failed to create demo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>New demo</h1>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => {
              update('name', e.target.value);
              if (!form.slug || form.slug === autoSlug(form.name)) {
                update('slug', autoSlug(e.target.value));
              }
            }}
            placeholder="SPIL Glass Demo"
            required
          />
        </div>

        <div className="field">
          <label>Slug</label>
          <input
            className="input mono"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            placeholder="spil-glass"
            required
          />
          <div className="hint">Public URL will be <span className="mono">/{form.slug || 'your-slug'}/</span></div>
        </div>

        <div className="field">
          <label>Git URL</label>
          <input
            className="input mono"
            value={form.git_url}
            onChange={(e) => update('git_url', e.target.value)}
            placeholder="https://github.com/your-org/spil-glass-site.git"
            required
          />
          <div className="hint">
            HTTPS public repos, or SSH if the VPS has a deploy key configured.
          </div>
        </div>

        <div className="row" style={{ gap: 16 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Branch</label>
            <input
              className="input mono"
              value={form.git_branch}
              onChange={(e) => update('git_branch', e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Output directory</label>
            <input
              className="input mono"
              value={form.output_dir}
              onChange={(e) => update('output_dir', e.target.value)}
            />
            <div className="hint">Where the build writes static files (Vite: <span className="mono">dist</span>, CRA: <span className="mono">build</span>)</div>
          </div>
        </div>

        <div className="field">
          <label>Build command</label>
          <input
            className="input mono"
            value={form.build_cmd}
            onChange={(e) => update('build_cmd', e.target.value)}
          />
          <div className="hint">Runs inside the cloned repo. Use <span className="mono">&amp;&amp;</span> to chain steps.</div>
        </div>

        {err && <div className="error">{err}</div>}

        <div className="row gap-sm" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create & build'}
          </button>
          <button type="button" className="btn" onClick={() => nav('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
