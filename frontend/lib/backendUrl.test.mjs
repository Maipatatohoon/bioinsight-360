import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackendUrl } from './backendUrl.mjs';

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
