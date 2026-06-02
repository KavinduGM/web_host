import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import SiteConfigForm, { BLANK_SITE_CONFIG, deepFill } from '../components/SiteConfigForm.jsx';

const BLANK = {
  name: '',
  slug: '',
  template_id: null,
  config: BLANK_SITE_CONFIG,
};

function autoSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export default function TenantEditor() {
  const { id } = useParams();
  const isNew = !id;
  const [search] = useSearchParams();
  const nav = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState([]);

  // ---- load ----
  useEffect(() => {
    api.listDemos().then((rows) => {
      setTemplates(rows);
      if (isNew && search.get('template')) {
        setForm((f) => ({ ...f, template_id: Number(search.get('template')) }));
      } else if (isNew && rows.length === 1) {
        setForm((f) => ({ ...f, template_id: rows[0].id }));
      }
    }).catch((e) => setErr(e.message));

    if (!isNew) {
      api.getTenant(id).then((t) => {
        setForm({
          name: t.name,
          slug: t.slug,
          template_id: t.template_id,
          config: deepFill(BLANK.config, t.config || {}),
        });
      }).catch((e) => setErr(e.message));
      refreshUploads();
    }
  }, [id]);

  async function refreshUploads() {
    if (isNew) return;
    try { setUploads(await api.listTenantUploads(id)); } catch { /* */ }
  }

  const currentTemplate = useMemo(
    () => templates.find((t) => t.id === form.template_id),
    [templates, form.template_id],
  );

  // ---- save ----
  async function save() {
    setErr('');
    setBusy(true);
    try {
      if (isNew) {
        if (!form.template_id) throw new Error('Pick a template');
        const created = await api.createTenant({
          slug: form.slug,
          name: form.name,
          template_id: form.template_id,
          config: form.config,
        });
        nav(`/tenants/${created.id}`);
      } else {
        await api.updateTenant(id, { name: form.name, config: form.config });
        const t = await api.getTenant(id);
        setForm((f) => ({ ...f, name: t.name, config: deepFill(BLANK.config, t.config || {}) }));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file, kind) {
    if (isNew) throw new Error('Save the tenant first, then upload images.');
    const result = await api.uploadTenantFile(id, file, kind);
    refreshUploads();
    return result;
  }

  async function deleteUpload(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    await api.deleteTenantUpload(id, filename);
    refreshUploads();
  }

  if (!templates) return <div className="container muted">Loading…</div>;

  return (
    <div className="container" style={{ maxWidth: 880 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1>{isNew ? 'New tenant' : `Edit: ${form.name || form.slug}`}</h1>
        {!isNew && (
          <a href={`/${form.slug}/`} target="_blank" rel="noreferrer" className="mono">
            /{form.slug}/ ↗
          </a>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      {/* --- BASICS --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Basics</h2>
        <div className="row" style={{ gap: 16 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Display name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  name: v,
                  slug: isNew && (!f.slug || f.slug === autoSlug(f.name)) ? autoSlug(v) : f.slug,
                  config: { ...f.config, company: { ...f.config.company, name: v } },
                }));
              }}
              placeholder="SPIL Glass Industries"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>URL slug *</label>
            <input
              className="input mono"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="spil-glass"
              disabled={!isNew}
            />
            <div className="hint">
              Public URL: <span className="mono">/{form.slug || 'slug'}/</span>
              {!isNew && ' (slug is permanent — delete + recreate to change)'}
            </div>
          </div>
        </div>
        <div className="field">
          <label>Template *</label>
          <select
            className="input"
            value={form.template_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, template_id: Number(e.target.value) }))}
            disabled={!isNew}
          >
            <option value="">— pick a built template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug}){t.status !== 'ready' ? ` — ${t.status}` : ''}
              </option>
            ))}
          </select>
          <div className="hint">
            {currentTemplate && currentTemplate.status !== 'ready'
              ? '⚠ Template is not built yet. Tenant URL will 404 until the template builds.'
              : 'The template provides the HTML/CSS/JS. Tenant overrides only branding & copy.'}
          </div>
        </div>
      </section>

      <SiteConfigForm
        value={form.config}
        onChange={(next) => setForm((f) => ({ ...f, config: next }))}
        uploadFile={isNew ? null : uploadFile}
        uploads={uploads}
        onDeleteUpload={isNew ? null : deleteUpload}
      />

      {/* --- ACTIONS --- */}
      <div className="row gap-sm" style={{ marginBottom: 60 }}>
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : isNew ? 'Create tenant' : 'Save changes'}
        </button>
        <Link to={isNew ? '/tenants' : `/tenants`} className="btn">Cancel</Link>
      </div>
    </div>
  );
}
