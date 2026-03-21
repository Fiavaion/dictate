/**
 * Search Results Modal — displays cross-session search results
 *
 * Provides a modal with search input, toggle between text/semantic modes,
 * and a results list with highlighted match context. Clicking a result
 * loads that session via the onSessionSelect callback.
 *
 * Uses the project's .folder-modal-overlay / .folder-modal CSS classes
 * for consistent dark theme styling.
 *
 * Usage:
 *   import { SearchResultsModal } from './search-results.js';
 *   const modal = new SearchResultsModal(sessionSearch);
 *   modal.onSessionSelect = (sessionId) => loadSession(sessionId);
 *   modal.open();
 */

export class SearchResultsModal {
  /**
   * @param {import('../utils/session-search.js').SessionSearch} sessionSearch
   */
  constructor(sessionSearch) {
    this.search = sessionSearch;
    this._el = null;
    this._abortController = null;
    /** Callback when user clicks a result: (sessionId) => void */
    this.onSessionSelect = null;
    this._stylesInjected = false;
    this._mode = 'text'; // 'text' | 'semantic'
    this._debounceTimer = null;
  }

  /**
   * Open the search modal with an optional initial query.
   * @param {string} [query='']
   */
  open(query = '') {
    if (!this._el) this.render();
    this._injectStyles();
    this._el.style.display = 'flex';

    const input = this._el.querySelector('.search-modal-input');
    if (input) {
      input.value = query;
      input.focus();
      if (query) this._doSearch(query, this._mode);
    }
  }

  /**
   * Close the modal and abort any pending search.
   */
  close() {
    if (this._el) this._el.style.display = 'none';
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    clearTimeout(this._debounceTimer);
  }

  /**
   * Build the modal DOM and attach to document.body.
   */
  render() {
    if (this._el) this._el.remove();

    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay';
    overlay.style.display = 'none';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    overlay.innerHTML = `
      <div class="folder-modal" style="max-width:580px;min-height:420px">
        <div class="folder-modal-header">
          <span class="folder-modal-title" style="color:var(--ai-glow)">SEARCH SESSIONS</span>
          <button class="folder-modal-close search-modal-close">&times;</button>
        </div>

        <div class="search-modal-controls">
          <input class="search-modal-input" type="text" placeholder="Search across all sessions..." spellcheck="false" autocomplete="off">
          <div class="search-mode-toggle">
            <button class="search-mode-btn active" data-mode="text">TEXT</button>
            <button class="search-mode-btn" data-mode="semantic">AI SEMANTIC</button>
          </div>
        </div>

        <div class="search-modal-status"></div>

        <div class="search-modal-results folder-modal-list">
          <div class="search-empty-state">
            Type a query to search across all saved sessions
          </div>
        </div>

        <div class="folder-modal-footer">
          <button class="btn-secondary search-modal-close-btn">CLOSE</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._el = overlay;

    // Wire up event handlers
    this._el.querySelectorAll('.search-modal-close, .search-modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Search input — debounced
    const input = this._el.querySelector('.search-modal-input');
    input.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._doSearch(input.value.trim(), this._mode);
      }, 250);
    });

    // Enter key triggers immediate search
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this._debounceTimer);
        this._doSearch(input.value.trim(), this._mode);
      }
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // Mode toggle
    this._el.querySelectorAll('.search-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        this._el.querySelectorAll('.search-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Re-run search with new mode
        const query = input.value.trim();
        if (query) this._doSearch(query, this._mode);
      });
    });
  }

  /**
   * Execute search and render results.
   * @param {string} query
   * @param {'text'|'semantic'} mode
   */
  async _doSearch(query, mode) {
    if (!query) {
      this._renderEmpty('Type a query to search across all saved sessions');
      this._setStatus('');
      return;
    }

    // Abort any previous search
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();

    const resultsEl = this._el.querySelector('.search-modal-results');

    if (mode === 'text') {
      this._setStatus('Searching...');
      const results = this.search.textSearch(query);
      this._renderResults(results, query);
      this._setStatus(results.length > 0
        ? `${results.length} session${results.length !== 1 ? 's' : ''} found`
        : '');
    } else {
      // Semantic search
      this._setStatus('AI is searching...');
      resultsEl.innerHTML = '<div class="search-loading">Querying AI model...</div>';

      try {
        const results = await this.search.semanticSearch(
          query,
          this._abortController.signal,
        );
        this._renderResults(results, query);
        this._setStatus(results.length > 0
          ? `${results.length} session${results.length !== 1 ? 's' : ''} found (AI)`
          : '');
      } catch (err) {
        if (err.name === 'AbortError') return;
        this._renderEmpty('Semantic search failed. Is the AI connected?');
        this._setStatus('Search failed');
      }
    }
  }

  /**
   * Render the results list.
   * @param {import('../utils/session-search.js').SearchResult[]} results
   * @param {string} query
   */
  _renderResults(results, query) {
    const container = this._el.querySelector('.search-modal-results');

    if (results.length === 0) {
      this._renderEmpty(`No sessions match "${query}"`);
      return;
    }

    container.innerHTML = results.map((result) => {
      const { meta, matches } = result;
      const date = meta.createdAt
        ? new Date(meta.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      const project = meta.project ? `<span class="search-result-project">${this._escHtml(meta.project)}</span>` : '';
      const wordCount = meta.wordCount ? `${meta.wordCount} words` : '';

      const matchesHtml = matches.slice(0, 3).map(m =>
        `<div class="search-result-match">${this._highlightMatch(m.context, m.matchStart, m.matchEnd)}</div>`
      ).join('');

      return `
        <div class="search-result-item" data-session-id="${this._escHtml(meta.id)}">
          <div class="search-result-header">
            <span class="search-result-title">${this._escHtml(meta.title || 'Untitled')}</span>
            ${project}
          </div>
          <div class="search-result-meta">
            ${date}${date && wordCount ? ' \u00b7 ' : ''}${wordCount}
          </div>
          ${matchesHtml}
        </div>
      `;
    }).join('');

    // Click handler for results
    container.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = item.dataset.sessionId;
        if (sessionId && this.onSessionSelect) {
          this.onSessionSelect(sessionId);
          this.close();
        }
      });
    });
  }

  /**
   * Show an empty state message.
   * @param {string} message
   */
  _renderEmpty(message) {
    const container = this._el.querySelector('.search-modal-results');
    container.innerHTML = `<div class="search-empty-state">${this._escHtml(message)}</div>`;
  }

  /**
   * Update the status line.
   * @param {string} text
   */
  _setStatus(text) {
    const el = this._el.querySelector('.search-modal-status');
    if (el) el.textContent = text;
  }

  /**
   * Highlight a match within its context string.
   * @param {string} context
   * @param {number} matchStart
   * @param {number} matchEnd
   * @returns {string} — HTML with highlighted span
   */
  _highlightMatch(context, matchStart, matchEnd) {
    if (matchStart === 0 && matchEnd === 0) {
      // Semantic search result — no specific highlight position
      return this._escHtml(context);
    }

    const before = this._escHtml(context.slice(0, matchStart));
    const match = this._escHtml(context.slice(matchStart, matchEnd));
    const after = this._escHtml(context.slice(matchEnd));

    return `${before}<mark class="search-highlight">${match}</mark>${after}`;
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Inject scoped styles for the search modal.
   */
  _injectStyles() {
    if (this._stylesInjected) return;
    if (document.getElementById('search-results-styles')) {
      this._stylesInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'search-results-styles';
    style.textContent = `
      /* ── Search Modal Controls ── */
      .search-modal-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .search-modal-input {
        flex: 1;
        padding: 8px 12px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text);
        font-family: var(--mono);
        font-size: 0.8rem;
        outline: none;
        transition: border-color 0.2s;
      }
      .search-modal-input:focus {
        border-color: var(--ai-glow);
      }
      .search-modal-input::placeholder {
        color: var(--dim);
        font-size: 0.72rem;
      }
      .search-mode-toggle {
        display: flex;
        gap: 0;
        flex-shrink: 0;
      }
      .search-mode-btn {
        padding: 7px 10px;
        background: none;
        border: 1px solid var(--border);
        color: var(--dim);
        font-family: var(--mono);
        font-size: 0.58rem;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: all 0.15s;
      }
      .search-mode-btn:first-child {
        border-radius: 4px 0 0 4px;
      }
      .search-mode-btn:last-child {
        border-radius: 0 4px 4px 0;
        border-left: none;
      }
      .search-mode-btn:hover {
        color: var(--text);
        border-color: var(--muted);
      }
      .search-mode-btn.active {
        color: var(--ai-glow);
        border-color: var(--ai-glow);
        background: color-mix(in srgb, var(--ai-glow) 10%, transparent);
      }

      /* ── Status line ── */
      .search-modal-status {
        font-family: var(--mono);
        font-size: 0.58rem;
        letter-spacing: 0.1em;
        color: var(--dim);
        padding: 4px 16px;
        min-height: 20px;
      }

      /* ── Results ── */
      .search-modal-results {
        max-height: 340px;
      }
      .search-result-item {
        padding: 10px 16px;
        cursor: pointer;
        transition: background 0.12s;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
      }
      .search-result-item:hover {
        background: color-mix(in srgb, var(--ai-glow) 6%, var(--panel));
      }
      .search-result-item:last-child {
        border-bottom: none;
      }
      .search-result-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 3px;
      }
      .search-result-title {
        font-family: var(--mono);
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--text);
      }
      .search-result-project {
        font-family: var(--mono);
        font-size: 0.55rem;
        letter-spacing: 0.08em;
        color: var(--accent2);
        background: color-mix(in srgb, var(--accent2) 12%, transparent);
        padding: 1px 6px;
        border-radius: 3px;
      }
      .search-result-meta {
        font-family: var(--mono);
        font-size: 0.6rem;
        color: var(--dim);
        margin-bottom: 6px;
      }
      .search-result-match {
        font-family: var(--mono);
        font-size: 0.7rem;
        color: var(--muted);
        line-height: 1.5;
        padding: 3px 0;
        word-break: break-word;
      }
      .search-highlight {
        background: color-mix(in srgb, var(--ai-glow) 25%, transparent);
        color: var(--ai-glow);
        border-radius: 2px;
        padding: 0 2px;
      }

      /* ── Empty / loading states ── */
      .search-empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        font-family: var(--body);
        font-size: 0.82rem;
        color: var(--dim);
        font-style: italic;
        text-align: center;
        padding: 24px;
      }
      .search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        font-family: var(--mono);
        font-size: 0.72rem;
        color: var(--ai-glow);
        letter-spacing: 0.1em;
        animation: searchPulse 1.5s ease-in-out infinite;
      }
      @keyframes searchPulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    this._stylesInjected = true;
  }
}
