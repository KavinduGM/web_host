import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then((s) => { setSettings(s); setForm(s); })
      .catch((e) => setErr(e.message));
  }, []);

  async function save() {
    setErr('');
    setSaved(false);
    setBusy(true);
    try {
      const s = await api.updateSettings(form);
      setSettings(s);
      setForm(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <div className="container muted">Loading…</div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <h1>Settings</h1>
      {err && <div className="error">{err}</div>}

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
