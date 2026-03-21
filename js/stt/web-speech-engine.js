/**
 * Web Speech Engine — adapted from BugHive
 * Wraps SpeechRecognition with auto-restart, confidence scoring,
 * cached MediaStream (one-time mic permission), and clean events.
 */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;

// Cached mic stream — requested ONCE, reused across start/stop cycles
let cachedStream = null;

export class WebSpeechEngine {
  constructor(options = {}) {
    this.lang = options.lang || 'en-US';
    this.maxAlternatives = options.maxAlternatives || 1;
    this.onInterim = options.onInterim || null;     // (text) => void
    this.onFinal   = options.onFinal   || null;     // (text, confidence, alternatives) => void
    this.onStart   = options.onStart   || null;
    this.onStop    = options.onStop    || null;
    this.onError   = options.onError   || null;

    this._recognition = null;
    this._active = false;
    this._pendingFinal = '';
  }

  static get isSupported() { return !!SR; }

  /** Get or create the cached mic stream (one-time permission) */
  static async getMicStream() {
    if (cachedStream) {
      const tracks = cachedStream.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return cachedStream;
      }
    }
    cachedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return cachedStream;
  }

  /** Release the cached stream on page unload */
  static releaseStream() {
    if (cachedStream) {
      cachedStream.getTracks().forEach(t => t.stop());
      cachedStream = null;
    }
  }

  start(grammarHints = []) {
    if (!SR) { this.onError?.('not-supported'); return; }
    if (this._active) return;
    this._active = true;
    this._createRecognition(grammarHints);
    try {
      this._recognition.start();
    } catch (e) {
      this._active = false;
      this.onError?.(e.message);
    }
  }

  stop() {
    this._active = false;
    if (this._recognition) {
      try { this._recognition.abort(); } catch (_) {}
      this._recognition = null;
    }
    this.onStop?.();
  }

  get isActive() { return this._active; }

  setLang(lang) { this.lang = lang; }
  setMaxAlternatives(n) { this.maxAlternatives = n; }

  _createRecognition(grammarHints) {
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = this.lang;
    r.maxAlternatives = this.maxAlternatives;

    if (SGL && grammarHints.length) {
      const list = new SGL();
      const grammar = `#JSGF V1.0; grammar hints; public <hint> = ${grammarHints.join(' | ')} ;`;
      list.addFromString(grammar, 1);
      r.grammars = list;
    }

    r.onstart = () => this.onStart?.();

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          this._pendingFinal += transcript;
          const confidence = result[0].confidence ?? 1;
          const alts = [];
          for (let a = 1; a < result.length; a++) alts.push(result[a].transcript.trim());
          this.onFinal?.(this._pendingFinal.trim(), confidence, alts);
          this._pendingFinal = '';
        } else {
          interim += transcript;
        }
      }
      if (interim) this.onInterim?.(interim);
    };

    r.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      this.onError?.(e.error);
    };

    r.onend = () => {
      if (this._active) {
        try { r.start(); } catch (_) { this.stop(); }
      } else {
        this.onStop?.();
      }
    };

    this._recognition = r;
  }
}

// Release stream when page closes
window.addEventListener('beforeunload', () => WebSpeechEngine.releaseStream());
