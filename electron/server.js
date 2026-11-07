'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

let _electronApp = null;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function _userDataDir() {
  if (_electronApp) return _electronApp.getPath('userData');
  return path.join(os.homedir(), '.fiavaion-dictate');
}

function _configPath() {
  const dir = _userDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'config.json');
}

function _loadConfig() {
  try { return JSON.parse(fs.readFileSync(_configPath(), 'utf8')); }
  catch { return {}; }
}

function _saveConfig(cfg) {
  fs.writeFileSync(_configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function _getProjectsRoot() {
  return _loadConfig().projectsRoot || path.join(os.homedir(), 'AIprojects');
}

function _setProjectsRoot(p) {
  const resolved = path.resolve(p);
  try {
    if (!fs.statSync(resolved).isDirectory()) return [false, 'Not a directory'];
  } catch { return [false, 'Directory does not exist']; }
  const cfg = _loadConfig();
  cfg.projectsRoot = resolved;
  _saveConfig(cfg);
  return [true, resolved];
}

// Ollama base URL chosen in AI settings. Stored as an origin; also allowed in the CSP.
// An origin safe to place in a CSP header: no spaces, ';', ',' or quotes can get through.
const OLLAMA_ORIGIN = /^https?:\/\/([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d{1,5})?$/;

function _ollamaOrigin(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const match = OLLAMA_ORIGIN.exec(url.origin);
  if (!match) return null;
  if (match[2] && !(+match[2].slice(1) >= 1 && +match[2].slice(1) <= 65535)) return null;
  return url.origin;
}

// The saved origin is re-validated on every read; an invalid stored value is dropped.
function _getOllamaUrl() {
  const cfg = _loadConfig();
  if (cfg.ollamaUrl === undefined) return null;
  const origin = typeof cfg.ollamaUrl === 'string' ? _ollamaOrigin(cfg.ollamaUrl) : null;
  if (origin !== cfg.ollamaUrl) {
    if (origin) cfg.ollamaUrl = origin;
    else delete cfg.ollamaUrl;
    _saveConfig(cfg);
  }
  return origin;
}

function _setOllamaUrl(value) {
  const cfg = _loadConfig();
  if (!value) {
    delete cfg.ollamaUrl;
    _saveConfig(cfg);
    return [true, null];
  }
  const origin = _ollamaOrigin(value);
  if (!origin) return [false, 'Ollama URL must be an http(s) URL'];
  cfg.ollamaUrl = origin;
  _saveConfig(cfg);
  return [true, origin];
}

// ---------------------------------------------------------------------------
// Rate limiter (30 req / 60 s per IP)
// ---------------------------------------------------------------------------

const _rateBuckets = new Map();

function _checkRate(ip) {
  const now = Date.now();
  const window = 60_000;
  const max = 30;
  let bucket = _rateBuckets.get(ip) || [];
  bucket = bucket.filter(t => now - t < window);
  if (bucket.length >= max) return false;
  bucket.push(now);
  _rateBuckets.set(ip, bucket);
  return true;
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', '.next',
  '.nuxt', 'vendor', 'target', '.venv', 'venv', 'coverage', '.cache',
]);
const SKIP_EXT = new Set([
  '.pyc', '.pyo', '.class', '.o', '.so', '.dll', '.exe', '.wasm',
  '.map', '.min.js', '.min.css', '.lock', '.log',
]);

function _detectStack(projectPath) {
  const tags = [];
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.electron)     tags.push('Electron');
      if (deps.react)        tags.push('React');
      if (deps.vue)          tags.push('Vue');
      if (deps.svelte)       tags.push('Svelte');
      if (deps.astro)        tags.push('Astro');
      if (deps.next)         tags.push('Next.js');
      if (deps.express)      tags.push('Express');
      if (deps.fastify)      tags.push('Fastify');
      if (deps.vite)         tags.push('Vite');
      if (deps.typescript || deps['@types/node']) tags.push('TypeScript');
      if (deps.tailwindcss)  tags.push('Tailwind');
      if (deps['better-sqlite3'] || deps.sqlite3) tags.push('SQLite');
      if (tags.length === 0) tags.push('Node.js');
    } catch { tags.push('Node.js'); }
  }
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    tags.push('Python');
  }
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) tags.push('Rust');
  if (fs.existsSync(path.join(projectPath, 'go.mod')))    tags.push('Go');
  return [...new Set(tags)].join(', ');
}

function _getProjects() {
  const root = _getProjectsRoot();
  const results = [];
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        const full = path.join(root, entry.name);
        const stat = fs.statSync(full);
        results.push({
          name: entry.name,
          path: full,
          modified: stat.mtimeMs / 1000,
          stack: _detectStack(full),
        });
      } catch { /* skip unreadable entries */ }
    }
  } catch { /* root doesn't exist yet */ }
  return results;
}

function _scanProject(name) {
  const projectsRoot = path.resolve(_getProjectsRoot());
  const root = path.resolve(projectsRoot, name);
  // Containment check: reject names like '../secret' that escape the projects root.
  const rel = path.relative(projectsRoot, root);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return { name, stack: '', files: [] };
  if (!fs.existsSync(root)) return { name, stack: '', files: [] };
  const files = [];
  function walk(dir, depth) {
    if (depth > 4 || files.length > 500) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full, depth + 1);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (!SKIP_EXT.has(ext)) {
          files.push(path.relative(root, full).replace(/\\/g, '/'));
        }
      }
    }
  }
  walk(root, 0);
  return { name, stack: _detectStack(root), files };
}

// ---------------------------------------------------------------------------
// Directory browser
// ---------------------------------------------------------------------------

function _getDriveRoots() {
  if (process.platform === 'win32') {
    const roots = [];
    for (let c = 65; c <= 90; c++) {
      const drive = String.fromCharCode(c) + ':\\';
      if (fs.existsSync(drive)) roots.push(drive);
    }
    return roots;
  }
  return ['/'];
}

function _browseDir(p) {
  const target = p ? path.resolve(p) : os.homedir();
  try {
    if (!fs.statSync(target).isDirectory()) return [null, 'Not a directory'];
  } catch { return [null, 'Directory does not exist']; }

  const dirs = [];
  try {
    for (const e of fs.readdirSync(target, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.')) dirs.push(e.name);
    }
    dirs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  } catch { /* permission denied — return empty */ }

  const parentPath = path.dirname(target);
  return [{
    path: target,
    parent: parentPath !== target ? parentPath : null,
    dirs,
    drives: _getDriveRoots(),
  }, null];
}

// ---------------------------------------------------------------------------
// Cloud AI proxy helpers
// ---------------------------------------------------------------------------

function _httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, resolve);
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _relaySSE(provider, upstream, res) {
  return new Promise((resolve) => {
    let buf = '';
    upstream.on('data', chunk => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        let event;
        try { event = JSON.parse(payload); } catch { continue; }

        let text = '';
        if (provider === 'anthropic') {
          if (event.type === 'content_block_delta') text = event.delta?.text || '';
        } else if (provider === 'openai') {
          text = event.choices?.[0]?.delta?.content || '';
        }
        if (text) res.write(JSON.stringify({ response: text, done: false }) + '\n');
      }
    });
    upstream.on('end', () => {
      res.write(JSON.stringify({ response: '', done: true }) + '\n');
      res.end();
      resolve();
    });
    upstream.on('error', () => {
      res.end();
      resolve();
    });
  });
}

function _safeErrorMsg(status, body) {
  try {
    const d = JSON.parse(body);
    if (d?.error?.message) return d.error.message.slice(0, 200);
    if (typeof d?.error === 'string') return d.error.slice(0, 200);
  } catch { /* fall through */ }
  return `HTTP ${status}`;
}

async function _proxyRequest(provider, apiKey, model, prompt, systemPrompt, stream, options, res) {
  let url, headers, bodyStr;

  if (provider === 'anthropic') {
    url = new URL('https://api.anthropic.com/v1/messages');
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    bodyStr = JSON.stringify({
      model, stream,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.1,
    });
  } else if (provider === 'openai') {
    url = new URL('https://api.openai.com/v1/chat/completions');
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    bodyStr = JSON.stringify({
      model, stream,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.1,
    });
  } else if (provider === 'google') {
    const geminiModel = model || 'gemini-2.5-flash';
    if (!MODEL_ID.test(geminiModel)) {
      res.status(400).json({ error: 'Invalid model' });
      return;
    }
    url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`
    );
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    bodyStr = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.1,
        maxOutputTokens: options.maxTokens || 1024,
      },
    });
    stream = false; // Gemini doesn't support streaming via this path
  } else {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  const reqOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
  };

  let upstream;
  try {
    upstream = await _httpsRequest(reqOptions, bodyStr);
  } catch (e) {
    res.status(502).json({ error: e.message || 'Upstream request failed' });
    return;
  }

  // Handle upstream errors
  if (upstream.statusCode >= 400) {
    const chunks = [];
    upstream.on('data', c => chunks.push(c));
    await new Promise(r => upstream.on('end', r));
    const body = Buffer.concat(chunks).toString('utf8');
    res.status(upstream.statusCode).json({ error: _safeErrorMsg(upstream.statusCode, body) });
    return;
  }

  // Stream response
  if (stream && (provider === 'anthropic' || provider === 'openai')) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.status(200);
    await _relaySSE(provider, upstream, res);
    return;
  }

  // Non-stream (Google or explicit non-stream)
  const chunks = [];
  upstream.on('data', c => chunks.push(c));
  await new Promise(r => upstream.on('end', r));
  const raw = Buffer.concat(chunks).toString('utf8');
  let text = '';
  try {
    const data = JSON.parse(raw);
    if (provider === 'anthropic') {
      text = data.content?.find(b => b.type === 'text')?.text || '';
    } else if (provider === 'openai') {
      text = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'google') {
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    }
  } catch { /* couldn't parse */ }

  if (stream) {
    // Google with stream flag: fake two NDJSON lines
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.status(200);
    res.write(JSON.stringify({ response: text, done: false }) + '\n');
    res.write(JSON.stringify({ response: '', done: true }) + '\n');
    res.end();
  } else {
    res.json({ response: text, done: true });
  }
}

async function _listAnthropicModels(apiKey) {
  const upstream = await _httpsRequest({
    hostname: 'api.anthropic.com',
    path: '/v1/models',
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }, '');
  const chunks = [];
  upstream.on('data', c => chunks.push(c));
  await new Promise(r => upstream.on('end', r));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (upstream.statusCode >= 400) throw new Error(`Anthropic models HTTP ${upstream.statusCode}: ${raw.slice(0, 200)}`);
  return JSON.parse(raw).data || [];
}

async function _listGoogleModels(apiKey) {
  const upstream = await _httpsRequest({
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models',
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
  }, '');
  const chunks = [];
  upstream.on('data', c => chunks.push(c));
  await new Promise(r => upstream.on('end', r));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (upstream.statusCode >= 400) throw new Error(`Google models HTTP ${upstream.statusCode}: ${raw.slice(0, 200)}`);
  return JSON.parse(raw).models || [];
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
let _appOrigins = new Set();

// Scripts: own files plus the pinned Mermaid build (js/ui/diagram-renderer.js, loaded with SRI).
// Connect: the app's own API, local Ollama on any localhost port, and the Ollama URL saved in
// AI settings (if any). index.html carries a static meta CSP for GitHub Pages; it is removed
// when served from here, since this header is the policy for the desktop app.
function _csp() {
  const saved = _getOllamaUrl();
  const connect = ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'];
  if (saved) connect.push(saved);
  return [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net/npm/mermaid@10.9.8/dist/mermaid.min.js",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const META_CSP = /<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n?/;

function _buildApp(staticRoot) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Only accept requests from localhost
  app.use((req, res, next) => {
    const host = req.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });

  // Security headers (mirrors server.py _security_headers)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', _csp());
    next();
  });

  // State-changing API calls must come from the app's own origin. Browsers always
  // send Origin on POST, so a cross-site page is rejected; local non-browser
  // clients send no Origin and are allowed, as before.
  app.use('/api', (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) { next(); return; }
    const origin = req.get('origin');
    if (origin !== undefined && !_appOrigins.has(origin)) {
      res.status(403).json({ error: 'Forbidden origin' });
      return;
    }
    next();
  });

  // --- System check ---
  app.get('/api/system/check', (req, res) => {
    res.json({ server: true, node: process.version });
  });

  // --- Projects ---
  app.get('/api/projects', (req, res) => {
    res.json(_getProjects());
  });

  app.get('/api/projects-root', (req, res) => {
    res.json({ path: _getProjectsRoot() });
  });

  app.post('/api/projects-root', (req, res) => {
    const { path: p } = req.body || {};
    if (!p) { res.status(400).json({ error: 'Path is required' }); return; }
    const [ok, msg] = _setProjectsRoot(p);
    if (ok) res.json({ path: msg });
    else res.status(400).json({ error: msg });
  });

  // --- Ollama URL (persisted; also widens connect-src on the next page load) ---
  app.get('/api/ollama-url', (req, res) => {
    res.json({ url: _getOllamaUrl() });
  });

  app.post('/api/ollama-url', (req, res) => {
    const { url } = req.body || {};
    if (url !== undefined && url !== null && typeof url !== 'string') {
      res.status(400).json({ error: 'url must be a string' });
      return;
    }
    const [ok, value] = _setOllamaUrl(url ? url.trim() : '');
    if (ok) res.json({ url: value });
    else res.status(400).json({ error: value });
  });

  // --- Browse ---
  app.get('/api/browse', (req, res) => {
    const [data, err] = _browseDir(req.query.path || null);
    if (err) { res.status(400).json({ error: err }); return; }
    res.json(data);
  });

  // --- Scan ---
  app.get('/api/projects/:name/scan', (req, res) => {
    res.json(_scanProject(decodeURIComponent(req.params.name)));
  });

  // --- AI proxy ---
  app.post('/api/ai/proxy', async (req, res) => {
    const ip = req.socket.remoteAddress || '127.0.0.1';
    if (!_checkRate(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded — wait 60 seconds' });
      return;
    }
    const { provider, apiKey, model, prompt, systemPrompt, stream, options } = req.body || {};
    if (!provider || !apiKey || !model) {
      res.status(400).json({ error: 'Missing provider, apiKey, or model' });
      return;
    }
    try {
      await _proxyRequest(provider, apiKey, model, prompt || '', systemPrompt || '', !!stream, options || {}, res);
    } catch (e) {
      if (!res.headersSent) res.status(502).json({ error: e.message });
    }
  });

  // --- AI models ---
  app.post('/api/ai/models', async (req, res) => {
    const { provider, apiKey } = req.body || {};
    if (!provider || !apiKey) {
      res.status(400).json({ error: 'Missing provider or apiKey' });
      return;
    }
    try {
      if (provider === 'anthropic') {
        const models = await _listAnthropicModels(apiKey);
        res.json({ models });
      } else if (provider === 'google') {
        const models = await _listGoogleModels(apiKey);
        res.json({ models });
      } else {
        res.status(400).json({ error: `Model listing not supported for: ${provider}` });
      }
    } catch (e) {
      res.status(502).json({ error: e.message || 'Failed to fetch models' });
    }
  });

  // --- Static files (the web app): only the page, its scripts and its styles ---
  app.use('/js', express.static(path.join(staticRoot, 'js'), { index: false }));
  app.use('/css', express.static(path.join(staticRoot, 'css'), { index: false }));

  // index.html for any other GET, without the GitHub Pages meta CSP (the header applies here)
  app.get('*', (req, res) => {
    const html = fs.readFileSync(path.join(staticRoot, 'index.html'), 'utf8');
    res.type('html').send(html.replace(META_CSP, ''));
  });

  return app;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function startServer(port, electronApp) {
  _electronApp = electronApp || null;
  _appOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  const staticRoot = path.join(__dirname, '..');
  const app = _buildApp(staticRoot);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`FiavaionDictate server listening on http://localhost:${server.address().port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, ollamaOrigin: _ollamaOrigin };
