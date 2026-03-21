/**
 * Confidence Heatmap — color-codes raw transcript by STT confidence
 *
 * Low-confidence words glow warm (amber/red), high-confidence words
 * have no highlight. Clicking low-confidence words shows a dropdown
 * of STT alternatives (when available from the speech engine).
 *
 * Usage:
 *   import { ConfidenceHeatmap } from './confidence-heatmap.js';
 *   const heatmap = new ConfidenceHeatmap();
 *   heatmap.toggle(); // enable
 *   heatmap.addSegment(text, confidence, alternatives);
 *   rawContent.innerHTML = heatmap.renderHtml() || rawContent.textContent;
 */

export class ConfidenceHeatmap {
  constructor() {
    /** @type {{ text: string, confidence: number, alternatives: string[], startIdx: number, endIdx: number }[]} */
    this.segments = [];
    this.enabled = false;
    /** Callback fired when user picks an alternative: (segmentIdx, newWord) => void */
    this.onWordOverride = null;
    this._stylesInjected = false;
  }

  /**
   * Add a new utterance segment with its confidence score and alternatives.
   * Called from the onFinal callback of WebSpeechEngine.
   * @param {string} text       — the final transcript text
   * @param {number} confidence — 0..1 confidence from the STT engine
   * @param {string[]} alternatives — alternative transcriptions (if maxAlternatives > 1)
   */
  addSegment(text, confidence, alternatives = []) {
    const currentLen = this._fullText().length;
    this.segments.push({
      text,
      confidence: confidence || 0,
      alternatives: alternatives || [],
      startIdx: currentLen,
      endIdx: currentLen + text.length,
    });
  }

  /**
   * Generate HTML with confidence-colored spans.
   * Returns an HTML string to insert into the raw transcript pane,
   * or null if the heatmap is disabled or there are no segments.
   * @returns {string|null}
   */
  renderHtml() {
    if (!this.enabled || this.segments.length === 0) return null;

    this._injectStyles();

    return this.segments.map((seg, idx) => {
      const cls = this._confidenceClass(seg.confidence);
      const hasAlts = seg.alternatives.length > 0;
      const altAttr = hasAlts
        ? ` data-alts="${this._escHtml(JSON.stringify(seg.alternatives))}"`
        : '';
      const clickable = (hasAlts || seg.confidence < 0.6) ? ' confidence-clickable' : '';
      const title = `Confidence: ${(seg.confidence * 100).toFixed(0)}%`;

      return `<span class="confidence-word ${cls}${clickable}" data-seg="${idx}" data-conf="${seg.confidence.toFixed(2)}" title="${title}"${altAttr}>${this._escHtml(seg.text)}</span>`;
    }).join(' ');
  }

  /**
   * Attach click listeners to a container for alternative selection.
   * Call after inserting renderHtml() into the DOM.
   * @param {HTMLElement} container — the element holding the rendered spans
   */
  attachClickHandlers(container) {
    if (!container) return;

    container.addEventListener('click', (e) => {
      const wordEl = e.target.closest('.confidence-clickable');
      if (!wordEl) return;

      const segIdx = parseInt(wordEl.dataset.seg, 10);
      if (isNaN(segIdx)) return;

      this.showAlternatives(segIdx, wordEl);
    });
  }

  /**
   * Show alternatives dropdown for a given segment.
   * @param {number} segmentIdx — index into this.segments
   * @param {HTMLElement} anchorEl — the DOM element to position near
   */
  showAlternatives(segmentIdx, anchorEl) {
    const seg = this.segments[segmentIdx];
    if (!seg) return;

    // If no alternatives, show a tooltip indicating low confidence but nothing to pick
    if (seg.alternatives.length === 0) {
      this._showNoAltsTooltip(anchorEl, seg.confidence);
      return;
    }

    // Remove any existing dropdown
    this.hideAlternatives();

    const dropdown = document.createElement('div');
    dropdown.className = 'word-alternatives';

    // Header showing current word + confidence
    const header = document.createElement('div');
    header.className = 'word-alternatives-header';
    header.textContent = `${(seg.confidence * 100).toFixed(0)}% confidence`;
    dropdown.appendChild(header);

    // Alternative buttons
    seg.alternatives.forEach((alt, i) => {
      const btn = document.createElement('button');
      btn.className = 'alt-option';
      btn.dataset.seg = String(segmentIdx);
      btn.dataset.alt = String(i);
      btn.textContent = alt;
      dropdown.appendChild(btn);
    });

    // Position near the clicked word
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.zIndex = '600';

    // Ensure dropdown doesn't go off-screen
    requestAnimationFrame(() => {
      const dRect = dropdown.getBoundingClientRect();
      if (dRect.right > window.innerWidth - 8) {
        dropdown.style.left = (window.innerWidth - dRect.width - 8) + 'px';
      }
      if (dRect.bottom > window.innerHeight - 8) {
        dropdown.style.top = (rect.top - dRect.height - 4) + 'px';
      }
    });

    dropdown.addEventListener('click', (e) => {
      const btn = e.target.closest('.alt-option');
      if (!btn) return;

      const altIdx = parseInt(btn.dataset.alt, 10);
      const segIdx = parseInt(btn.dataset.seg, 10);
      const newWord = this.segments[segIdx]?.alternatives[altIdx];

      if (newWord) {
        this.segments[segIdx].text = newWord;
        this.segments[segIdx].confidence = 1;
        this.segments[segIdx].alternatives = [];
        this.onWordOverride?.(segIdx, newWord);
      }
      this.hideAlternatives();
    });

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        this.hideAlternatives();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);

    document.body.appendChild(dropdown);
  }

  /**
   * Remove any visible alternatives dropdown from the DOM.
   */
  hideAlternatives() {
    document.querySelectorAll('.word-alternatives').forEach(el => el.remove());
    document.querySelectorAll('.word-no-alts-tooltip').forEach(el => el.remove());
  }

  /**
   * Clear all segments and remove dropdowns.
   */
  clear() {
    this.segments = [];
    this.hideAlternatives();
  }

  /**
   * Toggle the heatmap on/off. Returns the new enabled state.
   * @returns {boolean}
   */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.hideAlternatives();
    return this.enabled;
  }

  /**
   * Get the average confidence across all segments.
   * @returns {number} 0..1
   */
  averageConfidence() {
    if (this.segments.length === 0) return 0;
    const sum = this.segments.reduce((a, s) => a + s.confidence, 0);
    return sum / this.segments.length;
  }

  /**
   * Get count of low-confidence segments (< 0.6).
   * @returns {number}
   */
  lowConfidenceCount() {
    return this.segments.filter(s => s.confidence < 0.6).length;
  }

  // ── Private helpers ──────────────────────────────

  _fullText() {
    return this.segments.map(s => s.text).join(' ');
  }

  _confidenceClass(confidence) {
    if (confidence < 0.4) return 'confidence-very-low';
    if (confidence < 0.6) return 'confidence-low';
    if (confidence < 0.85) return 'confidence-medium';
    return 'confidence-high';
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _showNoAltsTooltip(anchorEl, confidence) {
    this.hideAlternatives();
    const tip = document.createElement('div');
    tip.className = 'word-no-alts-tooltip';
    tip.textContent = `${(confidence * 100).toFixed(0)}% confidence — no alternatives`;

    const rect = anchorEl.getBoundingClientRect();
    tip.style.position = 'fixed';
    tip.style.top = (rect.bottom + 4) + 'px';
    tip.style.left = rect.left + 'px';
    tip.style.zIndex = '600';

    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 2000);
  }

  /**
   * Inject styles for confidence heatmap + alternatives dropdown.
   * Uses the project's CSS variable design system.
   */
  _injectStyles() {
    if (this._stylesInjected) return;
    if (document.getElementById('confidence-heatmap-styles')) {
      this._stylesInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'confidence-heatmap-styles';
    style.textContent = `
      /* ── Confidence Heatmap Spans ── */
      .confidence-word {
        transition: background 0.2s, box-shadow 0.2s;
        border-radius: 2px;
        padding: 0 1px;
      }
      .confidence-high {
        /* No highlight — text looks normal */
      }
      .confidence-medium {
        background: color-mix(in srgb, var(--warning) 12%, transparent);
        color: color-mix(in srgb, var(--warning) 40%, var(--text));
      }
      .confidence-low {
        background: color-mix(in srgb, var(--warning) 22%, transparent);
        color: var(--warning);
        box-shadow: 0 0 6px color-mix(in srgb, var(--warning) 15%, transparent);
      }
      .confidence-very-low {
        background: color-mix(in srgb, var(--danger) 20%, transparent);
        color: var(--danger);
        box-shadow: 0 0 8px color-mix(in srgb, var(--danger) 20%, transparent);
        text-decoration: underline wavy color-mix(in srgb, var(--danger) 40%, transparent);
        text-underline-offset: 3px;
      }
      .confidence-clickable {
        cursor: pointer;
      }
      .confidence-clickable:hover {
        filter: brightness(1.2);
        box-shadow: 0 0 10px color-mix(in srgb, var(--warning) 30%, transparent);
      }

      /* ── Alternatives Dropdown ── */
      .word-alternatives {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 4px 0;
        min-width: 140px;
        max-width: 280px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        animation: altsFadeIn 0.12s ease-out;
      }
      @keyframes altsFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .word-alternatives-header {
        font-family: var(--mono);
        font-size: 0.55rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--dim);
        padding: 4px 10px 6px;
        border-bottom: 1px solid var(--border);
      }
      .alt-option {
        display: block;
        width: 100%;
        padding: 6px 10px;
        background: none;
        border: none;
        color: var(--text);
        font-family: var(--mono);
        font-size: 0.78rem;
        text-align: left;
        cursor: pointer;
        transition: all 0.12s;
      }
      .alt-option:hover {
        background: var(--elevated);
        color: var(--accent2);
      }

      /* ── No-alts tooltip ── */
      .word-no-alts-tooltip {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 6px 10px;
        font-family: var(--mono);
        font-size: 0.65rem;
        color: var(--dim);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        animation: altsFadeIn 0.12s ease-out;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    this._stylesInjected = true;
  }
}
