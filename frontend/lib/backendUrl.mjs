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
