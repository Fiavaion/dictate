/**
 * SpeakAsYouType — automatic sentence readback as dictation occurs.
 * Watches for completed sentences in the raw transcript, speaks each
 * via Web Speech synthesis, and fires word-boundary events so the UI
 * can highlight the word currently being spoken.
 */

export class SpeakAsYouType {
  constructor() {
    this.enabled = false;
    this.rate = 0.88;
    this._lastReadPos = 0;
    this._voice = null;

    // Callbacks wired by the host (app.js)
    this.onWordBoundary = null;  // (word, charIndex, charLength)
    this.onSpeechStart  = null;  // (sentence)
    this.onSpeechEnd    = null;  // ()
  }

  setVoice(voice) { this._voice = voice; }
  setRate(rate)   { this.rate = Math.max(0.5, Math.min(2, rate)); }

  /**
   * Feed the current full raw transcript.
   * Extracts the next unread complete sentence (ends in . ! ?) and speaks it.
   * Call this after every rawTranscript update.
   */
  feed(fullText) {
    if (!this.enabled || !('speechSynthesis' in window)) return;

    const unread = fullText.slice(this._lastReadPos);
    // Match the first complete sentence — greedy up to first sentence-ender
    const match = unread.match(/^([\s\S]*?[.!?])(?:\s|$)/);
    if (!match) return;

    const sentence = match[1].trim();
    this._lastReadPos += match[0].length;
    if (sentence) this._speak(sentence);
  }

  /** Cancel speech and reset read position — call on clearAll / new session. */
  reset() {
    this._lastReadPos = 0;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.onSpeechEnd?.();
  }

  /** Cancel in-progress speech without resetting position. */
  cancel() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  _speak(sentence) {
    if (!sentence.trim()) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(sentence);
    utt.rate = this.rate;
    if (this._voice) utt.voice = this._voice;

    utt.onstart = () => this.onSpeechStart?.(sentence);
    utt.onend   = () => this.onSpeechEnd?.();
    utt.onerror = () => this.onSpeechEnd?.();

    utt.onboundary = (e) => {
      if (e.name !== 'word') return;
      const len  = e.charLength || sentence.slice(e.charIndex).search(/\s|$/) || 1;
      const word = sentence.slice(e.charIndex, e.charIndex + len);
      this.onWordBoundary?.(word, e.charIndex, len);
    };

    speechSynthesis.speak(utt);
  }
}
