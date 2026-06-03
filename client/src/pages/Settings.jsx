import { useEffect, useState } from 'react';
import { api } from '../api';

// Local fallback so the page is editable even if the GET fails — the user
// can still type a value and try to save; we won't blank-out their input.
const FALLBACK = { default_offer_price: '$800' };

export default function Settings() {
  const [settings, setSettings] = useState(null);   // null = loading
  const [form, setForm]         = useState(FALLBACK);
  const [busy, setBusy]         = useState(false);
  const [loadErr, setLoadErr]   = useState('');
  const [saveErr, setSaveErr]   = useState('');
  const [saved, setSaved]       = useState(false);

  async function load() {
    setLoadErr('');
    try {
      const s = await api.getSettings();
      setSettings(s);
      // Only seed the form on first load OR if the user hasn't typed anything
      // (i.e. the form still equals the fallback / previous server state).
      setForm((prev) => (
        settings == null || JSON.stringify(prev) === JSON.stringify(settings || FALLBACK)
          ? s
          : prev
      ));
    } catch (e) {
      setLoadErr(e.message || 'Could not load settings');
      // If this was the first load, fall back to defaults so the form still
      // renders — the user can save to push their value to the server.
      if (settings == null) setSettings(FALLBACK);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaveErr('');
    setSaved(false);
    setBusy(true);
    try {
      const s = await api.updateSettings(form);
      setSettings(s);
      setForm(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveErr(e.message || 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  if (settings == null) return <div className="container muted">Loading…</div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1>Settings</h1>

      {loadErr && (
        <div className="error" style={{ marginBottom: 12 }}>
          Could not load current settings: <span className="mono">{loadErr}</span>.{' '}
          <button className="btn" onClick={load} style={{ marginLeft: 8, padding: '2px 10px', fontSize: 12 }}>
            Retry
          </button>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
            You can still type a value below and try to save it.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Claim widget — global default price</h2>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
          The default offer price shown by the "Claim This Website" widget on every
          template and tenant page. Individual templates and tenants can override
          this with their own price — see the "Offer price" field on each one. Leave
          a per-website override blank to fall back to this default.
        </div>
        <div className="field" style={{ maxWidth: 240 }}>
          <label>Default offer price</label>
          <input
            className="input mono"
            value={form.default_offer_price || ''}
            onChange={(e) => setForm({ ...form, default_offer_price: e.target.value })}
            placeholder="$800"
          />
          <div className="hint">e.g. <span className="mono">$800</span>, <span className="mono">$1,200</span>, <span className="mono">LKR 250,000</span></div>
        </div>

        {saveErr && (
          <div className="error" style={{ marginTop: 10 }}>
            Save failed: <span className="mono">{saveErr}</span>
          </div>
        )}

        <div className="row gap-sm" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
          </button>
          {dirty && !busy && (
            <button className="btn" onClick={() => setForm(settings)}>Discard</button>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How pricing resolves</h2>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          When the widget renders on a demo page, it picks a price in this order:
          <ol style={{ paddingLeft: 22, marginTop: 8 }}>
            <li><strong>Tenant offer price</strong> — if the tenant has its own override</li>
            <li><strong>Template offer price</strong> — if the parent template has an override</li>
            <li><strong>This global default</strong></li>
          </ol>
          To make a single template (and all its tenants) more expensive, set the
          override on the template. To price one specific tenant differently from
          its siblings, set the override on the tenant.
        </div>
      </div>
    </div>
  );
}
