// Shared editor for the SiteConfig shape — used both by the tenant editor
// (to set per-tenant overrides) and the template detail page (to declare
// what values the template has baked in, which the host tool then string-
// substitutes for each tenant at serve time).
//
// `uploadFile`, if provided, enables image-upload buttons on logo / favicon
// / product images.  Template defaults don't get uploads (the template's
// images are part of its built bundle, not host-managed), so DemoDetail
// passes no uploadFile.

export const BLANK_SITE_CONFIG = {
  company:  { name: '', tagline: '', logo: '', favicon: '' },
  colors:   { primary: '#003d7a', accent: '#f7b500', primaryText: '' },
  contact:  { email: '', phone: '', address: '', socials: { facebook: '', instagram: '', linkedin: '', whatsapp: '' } },
  hero:     { headline: '', subheadline: '', ctaLabel: '', ctaHref: '' },
  products: [],
  footer:   { copyright: '', tagline: '' },
  meta:     { title: '', description: '' },
};

export default function SiteConfigForm({ value, onChange, uploadFile, uploads, onDeleteUpload }) {
  const cfg = value || BLANK_SITE_CONFIG;

  function setCfg(path, v) {
    const next = structuredClone(cfg);
    const segs = path.split('.');
    let o = next;
    while (segs.length > 1) {
      const k = segs.shift();
      if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    }
    o[segs[0]] = v;
    onChange(next);
  }

  function setProducts(updater) {
    const next = structuredClone(cfg);
    next.products = updater(next.products || []);
    onChange(next);
  }

  async function uploadAt(e, kind, applyToPath) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadFile) return;
    const { url } = await uploadFile(file, kind);
    setCfg(applyToPath, url);
  }

  return (
    <>
      {/* COMPANY */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Company</h2>
        <Text label="Company name" value={cfg.company?.name} onChange={(v) => setCfg('company.name', v)} />
        <Text label="Tagline"      value={cfg.company?.tagline} onChange={(v) => setCfg('company.tagline', v)} />

        <div className="field">
          <label>Logo</label>
          <div className="row gap-sm">
            <input
              className="input mono"
              value={cfg.company?.logo || ''}
              onChange={(e) => setCfg('company.logo', e.target.value)}
              placeholder="image URL or uploaded path"
              style={{ flex: 1 }}
            />
            {uploadFile && (
              <label className="btn">
                Upload
                <input type="file" accept="image/*" hidden onChange={(e) => uploadAt(e, 'logo', 'company.logo')} />
              </label>
            )}
          </div>
          {cfg.company?.logo && (
            <div style={{ marginTop: 8 }}>
              <img src={cfg.company.logo} alt="logo preview" style={{ maxHeight: 56, background: '#fff', padding: 6, borderRadius: 4 }} />
            </div>
          )}
        </div>

        <div className="field">
          <label>Favicon</label>
          <div className="row gap-sm">
            <input
              className="input mono"
              value={cfg.company?.favicon || ''}
              onChange={(e) => setCfg('company.favicon', e.target.value)}
              placeholder="favicon URL or uploaded path"
              style={{ flex: 1 }}
            />
            {uploadFile && (
              <label className="btn">
                Upload
                <input type="file" accept="image/*,image/x-icon" hidden onChange={(e) => uploadAt(e, 'favicon', 'company.favicon')} />
              </label>
            )}
          </div>
          {cfg.company?.favicon && (
            <div style={{ marginTop: 8 }}>
              <img src={cfg.company.favicon} alt="favicon preview" style={{ width: 32, height: 32, background: '#fff', padding: 4, borderRadius: 4 }} />
            </div>
          )}
        </div>
      </section>

      {/* COLORS */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Colors</h2>
        <div className="row" style={{ gap: 16 }}>
          <Color label="Primary"      value={cfg.colors?.primary}     onChange={(v) => setCfg('colors.primary', v)} />
          <Color label="Accent"       value={cfg.colors?.accent}      onChange={(v) => setCfg('colors.accent', v)} />
          <Color label="Primary text" value={cfg.colors?.primaryText} onChange={(v) => setCfg('colors.primaryText', v)} />
        </div>
      </section>

      {/* HERO */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Hero</h2>
        <Text label="Headline"     value={cfg.hero?.headline}    onChange={(v) => setCfg('hero.headline', v)} />
        <Text label="Subheadline"  value={cfg.hero?.subheadline} onChange={(v) => setCfg('hero.subheadline', v)} multiline />
        <div className="row" style={{ gap: 16 }}>
          <Text label="CTA label" value={cfg.hero?.ctaLabel} onChange={(v) => setCfg('hero.ctaLabel', v)} />
          <Text label="CTA link"  value={cfg.hero?.ctaHref}  onChange={(v) => setCfg('hero.ctaHref', v)} mono />
        </div>
      </section>

      {/* CONTACT */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Contact</h2>
        <div className="row" style={{ gap: 16 }}>
          <Text label="Email" value={cfg.contact?.email} onChange={(v) => setCfg('contact.email', v)} mono />
          <Text label="Phone" value={cfg.contact?.phone} onChange={(v) => setCfg('contact.phone', v)} mono />
        </div>
        <Text label="Address" value={cfg.contact?.address} onChange={(v) => setCfg('contact.address', v)} multiline />
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          {['facebook', 'instagram', 'linkedin', 'whatsapp', 'twitter', 'youtube', 'tiktok'].map((k) => (
            <Text
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              value={cfg.contact?.socials?.[k] || ''}
              onChange={(v) => setCfg(`contact.socials.${k}`, v)}
              mono
            />
          ))}
        </div>
      </section>

      {/* PRODUCTS */}
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
        {(cfg.products || []).length === 0 && (
          <div className="muted" style={{ marginTop: 12 }}>No products configured.</div>
        )}
        {(cfg.products || []).map((p, i) => (
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
                {uploadFile && (
                  <label className="btn">
                    Upload
                    <input
                      type="file" accept="image/*" hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const { url } = await uploadFile(file, `product-${i}`);
                        setProducts((arr) => arr.map((x, idx) => idx === i ? { ...x, image: url } : x));
                      }}
                    />
                  </label>
                )}
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

      {/* FOOTER + META */}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Footer & meta</h2>
        <Text label="Footer copyright"  value={cfg.footer?.copyright}    onChange={(v) => setCfg('footer.copyright', v)} />
        <Text label="Footer tagline"    value={cfg.footer?.tagline}      onChange={(v) => setCfg('footer.tagline', v)} />
        <Text label="<title> tag"        value={cfg.meta?.title}          onChange={(v) => setCfg('meta.title', v)} />
        <Text label="Meta description"   value={cfg.meta?.description}    onChange={(v) => setCfg('meta.description', v)} multiline />
      </section>

      {/* UPLOADS */}
      {uploads && uploads.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Uploaded files</h2>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {uploads.map((u) => (
              <div key={u.filename} className="card" style={{ padding: 8, background: '#0c0f14' }}>
                <img src={u.url} alt="" style={{ display: 'block', maxWidth: 120, maxHeight: 80, background: '#fff', padding: 4, borderRadius: 4 }} />
                <div className="mono muted" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all', maxWidth: 120 }}>{u.filename}</div>
                <div className="row gap-sm" style={{ marginTop: 6 }}>
                  <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(u.url)}>Copy URL</button>
                  {onDeleteUpload && (
                    <button type="button" className="btn danger" onClick={() => onDeleteUpload(u.filename)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
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
export function deepFill(template, source) {
  if (Array.isArray(template)) return Array.isArray(source) ? source : [];
  if (template && typeof template === 'object') {
    const out = {};
    for (const k of Object.keys(template)) {
      out[k] = source && typeof source === 'object' && k in source
        ? deepFill(template[k], source[k])
        : template[k];
    }
    if (source && typeof source === 'object') {
      for (const k of Object.keys(source)) {
        if (!(k in out)) out[k] = source[k];
      }
    }
    return out;
  }
  return source !== undefined ? source : template;
}
