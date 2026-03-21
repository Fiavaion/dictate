/**
 * Real-Time Correction Pipeline
 * Incrementally corrects dictated text via Ollama (gemma3:4b).
 * Debounces rapid STT results, streams corrections, tracks diffs.
 */

import { applyJargonMap } from './jargon-map.js';

const SYSTEM_PROMPT = `You are a text correction assistant for a developer dictation tool. The user dictates prompts for Claude Code (an AI coding assistant). Fix:
- Spelling and grammar errors
- Punctuation (add missing periods, commas)
- Capitalize proper nouns and sentence starts
- Preserve all technical terms, code references, file paths, and developer jargon exactly

Return ONLY the corrected text. No explanations, no quotes, no extra formatting. If the text is already correct, return it unchanged.`;

export class CorrectionPipeline {
  constructor(ollamaClient, options = {}) {
    this.client = ollamaClient;
    this.model = options.model || 'gemma3:4b';
    this.debounceMs = options.debounceMs || 600;
    this.enabled = true;

    // Correction state
    this.rawSegments = [];         // uncorrected text segments
    this.correctedSegments = [];   // corrected text segments
    this.pendingRaw = '';          // accumulated since last correction
    this.corrections = [];         // { original, corrected, timestamp }

    // Callbacks
    this.onCorrectionStart = options.onCorrectionStart || null;
    this.onCorrectionToken = options.onCorrectionToken || null;
    this.onCorrectionDone = options.onCorrectionDone || null;
    this.onError = options.onError || null;

    this._debounceTimer = null;
    this._abortController = null;
    this._correcting = false;
  }

  get isActive() { return this._correcting; }

  /** Get the full corrected transcript */
  get correctedText() {
    const segments = [...this.correctedSegments];
    return segments.join(' ').trim();
  }

  /** Get the full raw transcript (after jargon map) */
  get rawText() {
    return [...this.rawSegments].join(' ').trim();
  }

  /** Feed new text from STT (after auto-punctuation) */
  onNewText(text) {
    if (!text.trim()) return;

    // Apply jargon map immediately (no LLM needed)
    const jargonCorrected = applyJargonMap(text);
    this.rawSegments.push(jargonCorrected);
    this.pendingRaw += (this.pendingRaw ? ' ' : '') + jargonCorrected;

    if (!this.enabled || !this.client.connected) {
      // If AI is off, just echo jargon-corrected text as the "correction"
      this.correctedSegments.push(jargonCorrected);
      this.onCorrectionDone?.(this.correctedText, []);
      this.pendingRaw = '';
      return;
    }

    // Debounce — cancel previous timer, start new one
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._correctPending(), this.debounceMs);
  }

  /** Force immediate correction of pending text */
  async forceCorrect() {
    clearTimeout(this._debounceTimer);
    await this._correctPending();
  }

  async _correctPending() {
    const toCorrect = this.pendingRaw.trim();
    if (!toCorrect) return;
    this.pendingRaw = '';

    // Cancel any in-flight correction
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    this._correcting = true;
    this.onCorrectionStart?.();

    try {
      const prompt = `${SYSTEM_PROMPT}\n\nText to correct:\n${toCorrect}`;
      let corrected = '';

      for await (const { token, done } of this.client.generate(
        this.model, prompt,
        { num_predict: Math.max(200, toCorrect.length * 2), temperature: 0.1 },
        this._abortController.signal
      )) {
        corrected += token;
        this.onCorrectionToken?.(corrected);
        if (done) break;
      }

      corrected = corrected.trim();
      if (!corrected) corrected = toCorrect; // fallback to original

      this.correctedSegments.push(corrected);

      // Track corrections (differences)
      const diffs = this._findDiffs(toCorrect, corrected);
      if (diffs.length > 0) {
        this.corrections.push(...diffs);
      }

      this.onCorrectionDone?.(this.correctedText, diffs);
    } catch (e) {
      if (e.name === 'AbortError') return; // cancelled, not an error
      // On error, use the raw text as fallback
      this.correctedSegments.push(toCorrect);
      this.onCorrectionDone?.(this.correctedText, []);
      this.onError?.(e.message);
    } finally {
      this._correcting = false;
    }
  }

  /** Simple word-level diff to find what changed */
  _findDiffs(original, corrected) {
    if (original === corrected) return [];

    const origWords = original.split(/\s+/);
    const corrWords = corrected.split(/\s+/);
    const diffs = [];

    // Simple comparison — won't catch reordering, but fast
    const maxLen = Math.max(origWords.length, corrWords.length);
    for (let i = 0; i < maxLen; i++) {
      const ow = origWords[i] || '';
      const cw = corrWords[i] || '';
      if (ow.toLowerCase() !== cw.toLowerCase()) {
        diffs.push({
          original: ow,
          corrected: cw,
          timestamp: Date.now(),
        });
      }
    }
    return diffs;
  }

  /** Reset all state */
  reset() {
    clearTimeout(this._debounceTimer);
    if (this._abortController) this._abortController.abort();
    this.rawSegments = [];
    this.correctedSegments = [];
    this.pendingRaw = '';
    this.corrections = [];
    this._correcting = false;
  }

  setModel(model) { this.model = model; }
  setEnabled(enabled) { this.enabled = enabled; }
}
