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
    this._mode = 'text'; // 'text' | 'semantic'
    this._debounceTimer = null;
  }

  /**
   * Open the search modal with an optional initial query.
   * @param {string} [query='']
   */
  open(query = '') {
    if (!this._el) this.render();
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
      <div class="folder-modal search-modal">
        <div class="folder-modal-header">
          <span class="folder-modal-title title-ai">SEARCH SESSIONS</span>
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
}
