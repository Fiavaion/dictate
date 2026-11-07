/**
 * Format Cards Modal
 * Displays multi-format AI results as a responsive card grid.
 * Each card shows a formatted output with its own copy button.
 */


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
    this._results = {};
    this._activeFormats.clear();

    // Build and attach the modal DOM
    this._el = this._createOverlay();
    document.body.appendChild(this._el);
    this._el.querySelector('.fmt-close')?.focus();

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
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fmtTitle');

    // Header
    const header = document.createElement('div');
    header.className = 'folder-modal-header';
    header.innerHTML = `
      <span class="folder-modal-title" id="fmtTitle">FORMAT FOR...</span>
      <button class="folder-modal-close fmt-close" aria-label="Close">&times;</button>
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
}
