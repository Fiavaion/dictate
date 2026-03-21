/**
 * Developer Vocabulary Manager — expanded for Claude Code prompt engineering
 */

const DEV_PRESET = [
  // JS/TS errors & concepts
  'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
  'undefined', 'NaN', 'null', 'async', 'await', 'Promise',
  'callback', 'closure', 'prototype', 'useState', 'useEffect',
  'TypeScript', 'interface', 'generic', 'ESM', 'CommonJS',
  // HTTP & networking
  '404', '500', '401', '403', '200', '201',
  'CORS', 'fetch', 'WebSocket', 'endpoint', 'payload',
  'request', 'response', 'header', 'token', 'auth', 'API',
  'REST', 'GraphQL', 'middleware', 'route', 'handler',
  // Build & tools
  'Vite', 'webpack', 'Tailwind', 'PostCSS', 'npm', 'node',
  'ESLint', 'Docker', 'git', 'commit', 'branch', 'merge',
  // Claude Code specific
  'Claude Code', 'Claude', 'Anthropic', 'MCP', 'VS Code',
  'context window', 'system prompt', 'tool use', 'artifact',
  'slash command', 'CLAUDE.md', 'plan mode',
  // DB
  'SQL', 'SQLite', 'PostgreSQL', 'MongoDB', 'Redis',
  'migration', 'schema', 'query', 'transaction', 'ORM',
  // Frameworks
  'React', 'Next.js', 'Node.js', 'Express', 'Astro',
  'Electron', 'FastAPI', 'Flask', 'Django',
  // Bug-reporting
  'regression', 'race condition', 'memory leak', 'stack overflow',
  'infinite loop', 'deadlock', 'segfault', 'buffer overflow',
  // Prompt engineering
  'refactor', 'implement', 'debug', 'optimize', 'scaffold',
  'acceptance criteria', 'edge case', 'unit test', 'integration test',
];

const STORAGE_KEY = 'fiavaion-dictate-vocab';

export class VocabularyManager {
  constructor() {
    this._custom = this._load();
  }

  get allHints() {
    return [...new Set([...DEV_PRESET, ...this._custom])];
  }

  add(term) {
    if (!this._custom.includes(term)) {
      this._custom.push(term);
      this._save();
    }
  }

  remove(term) {
    this._custom = this._custom.filter(t => t !== term);
    this._save();
  }

  get customTerms() { return [...this._custom]; }

  _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._custom));
  }
}
