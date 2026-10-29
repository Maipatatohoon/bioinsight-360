// Runtime-resolvable backend URL.
// Precedence: value saved in the browser (localStorage) > build-time env > localhost.
// Kept dependency-free so it is trivially unit-testable and safe to import anywhere.

export const STORAGE_KEY = 'bioinsight_backend_url';
const FALLBACK = 'http://localhost:8000';

/**
 * Resolve the backend base URL from a stored override and a build-time fallback.
 * Always returns a non-empty URL with no trailing slash.
 */
export function resolveBackendUrl(stored, fallback) {
  const raw = (stored ?? '').toString().trim();
  const fb = (fallback ?? '').toString().trim();
  const chosen = raw || fb || FALLBACK;
  return chosen.replace(/\/+$/, '') || FALLBACK;
}

/**
 * Read a backend URL from a query string such as `?backend=https://abc.example`.
 * Returns null for anything that is not an absolute http(s) URL, so a malformed
 * or relative value can never silently become the active backend.
 */
export function parseBackendFromSearch(search) {
  if (!search || typeof search !== 'string') return null;
  let raw;
  try {
    raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('backend');
  } catch {
    return null;
  }
  const value = (raw ?? '').toString().trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (!parsed.hostname) return null;
  } catch {
    return null;
  }
  return value.replace(/\/+$/, '');
}

/** Remove the `backend` parameter from a query string, preserving the rest. */
export function stripBackendFromSearch(search) {
  const params = new URLSearchParams((search || '').replace(/^\?/, ''));
  params.delete('backend');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * Normalise what a user pastes into the Backend dialog.
 * Accepts `abc.trycloudflare.com` (adds https://), trims spaces and trailing
 * slashes. Returns '' for empty input and null for something unusable, so the
 * caller never silently stores a broken address.
 */
export function normalizeBackendInput(value) {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      if (parsed.hostname !== 'localhost') return null;
    }
    return withScheme.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Turn a failed health check into a message that says what to do next.
 * A 502/530 from a Cloudflare tunnel means the tunnel exists but the Colab
 * backend process behind it is gone - a very different problem from a typo.
 */
export function describeBackendError(httpStatus, fallbackMessage = '') {
  const status = Number(httpStatus) || 0;
  if ([502, 503, 504, 530].includes(status)) {
    return `The tunnel answered but the backend behind it is not running (HTTP ${status}). In Colab run STEP 10, then STEP 11, then paste the new URL.`;
  }
  if (status === 404) {
    return 'Reached a server, but /health was not found (HTTP 404). Use the backend root URL, not a page path.';
  }
  if (status >= 500) {
    return `The backend returned HTTP ${status}. Check the Colab log in STEP 15.`;
  }
  if (!fallbackMessage || /failed to fetch|networkerror|load failed/i.test(fallbackMessage)) {
    return 'Could not reach that URL. The Colab runtime is probably stopped, or the tunnel has expired. Restart STEP 10-12 and use the new URL.';
  }
  return fallbackMessage;
}

export function readStoredBackendUrl() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredBackendUrl(url) {
  if (typeof window === 'undefined') return;
  try {
    const value = (url ?? '').toString().trim();
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value.replace(/\/+$/, ''));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore storage failures (private mode, quota) */
  }
}
