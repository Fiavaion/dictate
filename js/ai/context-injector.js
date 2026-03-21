/**
 * Context Injector — Project-Aware Smart Context
 * When a project is selected, scans its file structure via the server API,
 * extracts key entity names (components, routes, functions), and provides
 * a context string for injection into AI prompts (correction + structuring).
 *
 * ── Required Server Endpoint (NOT YET IMPLEMENTED) ──────────────────────
 *
 *   GET /api/projects/{name}/scan
 *
 *   Walks the project directory (max depth 4), collects file paths excluding
 *   common noise directories (node_modules, .git, dist, build, __pycache__,
 *   .next, .nuxt, .svelte-kit, venv, .venv, .tox, target, out, coverage).
 *
 *   Response: {
 *     name:  string,          // project folder name
 *     stack: string,          // detected tech stack (from detect_stack())
 *     files: string[]         // flat list of relative file paths
 *   }
 *
 *   Should reuse the existing detect_stack() helper in server.py.
 *   Implementation belongs in server.py Handler.do_GET, matching path
 *   pattern /api/projects/<name>/scan.
 *
 * ────────────────────────────────────────────────────────────────────────
 */

/** Directories to exclude from file tree scanning (server-side, documented here) */
const EXCLUDED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', '.nuxt', '.svelte-kit', 'venv', '.venv', '.tox',
  'target', 'out', 'coverage',
];

/** Filenames too generic to be useful as entity names */
const SKIP_NAMES = new Set([
  'index', 'main', 'app', 'utils', 'helpers', 'types', 'constants',
  'config', 'test', 'spec', '__init__', 'setup', 'mod', 'lib',
  'package', 'tsconfig', 'vite.config', 'webpack.config', 'jest.config',
  'tailwind.config', 'postcss.config', 'babel.config',
]);

/** File extensions worth surfacing as key files */
const KEY_FILE_PATTERNS = [
  /\.tsx?$/, /\.jsx?$/, /\.py$/, /\.rs$/, /\.go$/,
  /\.java$/, /\.svelte$/, /\.vue$/, /\.astro$/,
];

/** Path segments that should be excluded from key files */
const SKIP_FILE_PATTERNS = [
  /node_modules/, /\.test\./, /\.spec\./, /\.stories\./,
  /dist\//, /build\//, /coverage\//, /__pycache__/,
];

export class ContextInjector {
  constructor() {
    /** @type {object|null} Cached scan result for current project */
    this.projectContext = null;

    /** @type {string[]} Flat list of relative file paths */
    this.fileTree = [];

    /** @type {{ name: string, type: string, path: string }[]} Extracted entities */
    this.keyEntities = [];

    /** @type {Object<string, { context: object, timestamp: number }>} */
    this._cache = {};

    /** Cache entries expire after 5 minutes */
    this._cacheMaxAge = 5 * 60 * 1000;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Scan a project via the server API and populate context.
   * Results are cached for 5 minutes per project.
   * @param {string} projectName - folder name as returned by /api/projects
   * @returns {object|null} scan result or null on failure
   */
  async scanProject(projectName) {
    if (!projectName) return null;

    // Check cache first
    const cached = this._cache[projectName];
    if (cached && (Date.now() - cached.timestamp) < this._cacheMaxAge) {
      this.projectContext = cached.context;
      this.fileTree = cached.context.files || [];
      this._extractEntities();
      return this.projectContext;
    }

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/scan`);
      if (!res.ok) return null;

      this.projectContext = await res.json();
      this.fileTree = this.projectContext.files || [];
      this._extractEntities();

      // Cache the result
      this._cache[projectName] = {
        context: this.projectContext,
        timestamp: Date.now(),
      };

      return this.projectContext;
    } catch {
      return null;
    }
  }

  /**
   * Build a concise context block string for injection into AI prompts.
   * Returns empty string if no project is scanned.
   * @returns {string}
   */
  getContextBlock() {
    if (!this.projectContext) return '';

    const parts = [];

    // Tech stack line
    if (this.projectContext.stack) {
      parts.push(`Tech stack: ${this.projectContext.stack}`);
    }

    // Grouped entity names (capped at 15 per type)
    if (this.keyEntities.length > 0) {
      const grouped = this._groupEntities();
      for (const [type, names] of Object.entries(grouped)) {
        if (names.length > 0) {
          const display = names.slice(0, 15).join(', ');
          const suffix = names.length > 15 ? '...' : '';
          parts.push(`${type}: ${display}${suffix}`);
        }
      }
    }

    // Key source files (capped at 20)
    if (this.fileTree.length > 0) {
      const keyFiles = this.fileTree
        .filter(f => this._isKeyFile(f))
        .slice(0, 20);
      if (keyFiles.length > 0) {
        parts.push(`Key files: ${keyFiles.join(', ')}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Fuzzy-match a spoken name to a known entity in the project.
   * Handles speech-to-text quirks like missing camelCase boundaries.
   * @param {string} spokenName - raw spoken text to match
   * @returns {{ name: string, type: string, path: string }|null}
   */
  matchEntity(spokenName) {
    if (!spokenName || this.keyEntities.length === 0) return null;

    const spoken = spokenName.toLowerCase().replace(/\s+/g, '');

    // Exact match (case-insensitive, whitespace-collapsed)
    let match = this.keyEntities.find(
      e => e.name.toLowerCase().replace(/[-_]/g, '') === spoken
    );
    if (match) return match;

    // Entity name contains spoken text
    match = this.keyEntities.find(
      e => e.name.toLowerCase().replace(/[-_]/g, '').includes(spoken)
    );
    if (match) return match;

    // Spoken text contains entity name (partial spoken match)
    match = this.keyEntities.find(
      e => spoken.includes(e.name.toLowerCase().replace(/[-_]/g, ''))
    );
    return match || null;
  }

  /**
   * Invalidate a specific project's cache entry.
   * @param {string} projectName
   */
  invalidateCache(projectName) {
    delete this._cache[projectName];
  }

  /**
   * Clear all context state and cache.
   */
  clear() {
    this.projectContext = null;
    this.fileTree = [];
    this.keyEntities = [];
  }

  /**
   * Clear everything including the cache.
   */
  clearAll() {
    this.clear();
    this._cache = {};
  }

  // ── Internal Helpers ────────────────────────────────────────────────

  /**
   * Extract entity names from file paths in the tree.
   * Populates this.keyEntities with { name, type, path } objects.
   */
  _extractEntities() {
    this.keyEntities = [];

    for (const filepath of this.fileTree) {
      const name = this._extractName(filepath);
      if (!name) continue;

      const type = this._classifyFile(filepath);
      this.keyEntities.push({ name, type, path: filepath });
    }
  }

  /**
   * Extract a meaningful name from a file path.
   * Strips extension and skips generic/config filenames.
   * @param {string} filepath - relative path like "src/components/Button.tsx"
   * @returns {string|null}
   */
  _extractName(filepath) {
    const parts = filepath.split('/');
    const filename = parts[parts.length - 1];
    const name = filename.replace(/\.[^.]+$/, '');

    if (SKIP_NAMES.has(name.toLowerCase())) return null;

    // Skip dotfiles and very short names
    if (name.startsWith('.') || name.length < 2) return null;

    return name;
  }

  /**
   * Classify a file into a category based on its path segments.
   * @param {string} filepath
   * @returns {string}
   */
  _classifyFile(filepath) {
    const lower = filepath.toLowerCase();

    if (lower.includes('/component') || lower.includes('/views') || lower.includes('/pages'))
      return 'Components';
    if (lower.includes('/route') || lower.includes('/api/'))
      return 'Routes';
    if (lower.includes('/model') || lower.includes('/schema') || lower.includes('/entity'))
      return 'Models';
    if (lower.includes('/service') || lower.includes('/controller'))
      return 'Services';
    if (lower.includes('/hook') || lower.includes('/composable'))
      return 'Hooks';
    if (lower.includes('/store') || lower.includes('/state') || lower.includes('/reducer'))
      return 'State';
    if (lower.includes('/test') || lower.includes('/spec') || lower.includes('__test__'))
      return 'Tests';
    if (lower.includes('/util') || lower.includes('/helper') || lower.includes('/lib'))
      return 'Utilities';
    if (lower.includes('/middleware'))
      return 'Middleware';

    return 'Files';
  }

  /**
   * Determine whether a file path represents a key source file
   * (worth surfacing in the context block).
   * @param {string} filepath
   * @returns {boolean}
   */
  _isKeyFile(filepath) {
    const matchesExt = KEY_FILE_PATTERNS.some(p => p.test(filepath));
    const isExcluded = SKIP_FILE_PATTERNS.some(p => p.test(filepath));
    return matchesExt && !isExcluded;
  }

  /**
   * Group keyEntities by their type for display.
   * @returns {Object<string, string[]>}
   */
  _groupEntities() {
    const grouped = {};
    for (const entity of this.keyEntities) {
      if (!grouped[entity.type]) grouped[entity.type] = [];
      grouped[entity.type].push(entity.name);
    }
    return grouped;
  }
}
