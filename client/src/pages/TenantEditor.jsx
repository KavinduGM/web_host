import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import SiteConfigForm, { BLANK_SITE_CONFIG, deepFill } from '../components/SiteConfigForm.jsx';

const BLANK = {
  name: '',
  slug: '',
  template_id: null,
  config: BLANK_SITE_CONFIG,
  offer_price: '',
  custom_css: '',
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
          offer_price: t.offer_price || '',
          custom_css: t.custom_css || '',
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
        // offer_price needs a follow-up PATCH if set (POST doesn't take it).
        if (form.offer_price?.trim()) {
          await api.updateTenant(created.id, { offer_price: form.offer_price });
        }
        nav(`/tenants/${created.id}`);
      } else {
        await api.updateTenant(id, {
          name: form.name,
          config: form.config,
          offer_price: form.offer_price,
          custom_css: form.custom_css,
        });
        const t = await api.getTenant(id);
        setForm((f) => ({
          ...f,
          name: t.name,
          config: deepFill(BLANK.config, t.config || {}),
          offer_price: t.offer_price || '',
          custom_css: t.custom_css || '',
        }));
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
        <div className="field">
          <label>Offer price (claim widget)</label>
          <input
            className="input mono"
            value={form.offer_price || ''}
            onChange={(e) => setForm((f) => ({ ...f, offer_price: e.target.value }))}
            placeholder={
              currentTemplate?.offer_price
                ? `(blank = inherit template — currently ${currentTemplate.offer_price})`
                : '(blank = inherit global default)'
            }
            style={{ maxWidth: 260 }}
          />
          <div className="hint">
            Overrides the template's price for this tenant only. e.g. <span className="mono">$1,200</span>.
            Leave blank to use the template's price (which itself falls back to the global default).
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

      {/* --- CUSTOM CSS --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Custom CSS (this tenant only)</h2>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>
          Loaded AFTER the template's own custom CSS, so per-tenant tweaks win cascade
          ties. Use it to patch this tenant's rendered design without rebuilding the
          template — recolor sections, hide elements, override spacing, etc.
        </div>
        <textarea
          className="textarea"
          value={form.custom_css || ''}
          onChange={(e) => setForm((f) => ({ ...f, custom_css: e.target.value }))}
          placeholder={`/* Example — fix a low-contrast testimonials block */
section[class*="testimonial"] h2 { color: #ffffff !important; }
section[class*="testimonial"] p  { color: rgba(255,255,255,0.85); }
section[class*="testimonial"] [class*="card"] {
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.18);
}`}
          style={{ minHeight: 200, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5, lineHeight: 1.55 }}
          spellCheck={false}
        />
        <div className="hint" style={{ marginTop: 6 }}>
          Up to 64&nbsp;KB. Saved with the rest of the form below. To preview, save and
          open the tenant URL in a new tab.
        </div>
      </section>

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
