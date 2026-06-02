import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const STATUS_LABEL = { new: 'New', contacted: 'Contacted', closed: 'Closed' };
const STATUS_ORDER = ['new', 'contacted', 'closed'];

export default function Inquiries() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all'); // all | new | contacted | closed
  const [expanded, setExpanded] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const d = await api.listInquiries();
      setData(d);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function act(fn) {
    setErr('');
    try { await fn(); load(); }
    catch (e) { setErr(e.message); }
  }

  if (!data) return <div className="container muted">Loading…</div>;

  const counts = data.counts || {};
  const total  = data.inquiries.length;
  const shown  = filter === 'all'
    ? data.inquiries
    : data.inquiries.filter((i) => i.status === filter);

  return (
    <div className="container">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Inquiries</h1>
        <div className="muted">{total} total · {counts.new || 0} new</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          <FilterChip label={`All (${total})`}                          active={filter === 'all'}       onClick={() => setFilter('all')} />
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              label={`${STATUS_LABEL[s]} (${counts[s] || 0})`}
              active={filter === s}
              onClick={() => setFilter(s)}
              status={s}
            />
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <div className="empty">
            {filter === 'all'
              ? "No inquiries yet. The 'Claim This Website' widget is live on every template and tenant page — when a visitor submits, it appears here."
              : `No ${STATUS_LABEL[filter].toLowerCase()} inquiries.`}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>From</th>
                <th>Email / Phone</th>
                <th>Demo</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <Row
                  key={i.id}
                  inquiry={i}
                  expanded={expanded === i.id}
                  onToggle={() => setExpanded(expanded === i.id ? null : i.id)}
                  onStatusChange={(status) => act(() => api.updateInquiry(i.id, { status }))}
                  onDelete={() => {
                    if (confirm(`Delete inquiry from ${i.name}?`)) {
                      act(() => api.deleteInquiry(i.id));
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ inquiry: i, expanded, onToggle, onStatusChange, onDelete }) {
  const isTenant = i.source_kind === 'tenant';
  const demoUrl = `/${i.source_slug}/`;

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td style={{ width: 24, color: '#6b7280' }}>{expanded ? '▾' : '▸'}</td>
        <td>
          <div style={{ fontWeight: 600 }}>{i.name}</div>
          {i.message && (
            <div className="muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i.message}
            </div>
          )}
        </td>
        <td>
          <div className="mono" style={{ fontSize: 12 }}>{i.email}</div>
          {i.phone && <div className="mono muted" style={{ fontSize: 12 }}>{i.phone}</div>}
        </td>
        <td>
          <div className="row gap-sm" style={{ alignItems: 'center' }}>
            <span className={`badge ${isTenant ? 'ready' : 'pending'}`} style={{ fontSize: 10 }}>
              {isTenant ? 'TENANT' : 'TEMPLATE'}
            </span>
            <div>
              <div>{i.source_name}</div>
              <a
                href={demoUrl}
                target="_blank"
                rel="noreferrer"
                className="mono muted"
                style={{ fontSize: 11 }}
                onClick={(e) => e.stopPropagation()}
              >
                {demoUrl} ↗
              </a>
            </div>
          </div>
        </td>
        <td className="muted" style={{ fontSize: 12 }}>{relativeTime(i.created_at)}</td>
        <td>
          <StatusBadge status={i.status} />
        </td>
        <td className="actions" onClick={(e) => e.stopPropagation()}>
          {i.status !== 'closed' && (
            <select
              className="input mono"
              value={i.status}
              onChange={(e) => onStatusChange(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          )}{' '}
          <button className="btn danger" onClick={onDelete} style={{ padding: '4px 10px', fontSize: 12 }}>Delete</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td></td>
          <td colSpan={6} style={{ background: '#0c0f14', padding: 16 }}>
            <DetailGrid inquiry={i} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailGrid({ inquiry: i }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 16px', fontSize: 13 }}>
      <Label>Message</Label>     <Value>{i.message || <em className="muted">(none)</em>}</Value>
      <Label>Submitted</Label>   <Value className="mono">{i.created_at} UTC</Value>
      <Label>Referer</Label>     <Value className="mono" style={{ wordBreak: 'break-all' }}>{i.referer || <em className="muted">(unknown)</em>}</Value>
      <Label>User agent</Label>  <Value className="mono muted" style={{ fontSize: 11 }}>{i.user_agent || <em>(unknown)</em>}</Value>
      <Label>IP</Label>          <Value className="mono muted" style={{ fontSize: 11 }}>{i.ip || <em>(unknown)</em>}</Value>
      <Label>Source</Label>      <Value>
        <span className="mono">{i.source_kind} #{i.source_id ?? '?'}</span> — {i.source_name}{' '}
        <a href={`/${i.source_slug}/`} target="_blank" rel="noreferrer" className="mono">/{i.source_slug}/ ↗</a>
      </Value>
      <Label>Quick actions</Label>
      <Value>
        <a className="btn" href={`mailto:${i.email}?subject=${encodeURIComponent(`Re: ${i.source_name} — your $800 claim`)}&body=${encodeURIComponent(`Hi ${i.name.split(' ')[0]},\n\nThanks for your interest in ${i.source_name}.\n\n`)}`} style={{ padding: '4px 12px', fontSize: 12 }}>
          ✉ Email
        </a>{' '}
        {i.phone && (
          <a className="btn" href={`tel:${i.phone}`} style={{ padding: '4px 12px', fontSize: 12 }}>
            ☎ Call
          </a>
        )}{' '}
        <button className="btn" onClick={() => navigator.clipboard.writeText(i.email)} style={{ padding: '4px 12px', fontSize: 12 }}>
          Copy email
        </button>
      </Value>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: 2 }}>{children}</div>;
}
function Value({ children, className, style }) {
  return <div className={className} style={style}>{children}</div>;
}

function FilterChip({ label, active, onClick, status }) {
  const color = status === 'new' ? '#a78bfa'
              : status === 'contacted' ? '#fbbf24'
              : status === 'closed' ? '#6b7280'
              : null;
  return (
    <button
      className={`btn ${active ? 'primary' : ''}`}
      onClick={onClick}
      style={{
        padding: '6px 14px',
        ...(active && color ? { background: color, borderColor: color, color: '#0c0f14' } : {}),
      }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'new' ? 'badge pending'
            : status === 'contacted' ? 'badge ready'
            : 'badge disabled';
  return <span className={cls}>{STATUS_LABEL[status] || status}</span>;
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
