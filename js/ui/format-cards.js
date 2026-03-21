/**
 * Format Cards Modal
 * Displays multi-format AI results as a responsive card grid.
 * Each card shows a formatted output with its own copy button.
 */

let stylesInjected = false;

export class FormatCardsModal {
  /**
   * @param {import('../ai/multi-formatter.js').MultiFormatter} multiFormatter
   */
  constructor(multiFormatter) {
    this._formatter = multiFormatter;
    this._el = null;
    this._results = {};
    this._activeFormats = new Set();
  }

  /**
   * Open the modal, trigger formatting, and display results as they arrive.
   *
   * @param {string} text     Raw dictation text to format
   * @param {string} model    AI model name
   * @param {object} context  Optional { project, stack }
   */
  async open(text, model, context = {}) {
    this._injectStyles();
    this._results = {};
    this._activeFormats.clear();

    // Build and attach the modal DOM
    this._el = this._createOverlay();
    document.body.appendChild(this._el);

    // Wire formatter callbacks
    this._formatter.onFormatStart = (fmt) => {
      this._activeFormats.add(fmt);
      this._renderCards();
    };
    this._formatter.onFormatDone = (fmt, result) => {
      this._activeFormats.delete(fmt);
      this._results[fmt] = result;
      this._renderCards();
    };
    this._formatter.onError = (fmt, err) => {
      this._activeFormats.delete(fmt);
      this._results[fmt] = {
        format: fmt,
        label: this._formatter.getLabel(fmt),
        output: '',
        error: err.message,
      };
      this._renderCards();
    };
    this._formatter.onAllDone = () => {
      this._activeFormats.clear();
      this._renderCards();
    };

    // Render initial loading state
    this._renderCards();

    // Start formatting
    await this._formatter.formatAll(text, model, null, context);
  }

  /** Close and remove the modal from the DOM. */
  close() {
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
    // Unhook formatter callbacks
    this._formatter.onFormatStart = null;
    this._formatter.onFormatDone = null;
    this._formatter.onAllDone = null;
    this._formatter.onError = null;
  }

  /** Build the overlay element. */
  _createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay fmt-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const modal = document.createElement('div');
    modal.className = 'folder-modal fmt-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'folder-modal-header';
    header.innerHTML = `
      <span class="folder-modal-title">FORMAT FOR...</span>
      <button class="folder-modal-close fmt-close">&times;</button>
    `;
    header.querySelector('.fmt-close').addEventListener('click', () => this.close());

    // Card grid container
    const grid = document.createElement('div');
    grid.className = 'fmt-card-grid';
    grid.id = 'fmtCardGrid';

    modal.appendChild(header);
    modal.appendChild(grid);
    overlay.appendChild(modal);
    return overlay;
  }

  /** Render / update all cards inside the grid. */
  _renderCards() {
    const grid = this._el?.querySelector('#fmtCardGrid');
    if (!grid) return;

    const allFormats = this._formatter.getFormatKeys();
    grid.innerHTML = '';

    for (const fmt of allFormats) {
      const spec = this._formatter.formats[fmt];
      const result = this._results[fmt];
      const isLoading = this._activeFormats.has(fmt);

      const card = document.createElement('div');
      card.className = 'fmt-card' + (isLoading ? ' fmt-card-loading' : '');

      // Card header
      const cardHeader = document.createElement('div');
      cardHeader.className = 'fmt-card-header';
      cardHeader.textContent = spec.label;

      // Card body
      const cardBody = document.createElement('div');
      cardBody.className = 'fmt-card-body';

      if (isLoading) {
        cardBody.innerHTML = '<div class="fmt-spinner"></div>';
      } else if (result?.error) {
        cardBody.innerHTML = `<span class="fmt-error">Error: ${this._escHtml(result.error)}</span>`;
      } else if (result?.output) {
        const pre = document.createElement('pre');
        pre.className = 'fmt-card-text';
        pre.textContent = result.output;
        cardBody.appendChild(pre);
      } else {
        cardBody.innerHTML = '<span class="fmt-waiting">Waiting...</span>';
      }

      // Card footer with copy
      const cardFooter = document.createElement('div');
      cardFooter.className = 'fmt-card-footer';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'fmt-copy-btn';
      copyBtn.textContent = 'COPY';
      copyBtn.disabled = !result?.output;
      copyBtn.addEventListener('click', () => this._copyResult(fmt, copyBtn));
      cardFooter.appendChild(copyBtn);

      card.appendChild(cardHeader);
      card.appendChild(cardBody);
      card.appendChild(cardFooter);
      grid.appendChild(card);
    }
  }

  /** Copy a specific format result to the clipboard. */
  async _copyResult(format, btn) {
    const result = this._results[format];
    if (!result?.output) return;

    try {
      await navigator.clipboard.writeText(result.output);
      btn.textContent = 'COPIED';
      btn.classList.add('fmt-copied');
      setTimeout(() => {
        btn.textContent = 'COPY';
        btn.classList.remove('fmt-copied');
      }, 1500);
    } catch {
      // Fallback: textarea select-copy
      const ta = document.createElement('textarea');
      ta.value = result.output;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.textContent = 'COPIED';
      setTimeout(() => { btn.textContent = 'COPY'; }, 1500);
    }
  }

  /** Escape HTML entities. */
  _escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Inject modal-specific styles once. */
  _injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const css = document.createElement('style');
    css.textContent = `
/* Format Cards Modal */
.fmt-modal {
  width: 900px;
  max-width: 94vw;
  max-height: 85vh;
}
.fmt-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  max-height: calc(85vh - 60px);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.fmt-card-grid::-webkit-scrollbar { width: 4px; }
.fmt-card-grid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.fmt-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s;
}
.fmt-card:hover {
  border-color: var(--muted);
}
.fmt-card-loading {
  border-color: color-mix(in srgb, var(--ai-glow) 40%, var(--border));
}
.fmt-card-header {
  font-family: var(--mono);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ai-glow);
  padding: 10px 12px 6px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.fmt-card-body {
  flex: 1;
  padding: 10px 12px;
  min-height: 80px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.fmt-card-body::-webkit-scrollbar { width: 3px; }
.fmt-card-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.fmt-card-text {
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.fmt-card-footer {
  padding: 6px 12px 8px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}
.fmt-copy-btn {
  font-family: var(--mono);
  font-size: 0.55rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border);
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}
.fmt-copy-btn:hover:not(:disabled) {
  color: var(--accent2);
  border-color: var(--accent2);
}
.fmt-copy-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.fmt-copied {
  color: var(--success) !important;
  border-color: var(--success) !important;
}
.fmt-error {
  font-family: var(--mono);
  font-size: 0.68rem;
  color: var(--danger);
}
.fmt-waiting {
  font-family: var(--body);
  font-size: 0.75rem;
  color: var(--dim);
  font-style: italic;
}

/* Loading spinner */
.fmt-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--ai-glow);
  border-radius: 50%;
  animation: fmtSpin 0.7s linear infinite;
  margin: 20px auto;
}
@keyframes fmtSpin {
  to { transform: rotate(360deg); }
}

/* Responsive: single column on narrow screens */
@media (max-width: 640px) {
  .fmt-card-grid {
    grid-template-columns: 1fr;
  }
  .fmt-modal {
    max-width: 98vw;
  }
}
    `;
    document.head.appendChild(css);
  }
}
