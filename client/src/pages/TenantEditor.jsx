import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const BLANK = {
  name: '',
  slug: '',
  template_id: null,
  config: {
    company:  { name: '', tagline: '', logo: '' },
    colors:   { primary: '#003d7a', accent: '#f7b500', primaryText: '' },
    contact:  { email: '', phone: '', address: '', socials: { facebook: '', instagram: '', linkedin: '', whatsapp: '' } },
    hero:     { headline: '', subheadline: '', ctaLabel: '', ctaHref: '' },
    products: [],
    footer:   { copyright: '', tagline: '' },
    meta:     { title: '', description: '' },
  },
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
          config: { ...BLANK.config, ...deepFill(BLANK.config, t.config || {}) },
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

  // ---- helpers to mutate nested config ----
  function setCfg(path, value) {
    setForm((prev) => {
      const next = structuredClone(prev);
      const segs = path.split('.');
      let o = next.config;
      while (segs.length > 1) {
        const k = segs.shift();
        if (!o[k] || typeof o[k] !== 'object') o[k] = {};
        o = o[k];
      }
      o[segs[0]] = value;
      return next;
    });
  }

  function setProducts(updater) {
    setForm((prev) => {
      const next = structuredClone(prev);
      next.config.products = updater(next.config.products || []);
      return next;
    });
  }

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
        // soft confirmation — refetch to show what server stored
        const t = await api.getTenant(id);
        setForm((f) => ({ ...f, name: t.name, config: { ...BLANK.config, ...deepFill(BLANK.config, t.config || {}) } }));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- upload ----
  async function upload(e, kind, applyToPath) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isNew) { setErr('Save the tenant first, then upload images.'); return; }
    try {
      const { url } = await api.uploadTenantFile(id, file, kind);
      setCfg(applyToPath, url);
      refreshUploads();
    } catch (e) {
      setErr(e.message);
    }
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

      {/* --- COMPANY --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Company</h2>
        <Text label="Tagline" value={form.config.company.tagline} onChange={(v) => setCfg('company.tagline', v)} />
        <div className="field">
          <label>Logo</label>
          <div className="row gap-sm">
            <input
              className="input mono"
              value={form.config.company.logo || ''}
              onChange={(e) => setCfg('company.logo', e.target.value)}
              placeholder="/spil-glass/__tenant__/uploads/logo.png  or paste URL"
              style={{ flex: 1 }}
            />
            <label className="btn">
              Upload
              <input type="file" accept="image/*" hidden onChange={(e) => upload(e, 'logo', 'company.logo')} />
            </label>
          </div>
          {form.config.company.logo && (
            <div style={{ marginTop: 8 }}>
              <img src={form.config.company.logo} alt="logo preview" style={{ maxHeight: 56, background: '#fff', padding: 6, borderRadius: 4 }} />
            </div>
          )}
        </div>
      </section>

      {/* --- COLORS --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Colors</h2>
        <div className="row" style={{ gap: 16 }}>
          <Color label="Primary"      value={form.config.colors.primary}     onChange={(v) => setCfg('colors.primary', v)} />
          <Color label="Accent"       value={form.config.colors.accent}      onChange={(v) => setCfg('colors.accent', v)} />
          <Color label="Primary text" value={form.config.colors.primaryText} onChange={(v) => setCfg('colors.primaryText', v)} />
        </div>
      </section>

      {/* --- HERO --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Hero</h2>
        <Text label="Headline"     value={form.config.hero.headline}    onChange={(v) => setCfg('hero.headline', v)} />
        <Text label="Subheadline"  value={form.config.hero.subheadline} onChange={(v) => setCfg('hero.subheadline', v)} multiline />
        <div className="row" style={{ gap: 16 }}>
          <Text label="CTA label" value={form.config.hero.ctaLabel} onChange={(v) => setCfg('hero.ctaLabel', v)} />
          <Text label="CTA link"  value={form.config.hero.ctaHref}  onChange={(v) => setCfg('hero.ctaHref', v)} mono />
        </div>
      </section>

      {/* --- CONTACT --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Contact</h2>
        <div className="row" style={{ gap: 16 }}>
          <Text label="Email"   value={form.config.contact.email} onChange={(v) => setCfg('contact.email', v)} mono />
          <Text label="Phone"   value={form.config.contact.phone} onChange={(v) => setCfg('contact.phone', v)} mono />
        </div>
        <Text label="Address" value={form.config.contact.address} onChange={(v) => setCfg('contact.address', v)} multiline />
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          {['facebook', 'instagram', 'linkedin', 'whatsapp'].map((k) => (
            <Text
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              value={form.config.contact.socials[k] || ''}
              onChange={(v) => setCfg(`contact.socials.${k}`, v)}
              mono
            />
          ))}
        </div>
      </section>

      {/* --- PRODUCTS --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Products / services</h2>
          <button
            type="button"
            className="btn"
            onClick={() => setProducts((arr) => [...arr, { name: '', description: '', image: '', href: '', price: '' }])}
          >
            + Add product
          </button>
        </div>
        {(form.config.products || []).length === 0 && (
          <div className="muted" style={{ marginTop: 12 }}>No products configured. Leave empty if the template doesn't show products.</div>
        )}
        {(form.config.products || []).map((p, i) => (
          <div key={i} className="card" style={{ background: '#0c0f14', marginTop: 12 }}>
            <div className="row between">
              <strong>Product #{i + 1}</strong>
              <button type="button" className="btn danger" onClick={() => setProducts((arr) => arr.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Text label="Name"  value={p.name}  onChange={(v) => setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, name: v } : x))} />
              <Text label="Price" value={p.price} onChange={(v) => setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, price: v } : x))} />
            </div>
            <Text label="Description" value={p.description} multiline onChange={(v) => setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, description: v } : x))} />
            <div className="field">
              <label>Image</label>
              <div className="row gap-sm">
                <input
                  className="input mono"
                  value={p.image || ''}
                  onChange={(e) => setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, image: e.target.value } : x))}
                  placeholder="URL or uploaded path"
                  style={{ flex: 1 }}
                />
                <label className="btn">
                  Upload
                  <input
                    type="file" accept="image/*" hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (isNew) { setErr('Save the tenant first, then upload images.'); return; }
                      try {
                        const { url } = await api.uploadTenantFile(id, file, `product-${i}`);
                        setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, image: url } : x));
                        refreshUploads();
                      } catch (err) {
                        setErr(err.message);
                      }
                    }}
                  />
                </label>
              </div>
              {p.image && (
                <div style={{ marginTop: 8 }}>
                  <img src={p.image} alt="" style={{ maxHeight: 80, background: '#fff', padding: 6, borderRadius: 4 }} />
                </div>
              )}
            </div>
            <Text label="Link (optional)" value={p.href} mono onChange={(v) => setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, href: v } : x))} />
          </div>
        ))}
      </section>

      {/* --- FOOTER + META --- */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Footer & meta</h2>
        <Text label="Footer copyright" value={form.config.footer.copyright} onChange={(v) => setCfg('footer.copyright', v)} />
        <Text label="Footer tagline"   value={form.config.footer.tagline}   onChange={(v) => setCfg('footer.tagline', v)} />
        <Text label="<title> tag"       value={form.config.meta.title}       onChange={(v) => setCfg('meta.title', v)} />
        <Text label="Meta description"  value={form.config.meta.description} onChange={(v) => setCfg('meta.description', v)} multiline />
      </section>

      {/* --- UPLOADS LIBRARY --- */}
      {!isNew && uploads.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Uploaded files</h2>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {uploads.map((u) => (
              <div key={u.filename} className="card" style={{ padding: 8, background: '#0c0f14' }}>
                <img src={u.url} alt="" style={{ display: 'block', maxWidth: 120, maxHeight: 80, background: '#fff', padding: 4, borderRadius: 4 }} />
                <div className="mono muted" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all', maxWidth: 120 }}>{u.filename}</div>
                <div className="row gap-sm" style={{ marginTop: 6 }}>
                  <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(u.url)}>Copy URL</button>
                  <button type="button" className="btn danger" onClick={() => deleteUpload(u.filename)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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

function Text({ label, value, onChange, multiline, mono }) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      {multiline ? (
        <textarea
          className="textarea"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={`input ${mono ? 'mono' : ''}`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <div className="row gap-sm">
        <input
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
        <input
          className="input mono"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

// Recursively keep only fields that exist in `template`, but pull values from `source`.
function deepFill(template, source) {
  if (Array.isArray(template)) return Array.isArray(source) ? source : [];
  if (template && typeof template === 'object') {
    const out = {};
    for (const k of Object.keys(template)) {
      out[k] = source && typeof source === 'object' && k in source
        ? deepFill(template[k], source[k])
        : template[k];
    }
    // Also keep extra keys from source for forward-compat
    if (source && typeof source === 'object') {
      for (const k of Object.keys(source)) {
        if (!(k in out)) out[k] = source[k];
      }
    }
    return out;
  }
  return source !== undefined ? source : template;
}
