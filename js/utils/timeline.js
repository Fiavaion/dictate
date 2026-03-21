/**
 * Session Timeline — records every STT event, command, correction,
 * and AI action with timestamps during a session.
 * Supports reconstruction of transcript state at any point in time.
 */

const MAX_EVENTS = 500;

export class SessionTimeline {
  constructor() {
    this.events = [];          // [{ type, timestamp, data, duration? }]
    this.sessionStart = Date.now();
  }

  /**
   * Record a timeline event.
   * @param {string} type  One of: 'stt-final', 'stt-interim', 'command',
   *   'correction', 'structure', 'template-change', 'pause', 'resume',
   *   'ghost-accept', 'ghost-dismiss', 'copy', 'clear', 'session-start'
   * @param {object} data  Type-specific payload
   */
  record(type, data = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({
      type,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Reconstruct raw transcript state at a given absolute timestamp.
   * Replays stt-final, clear, and undo events up to that point.
   * @param {number} timestamp  Absolute ms timestamp
   * @returns {string}
   */
  getTextAtTime(timestamp) {
    let text = '';
    for (const evt of this.events) {
      if (evt.timestamp > timestamp) break;
      if (evt.type === 'stt-final') {
        text += (text ? ' ' : '') + (evt.data.text || '');
      }
      if (evt.type === 'command' && evt.data.action === 'clear') {
        text = '';
      }
      if (evt.type === 'command' && evt.data.action === 'undo') {
        text = evt.data.prevText || text;
      }
      if (evt.type === 'clear') {
        text = '';
      }
    }
    return text;
  }

  /**
   * Total elapsed time from session start to last event (ms).
   * @returns {number}
   */
  getDuration() {
    if (this.events.length === 0) return 0;
    return this.events[this.events.length - 1].timestamp - this.sessionStart;
  }

  /**
   * Return events whose offset from session start falls within [startMs, endMs].
   * @param {number} startMs
   * @param {number} endMs
   * @returns {Array}
   */
  getEventsInRange(startMs, endMs) {
    return this.events.filter(e => {
      const offset = e.timestamp - this.sessionStart;
      return offset >= startMs && offset <= endMs;
    });
  }

  /**
   * Get all events of a given type.
   * @param {string} type
   * @returns {Array}
   */
  getEventsByType(type) {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Count events grouped by type.
   * @returns {Object<string, number>}
   */
  getCounts() {
    const counts = {};
    for (const evt of this.events) {
      counts[evt.type] = (counts[evt.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Export as a human-readable markdown "thinking log".
   * @returns {string}
   */
  toMarkdown() {
    const counts = this.getCounts();
    let md = `# Session Timeline\n\n`;
    md += `**Duration:** ${this._formatDuration(this.getDuration())}\n`;
    md += `**Events:** ${this.events.length}\n`;

    // Summary counts
    const summaryTypes = ['stt-final', 'command', 'correction', 'structure', 'ghost-accept'];
    const summaryParts = summaryTypes
      .filter(t => counts[t])
      .map(t => `${this._typeLabel(t)}: ${counts[t]}`);
    if (summaryParts.length) {
      md += `**Summary:** ${summaryParts.join(' | ')}\n`;
    }
    md += '\n---\n\n';

    // Event log
    for (const evt of this.events) {
      const time = this._formatDuration(evt.timestamp - this.sessionStart);
      const desc = this._describeEvent(evt);
      if (desc) {
        md += `- **${time}** ${desc}\n`;
      }
    }

    return md;
  }

  /**
   * Serialize to a JSON-safe object.
   * @returns {{ events: Array, sessionStart: number }}
   */
  toJSON() {
    return {
      events: this.events,
      sessionStart: this.sessionStart,
    };
  }

  /**
   * Restore from a previously serialized object.
   * @param {{ events: Array, sessionStart: number }} json
   */
  fromJSON(json) {
    this.events = json.events || [];
    this.sessionStart = json.sessionStart || Date.now();
  }

  /**
   * Reset the timeline to empty state.
   */
  clear() {
    this.events = [];
    this.sessionStart = Date.now();
  }

  // ──────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────

  /**
   * Format milliseconds as "0:00" or "1:23:45".
   * @param {number} ms
   * @returns {string}
   */
  _formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Human-readable label for an event type.
   * @param {string} type
   * @returns {string}
   */
  _typeLabel(type) {
    const labels = {
      'stt-final':        'Speech',
      'stt-interim':      'Interim',
      'command':          'Commands',
      'correction':       'Corrections',
      'structure':        'Structures',
      'template-change':  'Template changes',
      'pause':            'Pauses',
      'resume':           'Resumes',
      'ghost-accept':     'Ghost accepts',
      'ghost-dismiss':    'Ghost dismissals',
      'copy':             'Copies',
      'clear':            'Clears',
      'session-start':    'Session starts',
    };
    return labels[type] || type;
  }

  /**
   * Produce a human-readable description of a single event.
   * @param {{ type: string, data: object }} evt
   * @returns {string|null}  null if the event should be skipped in markdown
   */
  _describeEvent(evt) {
    const { type, data } = evt;

    switch (type) {
      case 'session-start':
        return 'Session started';

      case 'stt-final': {
        const preview = (data.text || '').slice(0, 60);
        const suffix = (data.text || '').length > 60 ? '...' : '';
        const conf = data.confidence != null
          ? ` (confidence: ${Math.round(data.confidence * 100)}%)`
          : '';
        return `Speech: "${preview}${suffix}"${conf}`;
      }

      case 'stt-interim':
        // Skip interim events in markdown — too noisy
        return null;

      case 'command':
        return `Command: **${data.action || data.command || 'unknown'}**` +
          (data.arg ? ` — ${data.arg}` : '');

      case 'correction': {
        const orig = (data.original || '').slice(0, 40);
        const corr = (data.corrected || '').slice(0, 40);
        return `Correction: ~~${orig}~~ -> ${corr}`;
      }

      case 'structure':
        return `Structured output generated` +
          (data.template ? ` (template: ${data.template})` : '');

      case 'template-change':
        return `Template changed to **${data.template || '?'}**`;

      case 'pause':
        return 'Dictation paused';

      case 'resume':
        return 'Dictation resumed';

      case 'ghost-accept': {
        const text = (data.text || '').slice(0, 50);
        return `Ghost text accepted: "${text}"`;
      }

      case 'ghost-dismiss':
        return 'Ghost text dismissed';

      case 'copy':
        return `Copied to clipboard` +
          (data.source ? ` (${data.source})` : '');

      case 'clear':
        return 'Transcript cleared';

      default:
        return `${type}`;
    }
  }
}
