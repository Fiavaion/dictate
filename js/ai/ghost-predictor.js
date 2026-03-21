/**
 * Ghost Predictor — predicts continuation text when the user
 * pauses dictation, shown as faded "ghost" text in the transcript.
 * Uses the OllamaClient for streaming AI predictions.
 */

const DEFAULT_PAUSE_MS = 2500;
const MAX_PREDICT_TOKENS = 80;

export class GhostPredictor {
  /**
   * @param {import('./ollama-client.js').OllamaClient} aiClient
   * @param {object} options
   * @param {string}  [options.model]             Override model (defaults to client's first available)
   * @param {number}  [options.pauseThresholdMs]  Pause before predicting (default 2500)
   */
  constructor(aiClient, options = {}) {
    this.client = aiClient;
    this.model = options.model || null;
    this.pauseThresholdMs = options.pauseThresholdMs || DEFAULT_PAUSE_MS;
    this.enabled = true;
    this.currentPrediction = '';

    /** @type {function(string)|null} Called with ghost text when prediction arrives */
    this.onPrediction = null;
    /** @type {function()|null} Called when prediction is cleared */
    this.onClear = null;

    this._pauseTimer = null;
    this._abortController = null;
  }

  /**
   * Called on each STT final result — resets the pause timer.
   * After pauseThresholdMs of silence, triggers a prediction.
   * @param {string} currentTranscript  Full raw transcript so far
   * @param {string} template           Active prompt template name
   * @param {string} projectContext     Current project name (optional)
   */
  onActivity(currentTranscript, template = 'freeform', projectContext = '') {
    this.dismiss();
    clearTimeout(this._pauseTimer);

    if (!this.enabled || !this.client.connected) return;

    this._pauseTimer = setTimeout(() => {
      this._predict(currentTranscript, template, projectContext);
    }, this.pauseThresholdMs);
  }

  /**
   * Run the prediction against Ollama.
   * @private
   */
  async _predict(transcript, template, projectContext) {
    if (!transcript.trim()) return;

    this._abort();
    this._abortController = new AbortController();

    const model = this._getModel();
    if (!model) return;

    // Build a single prompt that includes the system instruction,
    // since OllamaClient.generate() doesn't take a separate system param.
    const systemInstruction = [
      'You are a dictation continuation predictor.',
      'Based on the user\'s dictation so far, predict what they are likely to say next.',
      'Return ONLY the predicted continuation text (1-2 sentences).',
      'No explanations, no quotes, no prefixes like "Predicted:" or "Continuation:".',
    ].join(' ');

    const contextLine = projectContext
      ? `The user is dictating a ${template} prompt for project: ${projectContext}.`
      : `The user is dictating a ${template} prompt.`;

    const prompt = [
      `System: ${systemInstruction}`,
      '',
      `Context: ${contextLine}`,
      '',
      'Dictation so far:',
      transcript,
      '',
      'Predicted continuation:',
    ].join('\n');

    try {
      let prediction = '';
      const systemPrompt = 'You are a dictation continuation predictor. Based on the user\'s dictation so far, predict what they are likely to say next. Return ONLY the predicted continuation text (1-2 sentences). No explanations.';
      for await (const { token, done } of this.client.generate(
        model,
        prompt,
        systemPrompt,
        { num_predict: MAX_PREDICT_TOKENS, temperature: 0.5, top_p: 0.85 },
        this._abortController.signal,
      )) {
        prediction += token;
        if (done) break;
      }

      prediction = prediction.trim();
      if (prediction && this._abortController && !this._abortController.signal.aborted) {
        this.currentPrediction = prediction;
        this.onPrediction?.(prediction);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Ghost prediction error:', e);
      }
    }
  }

  /**
   * Accept the current prediction — returns the text to append
   * to the transcript.
   * @returns {string}
   */
  accept() {
    const text = this.currentPrediction;
    this.currentPrediction = '';
    this.onClear?.();
    return text;
  }

  /**
   * Dismiss the current prediction without accepting.
   */
  dismiss() {
    this._abort();
    if (this.currentPrediction) {
      this.currentPrediction = '';
      this.onClear?.();
    }
  }

  /**
   * Enable or disable ghost predictions.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.dismiss();
  }

  /**
   * Update the pause threshold.
   * @param {number} ms
   */
  setPauseThreshold(ms) {
    this.pauseThresholdMs = Math.max(500, ms);
  }

  /**
   * Override the model used for predictions.
   * @param {string|null} model  Model name or null to auto-select
   */
  setModel(model) {
    this.model = model;
  }

  // ──────────────────────────────────────────
  // Internal
  // ──────────────────────────────────────────

  /**
   * Resolve which model to use for predictions.
   * @private
   * @returns {string|null}
   */
  _getModel() {
    if (this.model) return this.model;
    if (this.client.models && this.client.models.length > 0) {
      return this.client.models[0].name;
    }
    return null;
  }

  /**
   * Abort any in-flight prediction and clear the pause timer.
   * @private
   */
  _abort() {
    clearTimeout(this._pauseTimer);
    this._pauseTimer = null;
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }
}
