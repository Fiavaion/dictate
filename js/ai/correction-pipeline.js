/**
 * Real-Time Correction Pipeline
 * Incrementally corrects dictated text via Ollama (gemma3:4b).
 * Debounces rapid STT results, streams corrections, tracks diffs.
 */

import { applyJargonMap } from './jargon-map.js';

const BASE_SYSTEM_PROMPT = `You are a text correction assistant for a developer dictation tool. The user dictates prompts for Claude Code (an AI coding assistant). Fix:
- Spelling and grammar errors
- Punctuation (add missing periods, commas)
- Capitalize proper nouns and sentence starts
- Preserve code blocks, file paths, URLs, and variable names exactly as dictated
- Preserve paragraph breaks and list formatting
- Preserve all technical terms, code references, and developer jargon exactly

Do not add preamble like "Here is the corrected text:" — return ONLY the corrected text. No explanations, no quotes, no extra formatting. If the text is already correct, return it unchanged.`;

const FEW_SHOT_EXAMPLES = [
  {
    input: `so basically I need to update the use effect hook in the dashboard component to uh fetch the data from slash API slash metrics instead of the old endpoint and also add error handling`,
    output: `So basically, I need to update the useEffect hook in the dashboard component to fetch the data from /api/metrics instead of the old endpoint, and also add error handling.`,
  },
  {
    input: `the problem is in the package dot json file the dependency for react router dom is pointing to version 5 but we need version 6 because the route component API changed`,
    output: `The problem is in the package.json file. The dependency for react-router-dom is pointing to version 5, but we need version 6 because the Route component API changed.`,
  },
  {
    input: `I want to add a middleware function in the express server that checks if the authorization header has a valid jason web token before allowing access to the protected routes`,
    output: `I want to add a middleware function in the Express server that checks if the Authorization header has a valid JSON Web Token before allowing access to the protected routes.`,
  },
];

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

  get correctedText() {
    const segments = [...this.correctedSegments];
    return segments.join(' ').trim();
  }

  get rawText() {
    return [...this.rawSegments].join(' ').trim();
  }

  /** Build the system prompt with few-shot correction examples */
  _buildSystemPrompt() {
    let prompt = BASE_SYSTEM_PROMPT;

    prompt += '\n\nExamples:';
    for (const ex of FEW_SHOT_EXAMPLES) {
      prompt += `\n\nInput: ${ex.input}\nOutput: ${ex.output}`;
    }

    return prompt;
  }

  /** Build the user prompt containing only the text to correct */
  _buildUserPrompt(text) {
    return `Text to correct:\n${text}`;
  }

  onNewText(text) {
    if (!text.trim()) return;

    const jargonCorrected = applyJargonMap(text);
    this.rawSegments.push(jargonCorrected);
    this.pendingRaw += (this.pendingRaw ? ' ' : '') + jargonCorrected;

    if (!this.enabled || !this.client.connected) {
      this.correctedSegments.push(jargonCorrected);
      this.onCorrectionDone?.(this.correctedText, []);
      this.pendingRaw = '';
      return;
    }

    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._correctPending(), this.debounceMs);
  }

  async forceCorrect() {
    clearTimeout(this._debounceTimer);
    await this._correctPending();
  }

  async _correctPending() {
    const toCorrect = this.pendingRaw.trim();
    if (!toCorrect) return;
    this.pendingRaw = '';

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    this._correcting = true;
    this.onCorrectionStart?.();

    try {
      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(toCorrect);
      let corrected = '';

      for await (const { token, done } of this.client.generate(
        this.model, userPrompt, systemPrompt,
        { num_predict: Math.max(400, toCorrect.length * 2), temperature: 0.1 },
        this._abortController.signal
      )) {
        corrected += token;
        this.onCorrectionToken?.(corrected);
        if (done) break;
      }

      corrected = corrected.trim();
      if (!corrected) corrected = toCorrect;

      this.correctedSegments.push(corrected);

      const diffs = this._findDiffs(toCorrect, corrected);
      if (diffs.length > 0) {
        this.corrections.push(...diffs);
      }

      this.onCorrectionDone?.(this.correctedText, diffs);
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.correctedSegments.push(toCorrect);
      this.onCorrectionDone?.(this.correctedText, []);
      this.onError?.(e.message);
    } finally {
      this._correcting = false;
    }
  }

  /** LCS-based word-level diff to find what changed */
  _findDiffs(original, corrected) {
    if (original === corrected) return [];

    const origWords = original.split(/\s+/);
    const corrWords = corrected.split(/\s+/);
    const diffs = [];

    // Build LCS table
    const m = origWords.length;
    const n = corrWords.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (origWords[i - 1].toLowerCase() === corrWords[j - 1].toLowerCase()) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find the LCS sequence indices
    const lcsOrig = [];
    const lcsCorr = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (origWords[i - 1].toLowerCase() === corrWords[j - 1].toLowerCase()) {
        lcsOrig.push(i - 1);
        lcsCorr.push(j - 1);
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    lcsOrig.reverse();
    lcsCorr.reverse();

    // Walk through both sequences, using LCS anchors to identify changes
    let oi = 0, ci = 0;
    for (let k = 0; k <= lcsOrig.length; k++) {
      const oEnd = k < lcsOrig.length ? lcsOrig[k] : m;
      const cEnd = k < lcsCorr.length ? lcsCorr[k] : n;

      const removed = origWords.slice(oi, oEnd);
      const added = corrWords.slice(ci, cEnd);

      if (removed.length || added.length) {
        diffs.push({
          original: removed.join(' '),
          corrected: added.join(' '),
          timestamp: Date.now(),
        });
      }

      oi = oEnd + 1;
      ci = cEnd + 1;
    }

    return diffs;
  }

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
