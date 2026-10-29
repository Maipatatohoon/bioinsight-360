import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBackendUrl,
  parseBackendFromSearch,
  stripBackendFromSearch,
  normalizeBackendInput,
  describeBackendError,
} from './backendUrl.mjs';

test('falls back to the build-time URL when nothing is stored', () => {
  assert.equal(resolveBackendUrl(null, 'http://localhost:8000'), 'http://localhost:8000');
  assert.equal(resolveBackendUrl('', 'http://localhost:8000'), 'http://localhost:8000');
  assert.equal(resolveBackendUrl('   ', 'http://localhost:8000'), 'http://localhost:8000');
});

test('a stored URL overrides the fallback', () => {
  assert.equal(resolveBackendUrl('https://abc.trycloudflare.com', 'http://x'), 'https://abc.trycloudflare.com');
});

test('strips trailing slashes and surrounding whitespace', () => {
  assert.equal(resolveBackendUrl('  https://ngrok.app/  ', 'http://x'), 'https://ngrok.app');
  assert.equal(resolveBackendUrl(null, 'http://x/'), 'http://x');
});

test('never returns an empty string', () => {
  assert.equal(resolveBackendUrl('', ''), 'http://localhost:8000');
  assert.equal(resolveBackendUrl(null, null), 'http://localhost:8000');
});

test('reads a backend URL from a shareable query string', () => {
  assert.equal(parseBackendFromSearch('?backend=https://abc.trycloudflare.com'), 'https://abc.trycloudflare.com');
  assert.equal(parseBackendFromSearch('?backend=https://abc.example.com/'), 'https://abc.example.com');
  assert.equal(parseBackendFromSearch('?foo=1&backend=http%3A%2F%2Flocalhost%3A8000'), 'http://localhost:8000');
});

test('rejects anything that is not an absolute http(s) URL', () => {
  assert.equal(parseBackendFromSearch(''), null);
  assert.equal(parseBackendFromSearch(null), null);
  assert.equal(parseBackendFromSearch('?backend='), null);
  assert.equal(parseBackendFromSearch('?other=1'), null);
  assert.equal(parseBackendFromSearch('?backend=localhost:8000'), null);
  assert.equal(parseBackendFromSearch('?backend=/relative/path'), null);
  assert.equal(parseBackendFromSearch('?backend=javascript:alert(1)'), null);
});

test('strips only the backend parameter from a query string', () => {
  assert.equal(stripBackendFromSearch('?backend=https://x.example&mode=qc'), '?mode=qc');
  assert.equal(stripBackendFromSearch('?mode=qc&backend=https://x.example'), '?mode=qc');
  assert.equal(stripBackendFromSearch('?backend=https://x.example'), '');
  assert.equal(stripBackendFromSearch(''), '');
});

test('normalises what a user pastes into the backend dialog', () => {
  assert.equal(normalizeBackendInput('abc.trycloudflare.com'), 'https://abc.trycloudflare.com');
  assert.equal(normalizeBackendInput('  https://abc.trycloudflare.com/  '), 'https://abc.trycloudflare.com');
  assert.equal(normalizeBackendInput('http://localhost:8000'), 'http://localhost:8000');
  assert.equal(normalizeBackendInput(''), '');
  assert.equal(normalizeBackendInput('not a url'), null);
});

test('explains a dead tunnel instead of showing a bare status code', () => {
  const dead = describeBackendError(502, 'HTTP 502');
  assert.match(dead, /not running/i);
  assert.match(dead, /STEP 10/);
  assert.match(describeBackendError(530), /tunnel/i);
  assert.match(describeBackendError(404, 'HTTP 404'), /\/health/);
  assert.match(describeBackendError(0, 'Failed to fetch'), /Colab runtime/i);
});
