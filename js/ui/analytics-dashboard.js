/**
 * Dictation Analytics Dashboard
 * Fullscreen overlay showing dictation statistics visualized with pure SVG charts.
 * No external chart libraries — uses inline SVG with the app's CSS custom properties.
 *
 * Data sources:
 *   - Session index from persistence.js (loadSessionsIndex)
 *   - CorrectionLearner stats (.getStats())
 *   - Runtime stats passed in at open()
 *
 * Usage:
 *   const dashboard = new AnalyticsDashboard();
 *   dashboard.open(sessionsIndex, correctionLearnerStats);
 */

const COLORS = {
  accent:  '#c8ff6a',   // var(--accent)
  accent2: '#6affda',   // var(--accent2)
  aiGlow:  '#9d94ff',   // var(--ai-glow)
  danger:  '#ff5577',   // var(--danger)
  success: '#62ffc0',   // var(--success)
  warning: '#ffdd00',   // var(--warning)
};

const CHART_PALETTE = [
  COLORS.accent,
  COLORS.accent2,
  COLORS.aiGlow,
  COLORS.danger,
  COLORS.success,
  COLORS.warning,
  '#ff8844',
  '#44aaff',
];

export class AnalyticsDashboard {
  constructor() {
    this._el = null;
    this._stylesInjected = false;
  }

  // ───────────────────────────────────
  //  Public API
  // ───────────────────────────────────

  /**
   * Open the analytics dashboard overlay.
   * @param {Array} sessionsIndex — from loadSessionsIndex()
   * @param {Object} [correctionLearnerStats] — from CorrectionLearner.getStats()
   */
  open(sessionsIndex = [], correctionLearnerStats = null) {
    this.close();  // remove any existing instance
    this._injectStyles();

    this._sessionsIndex = sessionsIndex;
    this._learnerStats = correctionLearnerStats;

    this._el = document.createElement('div');
    this._el.className = 'analytics-overlay';
    this._el.addEventListener('click', (e) => {
      if (e.target === this._el) this.close();
    });

    const modal = document.createElement('div');
    modal.className = 'analytics-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'analytics-header';
    header.innerHTML = `
      <span class="analytics-title">ANALYTICS</span>
      <button class="analytics-close">&times;</button>
    `;
    header.querySelector('.analytics-close').addEventListener('click', () => this.close());
    modal.appendChild(header);

    // Scrollable body
    const body = document.createElement('div');
    body.className = 'analytics-body';

    body.appendChild(this._renderSummaryCards(sessionsIndex));
    body.appendChild(this._renderWordsChart(sessionsIndex));
    body.appendChild(this._renderActivityChart(sessionsIndex));
    body.appendChild(this._renderTemplateChart(sessionsIndex));

    if (correctionLearnerStats) {
      body.appendChild(this._renderMishearingsTable(correctionLearnerStats));
    }

    modal.appendChild(body);
    this._el.appendChild(modal);
    document.body.appendChild(this._el);

    // Escape key to close
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Close and remove the dashboard overlay. */
  close() {
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }

  /** @returns {boolean} Whether the dashboard is currently open */
  get isOpen() {
    return !!this._el;
  }

  // ───────────────────────────────────
  //  Summary Cards
  // ───────────────────────────────────

  _renderSummaryCards(sessions) {
    const section = this._section('OVERVIEW');

    const totalSessions = sessions.length;
    const totalWords = sessions.reduce((sum, s) => sum + (s.wordCount || 0), 0);

    // Average session length (words)
    const avgLength = totalSessions > 0
      ? Math.round(totalWords / totalSessions)
      : 0;

    // Most-used template
    const templateCounts = {};
    for (const s of sessions) {
      const t = s.template || 'freeform';
      templateCounts[t] = (templateCounts[t] || 0) + 1;
    }
    const topTemplate = Object.entries(templateCounts)
      .sort((a, b) => b[1] - a[1])[0];
    const mostUsedTemplate = topTemplate ? topTemplate[0] : 'none';

    // Average session duration (based on createdAt/updatedAt)
    let avgDuration = 0;
    if (totalSessions > 0) {
      const durations = sessions
        .filter(s => s.createdAt && s.updatedAt)
        .map(s => s.updatedAt - s.createdAt);
      if (durations.length > 0) {
        avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000);
      }
    }

    const cards = document.createElement('div');
    cards.className = 'analytics-cards';

    cards.appendChild(this._card('Sessions', totalSessions, COLORS.accent));
    cards.appendChild(this._card('Total Words', totalWords.toLocaleString(), COLORS.accent2));
    cards.appendChild(this._card('Avg Words/Session', avgLength, COLORS.aiGlow));
    cards.appendChild(this._card('Avg Duration', avgDuration > 0 ? `${avgDuration}m` : '--', COLORS.success));
    cards.appendChild(this._card('Top Template', mostUsedTemplate, COLORS.warning));

    section.appendChild(cards);
    return section;
  }

  _card(label, value, color) {
    const card = document.createElement('div');
    card.className = 'analytics-card';
    card.innerHTML = `
      <div class="analytics-card-value" style="color: ${color}">${value}</div>
      <div class="analytics-card-label">${label}</div>
    `;
    return card;
  }

  // ───────────────────────────────────
  //  Words per Session — Horizontal Bar Chart
  // ───────────────────────────────────

  _renderWordsChart(sessions) {
    const section = this._section('WORDS PER SESSION');

    // Take last 15 sessions (most recent first in the index, reverse for chronological)
    const recent = sessions.slice(0, 15).reverse();

    if (recent.length === 0) {
      section.appendChild(this._emptyState('No session data yet.'));
      return section;
    }

    const maxWords = Math.max(1, ...recent.map(s => s.wordCount || 0));
    const barHeight = 20;
    const gap = 6;
    const labelWidth = 90;
    const valueWidth = 50;
    const chartWidth = 600;
    const chartContentWidth = chartWidth - labelWidth - valueWidth;
    const svgHeight = recent.length * (barHeight + gap) + gap;

    const svg = this._svg('svg', {
      viewBox: `0 0 ${chartWidth} ${svgHeight}`,
      class: 'analytics-chart-svg',
      preserveAspectRatio: 'xMinYMin meet',
    });

    recent.forEach((session, i) => {
      const y = i * (barHeight + gap) + gap;
      const words = session.wordCount || 0;
      const barW = Math.max(2, (words / maxWords) * chartContentWidth);

      // Session label (truncated title)
      const title = (session.title || 'Untitled').slice(0, 12);
      const label = this._svg('text', {
        x: labelWidth - 6,
        y: y + barHeight / 2 + 4,
        'text-anchor': 'end',
        fill: 'var(--muted)',
        'font-family': 'var(--mono)',
        'font-size': '10',
      });
      label.textContent = title;
      svg.appendChild(label);

      // Background track
      svg.appendChild(this._svg('rect', {
        x: labelWidth,
        y,
        width: chartContentWidth,
        height: barHeight,
        rx: 2,
        fill: 'var(--border)',
        opacity: '0.3',
      }));

      // Bar
      svg.appendChild(this._svg('rect', {
        x: labelWidth,
        y,
        width: barW,
        height: barHeight,
        rx: 2,
        fill: COLORS.accent,
        opacity: '0.85',
      }));

      // Word count value
      const val = this._svg('text', {
        x: labelWidth + chartContentWidth + 8,
        y: y + barHeight / 2 + 4,
        'text-anchor': 'start',
        fill: 'var(--text)',
        'font-family': 'var(--mono)',
        'font-size': '10',
        'font-weight': '600',
      });
      val.textContent = words;
      svg.appendChild(val);
    });

    section.appendChild(svg);
    return section;
  }

  // ───────────────────────────────────
  //  Session Activity — Dot Timeline
  // ───────────────────────────────────

  _renderActivityChart(sessions) {
    const section = this._section('SESSION ACTIVITY');

    if (sessions.length < 2) {
      section.appendChild(this._emptyState('Need at least 2 sessions for activity chart.'));
      return section;
    }

    // Group sessions by day
    const dayMap = {};
    for (const s of sessions) {
      const date = new Date(s.createdAt || s.updatedAt);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (!dayMap[dayKey]) dayMap[dayKey] = { date: dayKey, count: 0, totalWords: 0 };
      dayMap[dayKey].count++;
      dayMap[dayKey].totalWords += (s.wordCount || 0);
    }

    const days = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
    const last30 = days.slice(-30);  // show up to 30 days

    if (last30.length === 0) {
      section.appendChild(this._emptyState('No activity data.'));
      return section;
    }

    const maxCount = Math.max(1, ...last30.map(d => d.count));
    const chartWidth = 600;
    const chartHeight = 100;
    const paddingX = 30;
    const paddingY = 20;
    const plotW = chartWidth - paddingX * 2;
    const plotH = chartHeight - paddingY * 2;

    const svg = this._svg('svg', {
      viewBox: `0 0 ${chartWidth} ${chartHeight}`,
      class: 'analytics-chart-svg',
      preserveAspectRatio: 'xMinYMin meet',
    });

    // Baseline
    svg.appendChild(this._svg('line', {
      x1: paddingX,
      y1: chartHeight - paddingY,
      x2: chartWidth - paddingX,
      y2: chartHeight - paddingY,
      stroke: 'var(--dim)',
      'stroke-width': '1',
      'stroke-dasharray': '3,3',
    }));

    last30.forEach((day, i) => {
      const x = paddingX + (i / Math.max(1, last30.length - 1)) * plotW;
      const dotRadius = 3 + (day.count / maxCount) * 6;  // scale 3-9px

      // Vertical line from baseline to dot
      const dotY = paddingY + plotH - (day.count / maxCount) * plotH;
      svg.appendChild(this._svg('line', {
        x1: x,
        y1: chartHeight - paddingY,
        x2: x,
        y2: dotY,
        stroke: COLORS.accent2,
        'stroke-width': '1',
        opacity: '0.3',
      }));

      // Dot
      svg.appendChild(this._svg('circle', {
        cx: x,
        cy: dotY,
        r: dotRadius,
        fill: COLORS.accent2,
        opacity: '0.8',
      }));

      // Day label (show every few days to avoid overlap)
      if (last30.length <= 10 || i % Math.ceil(last30.length / 8) === 0 || i === last30.length - 1) {
        const shortDate = day.date.slice(5);  // "MM-DD"
        const label = this._svg('text', {
          x,
          y: chartHeight - 3,
          'text-anchor': 'middle',
          fill: 'var(--dim)',
          'font-family': 'var(--mono)',
          'font-size': '8',
        });
        label.textContent = shortDate;
        svg.appendChild(label);
      }
    });

    section.appendChild(svg);
    return section;
  }

  // ───────────────────────────────────
  //  Template Usage — Donut Chart
  // ───────────────────────────────────

  _renderTemplateChart(sessions) {
    const section = this._section('TEMPLATE USAGE');

    // Count templates
    const counts = {};
    for (const s of sessions) {
      const t = s.template || 'freeform';
      counts[t] = (counts[t] || 0) + 1;
    }

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      section.appendChild(this._emptyState('No template data.'));
      return section;
    }

    const total = entries.reduce((sum, [_, c]) => sum + c, 0);
    const chartSize = 160;
    const cx = chartSize / 2;
    const cy = chartSize / 2;
    const outerR = 65;
    const innerR = 40;

    const svg = this._svg('svg', {
      viewBox: `0 0 ${chartSize + 200} ${chartSize}`,
      class: 'analytics-chart-svg analytics-chart-donut',
      preserveAspectRatio: 'xMinYMin meet',
    });

    let currentAngle = -Math.PI / 2;  // start at top

    entries.forEach(([template, count], i) => {
      const sliceAngle = (count / total) * Math.PI * 2;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];

      if (entries.length === 1) {
        // Full circle — can't draw an arc, use two semicircles
        svg.appendChild(this._svg('circle', {
          cx, cy, r: outerR,
          fill: 'none',
          stroke: color,
          'stroke-width': outerR - innerR,
          opacity: '0.85',
        }));
      } else {
        const x1 = cx + outerR * Math.cos(currentAngle);
        const y1 = cy + outerR * Math.sin(currentAngle);
        const x2 = cx + outerR * Math.cos(currentAngle + sliceAngle);
        const y2 = cy + outerR * Math.sin(currentAngle + sliceAngle);
        const x3 = cx + innerR * Math.cos(currentAngle + sliceAngle);
        const y3 = cy + innerR * Math.sin(currentAngle + sliceAngle);
        const x4 = cx + innerR * Math.cos(currentAngle);
        const y4 = cy + innerR * Math.sin(currentAngle);

        const largeArc = sliceAngle > Math.PI ? 1 : 0;

        const path = this._svg('path', {
          d: `M ${x1} ${y1}
              A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}
              L ${x3} ${y3}
              A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}
              Z`,
          fill: color,
          opacity: '0.85',
        });
        svg.appendChild(path);
      }

      currentAngle += sliceAngle;

      // Legend entry
      const legendY = 14 + i * 20;
      const legendX = chartSize + 10;

      svg.appendChild(this._svg('rect', {
        x: legendX,
        y: legendY - 8,
        width: 10,
        height: 10,
        rx: 2,
        fill: color,
        opacity: '0.85',
      }));

      const legendLabel = this._svg('text', {
        x: legendX + 16,
        y: legendY,
        fill: 'var(--text)',
        'font-family': 'var(--mono)',
        'font-size': '10',
      });
      const pct = Math.round((count / total) * 100);
      legendLabel.textContent = `${template} (${pct}%)`;
      svg.appendChild(legendLabel);
    });

    // Center label
    const centerLabel = this._svg('text', {
      x: cx,
      y: cy - 4,
      'text-anchor': 'middle',
      fill: 'var(--text)',
      'font-family': 'var(--mono)',
      'font-size': '16',
      'font-weight': '700',
    });
    centerLabel.textContent = total;
    svg.appendChild(centerLabel);

    const centerSub = this._svg('text', {
      x: cx,
      y: cy + 12,
      'text-anchor': 'middle',
      fill: 'var(--dim)',
      'font-family': 'var(--mono)',
      'font-size': '8',
      'text-transform': 'uppercase',
      'letter-spacing': '0.1em',
    });
    centerSub.textContent = 'sessions';
    svg.appendChild(centerSub);

    section.appendChild(svg);
    return section;
  }

  // ───────────────────────────────────
  //  Top Mishearings — Table
  // ───────────────────────────────────

  _renderMishearingsTable(learnerStats) {
    const section = this._section('TOP MISHEARINGS');

    if (!learnerStats || !learnerStats.topMishearings || learnerStats.topMishearings.length === 0) {
      section.appendChild(this._emptyState('No correction data yet. Dictate with AI corrections enabled.'));
      return section;
    }

    // Summary line
    const summary = document.createElement('div');
    summary.className = 'analytics-mishearing-summary';
    summary.textContent =
      `${learnerStats.totalTracked} tracked \u00b7 ${learnerStats.promoted} promoted \u00b7 ${learnerStats.pending} pending`;
    section.appendChild(summary);

    // Table
    const table = document.createElement('table');
    table.className = 'analytics-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Misheard</th>
        <th>Corrected To</th>
        <th>Count</th>
        <th>Status</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const item of learnerStats.topMishearings) {
      const tr = document.createElement('tr');
      const statusClass = item.promoted ? 'analytics-status-promoted' : 'analytics-status-pending';
      const statusText = item.promoted ? 'promoted' : 'learning';
      tr.innerHTML = `
        <td class="analytics-cell-misheard">${this._escapeHtml(item.misheard)}</td>
        <td class="analytics-cell-correct">${this._escapeHtml(item.correct)}</td>
        <td class="analytics-cell-count">${item.count}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    section.appendChild(table);
    return section;
  }

  // ───────────────────────────────────
  //  Helpers
  // ───────────────────────────────────

  /** Create a section container with a title */
  _section(title) {
    const el = document.createElement('div');
    el.className = 'analytics-section';

    const heading = document.createElement('div');
    heading.className = 'analytics-section-title';
    heading.textContent = title;
    el.appendChild(heading);

    return el;
  }

  /** Create an empty-state message element */
  _emptyState(message) {
    const el = document.createElement('div');
    el.className = 'analytics-empty';
    el.textContent = message;
    return el;
  }

  /** Create an SVG element with attributes */
  _svg(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    const cssClass = attrs['class'];
    delete attrs['class'];
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    if (cssClass) el.setAttribute('class', cssClass);
    return el;
  }

  /** Escape HTML entities */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Inject scoped CSS styles for the dashboard (once) */
  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      /* ── Analytics Dashboard Overlay ── */
      .analytics-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      }

      .analytics-modal {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 6px;
        width: 800px;
        max-width: 94vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
        overflow: hidden;
      }

      .analytics-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px 10px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }

      .analytics-title {
        font-family: var(--mono);
        font-size: 0.7rem;
        letter-spacing: 0.2em;
        color: var(--ai-glow);
      }

      .analytics-close {
        background: none;
        border: none;
        color: var(--muted);
        font-size: 1.4rem;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.2s;
      }
      .analytics-close:hover { color: var(--text); }

      .analytics-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 28px;
        scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
      }
      .analytics-body::-webkit-scrollbar { width: 4px; }
      .analytics-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

      /* ── Sections ── */
      .analytics-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .analytics-section-title {
        font-family: var(--mono);
        font-size: 0.55rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--ai-glow);
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border);
      }

      /* ── Summary Cards ── */
      .analytics-cards {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .analytics-card {
        flex: 1 1 120px;
        min-width: 100px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .analytics-card-value {
        font-family: var(--mono);
        font-size: 1.3rem;
        font-weight: 700;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }

      .analytics-card-label {
        font-family: var(--mono);
        font-size: 0.52rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--dim);
      }

      /* ── SVG Charts ── */
      .analytics-chart-svg {
        width: 100%;
        height: auto;
        max-height: 300px;
      }
      .analytics-chart-donut {
        max-height: 180px;
      }

      /* ── Mishearings Table ── */
      .analytics-mishearing-summary {
        font-family: var(--mono);
        font-size: 0.65rem;
        color: var(--muted);
        letter-spacing: 0.05em;
      }

      .analytics-table {
        width: 100%;
        border-collapse: collapse;
        font-family: var(--mono);
        font-size: 0.72rem;
      }

      .analytics-table th {
        text-align: left;
        font-size: 0.55rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--dim);
        padding: 6px 10px;
        border-bottom: 1px solid var(--border);
        font-weight: 400;
      }

      .analytics-table td {
        padding: 6px 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
        color: var(--text);
      }

      .analytics-cell-misheard {
        color: var(--danger);
        text-decoration: line-through;
        opacity: 0.75;
      }

      .analytics-cell-correct {
        color: var(--accent2);
      }

      .analytics-cell-count {
        color: var(--text);
        font-variant-numeric: tabular-nums;
        text-align: center;
      }

      .analytics-status-promoted {
        font-size: 0.55rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .analytics-status-pending {
        font-size: 0.55rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--dim);
        background: color-mix(in srgb, var(--dim) 12%, transparent);
        padding: 2px 6px;
        border-radius: 3px;
      }

      /* ── Empty state ── */
      .analytics-empty {
        font-family: var(--body);
        font-size: 0.8rem;
        color: var(--dim);
        font-style: italic;
        padding: 16px 0;
      }

      /* ── Responsive ── */
      @media (max-width: 600px) {
        .analytics-modal {
          max-width: 100vw;
          max-height: 100vh;
          border-radius: 0;
          width: 100%;
          height: 100%;
        }
        .analytics-cards {
          flex-direction: column;
        }
        .analytics-card {
          flex: 1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
