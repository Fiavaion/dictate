/**
 * Adaptive Vocabulary Learning — Correction Learner
 * Tracks recurring STT mishearings from the correction pipeline diffs.
 * After a word is corrected the same way N times (default 3), auto-promotes
 * it to the jargon map for instant pre-LLM correction.
 *
 * Usage:
 *   const learner = new CorrectionLearner({ threshold: 3 });
 *   learner.onPromotion = (misheard, correct) => { ... };
 *   // Feed diffs from CorrectionPipeline:
 *   for (const diff of diffs) learner.observeDiff(diff);
 */

const STORAGE_KEY = 'fiavaion-correction-learner';

export class CorrectionLearner {
  /**
   * @param {Object} options
   * @param {number} [options.threshold=3] — promote after this many identical corrections
   */
  constructor(options = {}) {
    /** @type {Object.<string, CorrectionEntry>} */
    this.corrections = {};
    // { "misheard_normalized": { target, count, confidence, firstSeen, lastSeen, promoted } }

    this.threshold = options.threshold || 3;
    this.enabled = true;

    /** Called when a term reaches promotion threshold */
    this.onPromotion = null;  // callback(misheard, correct)

    /** Called on every new observation */
    this.onLearned = null;    // callback(misheard, correct, count)

    this._load();
  }

  // ───────────────────────────────────
  //  Observation
  // ───────────────────────────────────

  /**
   * Feed a diff object from CorrectionPipeline._findDiffs().
   * Each diff has { original, corrected, timestamp }.
   * @param {{ original: string, corrected: string, timestamp?: number }} diff
   */
  observeDiff(diff) {
    if (!this.enabled) return;
    if (!diff || !diff.original || !diff.corrected) return;

    // Skip if the correction is only a case change
    if (diff.original.toLowerCase() === diff.corrected.toLowerCase()) return;

    const key = this._normalize(diff.original);
    if (!key || key.length < 2) return;  // skip single chars

    // Skip if the diff is just punctuation being added/removed
    if (this._isPunctuationOnly(key) || this._isPunctuationOnly(diff.corrected)) return;

    if (!this.corrections[key]) {
      this.corrections[key] = {
        target: diff.corrected,
        count: 0,
        confidence: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        promoted: false,
      };
    }

    const entry = this.corrections[key];

    // If the correction target matches what we already track, increment
    if (entry.target.toLowerCase() === diff.corrected.toLowerCase()) {
      entry.count++;
      entry.lastSeen = Date.now();
      // Confidence ramps from 0 to ~1 as count exceeds threshold
      entry.confidence = Math.min(1, entry.count / (this.threshold + 2));
    } else {
      // Different correction target — the AI corrects this word inconsistently.
      // If the new target has been seen more recently, switch to it but keep
      // a reduced count so it doesn't promote on noise.
      if (entry.count <= 1) {
        entry.target = diff.corrected;
        entry.count = 1;
      } else {
        // Decay: reduce count by half when the target changes
        entry.count = Math.max(1, Math.floor(entry.count / 2));
        entry.target = diff.corrected;
      }
      entry.lastSeen = Date.now();
      entry.confidence = Math.min(1, entry.count / (this.threshold + 2));
    }

    // Notify observer
    this.onLearned?.(key, entry.target, entry.count);

    // Check for promotion
    if (entry.count >= this.threshold && entry.confidence >= 0.5 && !entry.promoted) {
      entry.promoted = true;
      this.onPromotion?.(key, entry.target);
    }

    this._save();
  }

  /**
   * Feed an array of diffs at once (e.g. from a single correction pass).
   * @param {Array<{ original: string, corrected: string, timestamp?: number }>} diffs
   */
  observeDiffs(diffs) {
    if (!Array.isArray(diffs)) return;
    for (const diff of diffs) {
      this.observeDiff(diff);
    }
  }

  // ───────────────────────────────────
  //  Queries
  // ───────────────────────────────────

  /**
   * Get a shallow copy of all tracked corrections.
   * @returns {Object.<string, CorrectionEntry>}
   */
  getAll() {
    return { ...this.corrections };
  }

  /**
   * Get entries that have reached the promotion threshold.
   * @returns {Array<{ misheard: string, correct: string, count: number, confidence: number }>}
   */
  getPromotionCandidates() {
    return Object.entries(this.corrections)
      .filter(([_, v]) => v.count >= this.threshold)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, v]) => ({
        misheard: key,
        correct: v.target,
        count: v.count,
        confidence: v.confidence,
      }));
  }

  /**
   * Get entries still building up (below threshold).
   * @returns {Array<{ misheard: string, correct: string, count: number, remaining: number }>}
   */
  getPending() {
    return Object.entries(this.corrections)
      .filter(([_, v]) => v.count < this.threshold)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, v]) => ({
        misheard: key,
        correct: v.target,
        count: v.count,
        remaining: this.threshold - v.count,
      }));
  }

  /**
   * Get aggregate stats suitable for the analytics dashboard.
   * @returns {{ totalTracked: number, promoted: number, pending: number, topMishearings: Array }}
   */
  getStats() {
    const entries = Object.values(this.corrections);
    const promoted = entries.filter(e => e.count >= this.threshold).length;
    return {
      totalTracked: entries.length,
      promoted,
      pending: entries.length - promoted,
      topMishearings: Object.entries(this.corrections)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([key, v]) => ({
          misheard: key,
          correct: v.target,
          count: v.count,
          confidence: v.confidence,
          promoted: v.count >= this.threshold,
        })),
    };
  }

  /**
   * Check if a specific word/phrase is being tracked.
   * @param {string} word
   * @returns {CorrectionEntry|null}
   */
  lookup(word) {
    const key = this._normalize(word);
    return this.corrections[key] || null;
  }

  // ───────────────────────────────────
  //  Mutation
  // ───────────────────────────────────

  /**
   * Remove a learned correction by key.
   * @param {string} key — the normalized misheard word
   */
  remove(key) {
    delete this.corrections[this._normalize(key)];
    this._save();
  }

  /**
   * Clear all learned corrections.
   */
  clear() {
    this.corrections = {};
    this._save();
  }

  /**
   * Manually add a correction (e.g. user teaches a word).
   * Sets count to threshold so it immediately qualifies for promotion.
   * @param {string} misheard
   * @param {string} correct
   */
  teach(misheard, correct) {
    const key = this._normalize(misheard);
    if (!key) return;

    this.corrections[key] = {
      target: correct,
      count: this.threshold,
      confidence: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      promoted: true,
    };

    this.onPromotion?.(key, correct);
    this._save();
  }

  /**
   * Prune entries older than `maxAgeDays` with count below threshold.
   * Keeps promoted entries forever.
   * @param {number} [maxAgeDays=30]
   */
  prune(maxAgeDays = 30) {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    let pruned = 0;

    for (const [key, entry] of Object.entries(this.corrections)) {
      if (entry.count < this.threshold && entry.lastSeen < cutoff) {
        delete this.corrections[key];
        pruned++;
      }
    }

    if (pruned > 0) this._save();
    return pruned;
  }

  // ───────────────────────────────────
  //  Export / Import
  // ───────────────────────────────────

  /**
   * Export all corrections as a JSON string.
   * @returns {string}
   */
  export() {
    return JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      threshold: this.threshold,
      corrections: this.corrections,
    }, null, 2);
  }

  /**
   * Import corrections from a JSON string.
   * Merges with existing data — higher counts win.
   * @param {string} json
   * @returns {number} — number of entries imported
   */
  import(json) {
    const data = JSON.parse(json);
    if (!data.corrections || typeof data.corrections !== 'object') {
      throw new Error('Invalid correction learner export format');
    }

    let imported = 0;
    for (const [key, entry] of Object.entries(data.corrections)) {
      const existing = this.corrections[key];
      if (!existing || entry.count > existing.count) {
        this.corrections[key] = { ...entry };
        imported++;
      }
    }

    this._save();
    return imported;
  }

  // ───────────────────────────────────
  //  Internal
  // ───────────────────────────────────

  /** Normalize a word/phrase for use as a lookup key */
  _normalize(text) {
    return (text || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s'-]/g, '')   // strip punctuation except apostrophes/hyphens
      .replace(/\s+/g, ' ');       // collapse whitespace
  }

  /** Check if a string is only punctuation / whitespace */
  _isPunctuationOnly(text) {
    return /^[\s\p{P}]*$/u.test(text);
  }

  /** Save corrections to localStorage */
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.corrections));
    } catch {
      /* localStorage full — degrade gracefully */
    }
  }

  /** Load corrections from localStorage */
  _load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.corrections = JSON.parse(data);
      }
    } catch {
      this.corrections = {};
    }
  }
}
