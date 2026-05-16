import { useState } from 'react';
import { api } from '../api';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.login(password);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>Demo Host</h1>
        <p>Sign in to manage demo sites.</p>
        <div className="field">
          <label>Admin password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
