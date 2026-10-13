'use client';

// Small navbar control to point the app at a backend at runtime (e.g. a Colab
// tunnel URL that changes every session) without rebuilding on Vercel.
import { useEffect, useState } from 'react';
import {
  getBackendUrl,
  getDefaultBackendUrl,
  setBackendUrl,
  clearBackendUrl,
  checkBackendHealth,
} from '../lib/backend_api';

export default function BackendSettings() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [active, setActive] = useState('');
  const [status, setStatus] = useState('unknown'); // unknown | checking | connected | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMounted(true);
    const current = getBackendUrl();
    setUrl(current);
    setActive(current);
    probe();
  }, []);

  async function probe() {
    setStatus('checking');
    setMessage('Checking…');
    const res = await checkBackendHealth();
    if (res.status === 'connected') {
      setStatus('connected');
      setMessage('Connected');
    } else {
      setStatus('error');
      setMessage(res.message || 'Unreachable');
    }
  }

  async function saveAndTest() {
    setBackendUrl(url);
    const current = getBackendUrl();
    setUrl(current);
    setActive(current);
    await probe();
  }

  async function reset() {
    clearBackendUrl();
    const current = getBackendUrl();
    setUrl(current);
    setActive(current);
    await probe();
  }

  const color =
    status === 'connected' ? '#16a34a' : status === 'error' ? '#dc2626' : '#94a3b8';

  const btn = {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '0.35rem 0.6rem',
    cursor: 'pointer',
    font: 'inherit',
    color: 'var(--text-secondary)',
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={btn} title="Backend connection settings" aria-label="Backend connection settings">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />
        Backend
      </button>

      {mounted && open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '135%',
            width: 340,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '0.9rem',
            boxShadow: '0 12px 30px rgba(2, 6, 23, 0.15)',
            zIndex: 100,
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Backend connection</div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 8px' }}>
            Paste your Colab tunnel URL (e.g. https://xxxx.trycloudflare.com). Saved in this browser; no redeploy needed.
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={getDefaultBackendUrl()}
            spellCheck={false}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.82rem', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={saveAndTest}
              style={{ ...btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}
            >
              Test &amp; Save
            </button>
            <button onClick={reset} style={btn}>Reset</button>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.78rem', color }}>
            {message}
            {active ? <span style={{ color: '#94a3b8' }}> · {active}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
