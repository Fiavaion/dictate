'use strict';
// Tests for electron/server.js: Ollama-origin validation (CSP injection), static and scan guards.
// Run: node --test tests/server.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate config: without an Electron app, server.js keeps config under the home directory.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dictate-test-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const configFile = path.join(home, '.fiavaion-dictate', 'config.json');

const { startServer, ollamaOrigin } = require('../electron/server.js');

const INJECTION_PAYLOADS = [
  "http://x;script-src-elem * 'unsafe-inline';script-src-attr 'unsafe-inline'",
  'http://x;sandbox',
  'http://x,script-src',
  'http://x script-src *',
  "http://'x'",
  'http://"x"',
  'http://x%3Bsandbox',
  'http://x:0',
  'http://x:65536',
  'http://user:pass@x',
  'javascript:alert(1)',
  'file:///etc/passwd',
];
const SAFE_ORIGIN = /^https?:\/\/([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d{1,5})?$/;

let server;
let base;
before(async () => {
  server = await startServer(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(home, { recursive: true, force: true });
});

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return {}; } };

test('injection payloads are rejected by the validator', () => {
  for (const payload of INJECTION_PAYLOADS) assert.equal(ollamaOrigin(payload), null, payload);
});

test('control characters cannot reach the header', () => {
  for (const payload of ['http://x\tsandbox', 'http://x\n;sandbox', 'http://x\r\nSet-Cookie: a']) {
    const origin = ollamaOrigin(payload);
    assert.ok(origin === null || SAFE_ORIGIN.test(origin), String(origin));
  }
});

test('valid URLs are normalised to an origin', () => {
  assert.equal(ollamaOrigin('http://192.168.1.50:11434/api'), 'http://192.168.1.50:11434');
  assert.equal(ollamaOrigin('https://Ollama.Example'), 'https://ollama.example');
  assert.equal(ollamaOrigin('http://[::1]:11434'), 'http://[::1]:11434');
  assert.equal(ollamaOrigin('http://host:80'), 'http://host');
  assert.equal(ollamaOrigin('http://bücher.de'), 'http://xn--bcher-kva.de');
});

test('injection payloads are rejected over HTTP and never persisted', async () => {
  for (const payload of INJECTION_PAYLOADS) {
    const res = await post('/api/ollama-url', { url: payload });
    assert.equal(res.status, 400, payload);
  }
  assert.equal(readConfig().ollamaUrl, undefined);
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*;/);
  assert.doesNotMatch(csp, /unsafe-inline|sandbox/);
});

test('an invalid stored value is dropped on read', async () => {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify({ ollamaUrl: 'http://x;sandbox', projectsRoot: home }));
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.doesNotMatch(csp, /sandbox/);
  assert.deepEqual(await (await fetch(base + '/api/ollama-url')).json(), { url: null });
  assert.deepEqual(readConfig(), { projectsRoot: home });
});

test('a valid saved origin is added to connect-src', async () => {
  const res = await post('/api/ollama-url', { url: 'http://192.168.1.50:11434/x' });
  assert.deepEqual(await res.json(), { url: 'http://192.168.1.50:11434' });
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\* http:\/\/192\.168\.1\.50:11434;/);
  await post('/api/ollama-url', { url: null });
  assert.equal(readConfig().ollamaUrl, undefined);
});

test('only the page, js/ and css/ are served; scan stays inside the projects root', async () => {
  assert.doesNotMatch(await (await fetch(base + '/package.json')).text(), /electron-builder/);
  assert.doesNotMatch(await (await fetch(base + '/js/%2e%2e/package.json')).text(), /electron-builder/);
  assert.equal((await fetch(base + '/js/app.js')).status, 200);
  const scan = await (await fetch(base + '/api/projects/..%2F..%2F..%2F/scan')).json();
  assert.deepEqual(scan.files, []);
});
