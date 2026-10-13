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
