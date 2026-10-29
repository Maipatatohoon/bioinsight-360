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
import { parseBackendFromSearch, stripBackendFromSearch, normalizeBackendInput, describeBackendError } from '../lib/backendUrl.mjs';

export default function BackendSettings({ light = false }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [active, setActive] = useState('');
  const [status, setStatus] = useState('unknown'); // unknown | checking | connected | error
  const [message, setMessage] = useState('');
  const [fromLink, setFromLink] = useState(false);

  useEffect(() => {
    setMounted(true);
    // A shared demo link can carry ?backend=<url>. Apply it once and drop the
    // parameter so the address bar stays clean and the choice is remembered.
    const linked = parseBackendFromSearch(window.location.search);
    if (linked) {
      setBackendUrl(linked);
      setFromLink(true);
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${stripBackendFromSearch(window.location.search)}${window.location.hash}`
      );
    }
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
      setMessage(describeBackendError(res.httpStatus, res.message));
    }
  }

  async function saveAndTest() {
    const candidate = normalizeBackendInput(url);
    if (!candidate) {
      setStatus('error');
      setMessage('That is not a valid URL. Paste the full address, for example https://xxxx.trycloudflare.com');
      return;
    }
    setUrl(candidate);
    setStatus('checking');
    setMessage('Checking…');
    const res = await checkBackendHealth(candidate);
    if (res.status === 'connected') {
      // Only a backend that actually answers /health is stored, so a dead
      // tunnel can never become the active address by accident.
      setBackendUrl(candidate);
      setActive(candidate);
      setStatus('connected');
      setMessage('Connected and saved');
    } else {
      setStatus('error');
      setMessage(describeBackendError(res.httpStatus, res.message));
    }
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
    border: light ? '1px solid rgba(226, 232, 240, 0.35)' : '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '0.35rem 0.6rem',
    cursor: 'pointer',
    font: 'inherit',
    color: light ? '#e8eeff' : 'var(--text-secondary)',
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
          {fromLink && (
            <p style={{ fontSize: '0.72rem', color: '#0369a1', margin: '0 0 8px' }}>
              Loaded from a shared link. Check the address before uploading data.
            </p>
          )}
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
          <div style={{ marginTop: 8, fontSize: '0.78rem', color, lineHeight: 1.45, wordBreak: 'break-word' }}>
            {message}
            {active ? <span style={{ color: '#94a3b8' }}> · {active}</span> : null}
          </div>
          {status === 'error' && (
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.45 }}>
              Each Colab restart gives a new URL. Run STEP 10 (backend), then STEP 11 (URL),
              then STEP 12 (worker), and use the newest address only.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
