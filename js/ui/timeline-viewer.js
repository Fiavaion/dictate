/**
 * Timeline Viewer — interactive SVG timeline visualization
 * with scrub, playback, and export controls.
 * Renders as a collapsible panel below the transcript panes.
 */

const EVENT_COLORS = {
  'stt-final':        'var(--success)',       // green
  'stt-interim':      'var(--success)',
  'command':          'var(--accent2)',        // blue/cyan
  'correction':       'var(--ai-glow)',        // purple
  'structure':        'var(--warning)',         // orange
  'template-change':  'var(--warning)',
  'ghost-accept':     'var(--accent)',          // lime
  'ghost-dismiss':    'var(--dim)',
  'copy':             'var(--muted)',
  'clear':            'var(--danger)',
  'pause':            'var(--dim)',
  'resume':           'var(--dim)',
  'session-start':    'var(--accent)',
};

const PLAYBACK_SPEEDS = [1, 2, 4];

export class TimelineViewer {
  constructor(timeline) {
    this.timeline = timeline;
    this._el = null;
    this._svg = null;
    this._playing = false;
    this._playbackTimer = null;
    this._playbackSpeed = 1;
    this._scrubPosition = 0;   // ms offset from session start
    this._dragging = false;

    /** @type {function(number)|null} Called when user scrubs — receives absolute timestamp */
    this.onScrub = null;
    /** @type {function()|null} Called when export button is clicked */
    this.onExport = null;

  }

  /**
   * Build and mount the timeline panel into a container element.
   * @param {string} containerId  ID of the parent element
   */
  render(containerId) {

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`TimelineViewer: container #${containerId} not found`);
      return;
    }

    this._el = document.createElement('div');
    this._el.className = 'tl-panel tl-closed';
    this._el.innerHTML = `
      <div class="tl-controls">
        <button class="tl-btn tl-play-btn" title="Play/Pause">
          <svg class="tl-icon" viewBox="0 0 16 16" fill="currentColor">
            <path class="tl-play-icon" d="M4 2l10 6-10 6z"/>
            <path class="tl-pause-icon" d="M3 1h3v14H3zm7 0h3v14h-3z"/>
          </svg>
        </button>
        <button class="tl-btn tl-speed-btn" title="Playback speed">1x</button>
        <span class="tl-time">
          <span class="tl-time-current">0:00</span>
          <span class="tl-time-sep">/</span>
          <span class="tl-time-total">0:00</span>
        </span>
        <div class="tl-spacer"></div>
        <button class="tl-btn tl-export-btn" title="Export timeline as markdown">Export</button>
      </div>
      <div class="tl-track-wrap">
        <svg class="tl-svg" preserveAspectRatio="none"></svg>
        <div class="tl-scrub-handle" title="Drag to scrub"></div>
      </div>
      <div class="tl-legend">
        <span class="tl-legend-item"><span class="tl-dot tl-dot-speech"></span>Speech</span>
        <span class="tl-legend-item"><span class="tl-dot tl-dot-command"></span>Command</span>
        <span class="tl-legend-item"><span class="tl-dot tl-dot-correction"></span>Correction</span>
        <span class="tl-legend-item"><span class="tl-dot tl-dot-structure"></span>Structure</span>
      </div>
    `;

    container.appendChild(this._el);

    this._svg = this._el.querySelector('.tl-svg');
    this._updatePlayPauseIcon();
    this._bindEvents();
    this.update();
  }

  /**
   * Refresh the SVG timeline visualization with current events.
   */
  update() {
    if (!this._svg) return;
    this._renderTimeline();
    this._updateTimeDisplay();
  }

  // ──────────────────────────────────────────
  // Playback
  // ──────────────────────────────────────────

  play(speed) {
    if (speed != null) this._playbackSpeed = speed;
    this._playing = true;
    this._updatePlayPauseIcon();

    const stepMs = 50;
    const advance = stepMs * this._playbackSpeed;

    this._playbackTimer = setInterval(() => {
      const duration = this.timeline.getDuration();
      this._scrubPosition = Math.min(this._scrubPosition + advance, duration);
      this._updateScrubHandle();
      this._updateTimeDisplay();
      this.onScrub?.(this.timeline.sessionStart + this._scrubPosition);

      if (this._scrubPosition >= duration) {
        this.pause();
      }
    }, stepMs);
  }

  pause() {
    this._playing = false;
    clearInterval(this._playbackTimer);
    this._playbackTimer = null;
    this._updatePlayPauseIcon();
  }

  scrubTo(ms) {
    this._scrubPosition = Math.max(0, Math.min(ms, this.timeline.getDuration()));
    this._updateScrubHandle();
    this._updateTimeDisplay();
    this.onScrub?.(this.timeline.sessionStart + this._scrubPosition);
  }

  // ──────────────────────────────────────────
  // Panel visibility
  // ──────────────────────────────────────────

  open() {
    if (!this._el) return;
    this._el.classList.remove('tl-closed');
    this.update();
  }

  close() {
    if (!this._el) return;
    this._el.classList.add('tl-closed');
    this.pause();
  }

  toggle() {
    if (!this._el) return;
    this._el.classList.contains('tl-closed') ? this.open() : this.close();
  }

  // ──────────────────────────────────────────
  // SVG rendering
  // ──────────────────────────────────────────

  _renderTimeline() {
    const svg = this._svg;
    const events = this.timeline.events;
    const duration = this.timeline.getDuration() || 1;
    const rect = svg.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 32;

    // Clear
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // Track background line
    const trackY = h / 2;
    const track = this._svgEl('line', {
      x1: 0, y1: trackY, x2: w, y2: trackY,
      stroke: 'var(--border)', 'stroke-width': 2,
    });
    svg.appendChild(track);

    // Event markers
    for (const evt of events) {
      if (evt.type === 'stt-interim') continue; // skip noisy interims
      const offset = evt.timestamp - this.timeline.sessionStart;
      const x = (offset / duration) * w;
      const color = EVENT_COLORS[evt.type] || 'var(--muted)';
      const r = evt.type === 'stt-final' ? 3 : 3.5;

      const circle = this._svgEl('circle', {
        cx: x, cy: trackY, r,
        fill: color,
        opacity: 0.85,
      });
      circle.dataset.type = evt.type;
      circle.dataset.offset = offset;

      // Tooltip on hover
      const title = this._svgEl('title');
      title.textContent = `${this.timeline._formatDuration(offset)} — ${this.timeline._describeEvent(evt) || evt.type}`;
      circle.appendChild(title);

      svg.appendChild(circle);
    }
  }

  _svgEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  _updateScrubHandle() {
    const handle = this._el?.querySelector('.tl-scrub-handle');
    const wrap = this._el?.querySelector('.tl-track-wrap');
    if (!handle || !wrap) return;

    const duration = this.timeline.getDuration() || 1;
    const pct = Math.min(1, this._scrubPosition / duration);
    const wrapW = wrap.offsetWidth;
    handle.style.left = `${pct * wrapW}px`;
  }

  _updateTimeDisplay() {
    if (!this._el) return;
    const cur = this._el.querySelector('.tl-time-current');
    const tot = this._el.querySelector('.tl-time-total');
    if (cur) cur.textContent = this.timeline._formatDuration(this._scrubPosition);
    if (tot) tot.textContent = this.timeline._formatDuration(this.timeline.getDuration());
  }

  _updatePlayPauseIcon() {
    if (!this._el) return;
    const playIcon = this._el.querySelector('.tl-play-icon');
    const pauseIcon = this._el.querySelector('.tl-pause-icon');
    if (playIcon) playIcon.style.display = this._playing ? 'none' : '';
    if (pauseIcon) pauseIcon.style.display = this._playing ? '' : 'none';
  }

  // ──────────────────────────────────────────
  // Event binding
  // ──────────────────────────────────────────

  _bindEvents() {
    if (!this._el) return;

    // Play/Pause
    const playBtn = this._el.querySelector('.tl-play-btn');
    playBtn?.addEventListener('click', () => {
      this._playing ? this.pause() : this.play();
    });

    // Speed toggle
    const speedBtn = this._el.querySelector('.tl-speed-btn');
    speedBtn?.addEventListener('click', () => {
      const idx = PLAYBACK_SPEEDS.indexOf(this._playbackSpeed);
      this._playbackSpeed = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
      speedBtn.textContent = `${this._playbackSpeed}x`;
      if (this._playing) {
        this.pause();
        this.play();
      }
    });

    // Export
    const exportBtn = this._el.querySelector('.tl-export-btn');
    exportBtn?.addEventListener('click', () => {
      if (this.onExport) {
        this.onExport();
      } else {
        // Default: download markdown
        const md = this.timeline.toMarkdown();
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-timeline-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });

    // Scrub by clicking on the track
    const trackWrap = this._el.querySelector('.tl-track-wrap');
    trackWrap?.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._scrubFromMouseEvent(e);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      this._scrubFromMouseEvent(e);
    });
    document.addEventListener('mouseup', () => {
      this._dragging = false;
    });
  }

  _scrubFromMouseEvent(e) {
    const wrap = this._el?.querySelector('.tl-track-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const duration = this.timeline.getDuration() || 1;
    this.scrubTo(pct * duration);
  }
}
