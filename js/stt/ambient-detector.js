/**
 * Ambient Sound Detector — frequency-band classifier
 * Analyzes the existing AnalyserNode (from the VU meter) to classify
 * ambient audio as speech, typing, noise, or silence.
 *
 * Key insight: keyboard clicks concentrate energy in the 2–8 kHz range,
 * while human speech fundamentals sit in 80–3000 Hz. Comparing energy
 * ratios between these bands lets us distinguish the two without ML.
 */

export class AmbientDetector {
  constructor(options = {}) {
    this.analyser = null;          // set via setAnalyser()
    this.enabled = true;
    this.state = 'idle';           // 'idle' | 'speech' | 'typing' | 'noise'
    this.onStateChange = null;     // callback(newState, oldState)

    this._animFrame = null;
    this._dataArray = null;        // reusable Uint8Array for frequency data
    this._rollingAvg = { speech: 0, typing: 0 };

    // Tuning parameters — can be overridden via options
    this._speechFreqLow   = options.speechFreqLow   ?? 80;    // Hz — voice fundamental
    this._speechFreqHigh  = options.speechFreqHigh  ?? 3000;  // Hz
    this._typingFreqLow   = options.typingFreqLow   ?? 2000;  // Hz — keyboard click energy
    this._typingFreqHigh  = options.typingFreqHigh  ?? 8000;  // Hz
    this._silenceThreshold = options.silenceThreshold ?? 10;   // min energy to register
    this._typingRatio     = options.typingRatio     ?? 1.5;   // typing must exceed speech by this factor
    this._smoothing       = options.smoothing       ?? 0.85;  // rolling average factor (0–1)

    // Sustained-classification guards — prevent flickering
    this._typingSustainMs  = options.typingSustainMs  ?? 500;  // must sustain to confirm typing
    this._speechSustainMs  = options.speechSustainMs  ?? 200;  // shorter: speech should feel instant
    this._candidateState   = null;
    this._candidateSince   = 0;

    // Debug hook — called every frame with raw numbers
    this.onDebugFrame = null;      // (data: { speechEnergy, typingEnergy, state }) => void
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Attach the AnalyserNode created by the VU meter in app.js.
   * Must be called before start().
   */
  setAnalyser(analyserNode) {
    this.analyser = analyserNode;
    // Pre-allocate the typed array once
    if (analyserNode) {
      this._dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    }
  }

  /**
   * Begin the detection loop (requestAnimationFrame-based).
   * No-op if no analyser is attached.
   */
  start() {
    if (!this.analyser) return;
    this._resetRolling();
    this._detect();
  }

  /**
   * Stop the detection loop and reset state to idle.
   */
  stop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    this._candidateState = null;
    this._candidateSince = 0;
    this._setState('idle');
  }

  /**
   * Enable or disable detection at runtime.
   * When disabled, the loop continues but skips classification.
   */
  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) {
      this._resetRolling();
      this._setState('idle');
    }
  }

  /**
   * Reset rolling averages and candidate tracking.
   * Useful when the audio source changes.
   */
  reset() {
    this._resetRolling();
    this._candidateState = null;
    this._candidateSince = 0;
    this._setState('idle');
  }

  // ── Internal: detection loop ──────────────────────────────────

  _detect() {
    if (!this.analyser) return;

    if (this.enabled) {
      this.analyser.getByteFrequencyData(this._dataArray);

      const sampleRate = this.analyser.context.sampleRate;
      const binHz = sampleRate / (this.analyser.fftSize || 2048);

      // Calculate energy in each frequency band
      const speechEnergy = this._bandEnergy(this._dataArray, binHz,
        this._speechFreqLow, this._speechFreqHigh);
      const typingEnergy = this._bandEnergy(this._dataArray, binHz,
        this._typingFreqLow, this._typingFreqHigh);

      // Smooth with exponential rolling average
      this._rollingAvg.speech =
        this._rollingAvg.speech * this._smoothing + speechEnergy * (1 - this._smoothing);
      this._rollingAvg.typing =
        this._rollingAvg.typing * this._smoothing + typingEnergy * (1 - this._smoothing);

      // Classify based on smoothed values
      this._classify();

      // Debug hook
      this.onDebugFrame?.({
        speechEnergy: this._rollingAvg.speech,
        typingEnergy: this._rollingAvg.typing,
        state: this.state
      });
    }

    this._animFrame = requestAnimationFrame(() => this._detect());
  }

  // ── Internal: frequency analysis ──────────────────────────────

  /**
   * Sum and normalize frequency bin amplitudes within a Hz range.
   * Returns average amplitude (0–255 scale) across the band.
   */
  _bandEnergy(dataArray, binHz, lowHz, highHz) {
    const lowBin  = Math.floor(lowHz / binHz);
    const highBin = Math.min(Math.ceil(highHz / binHz), dataArray.length - 1);
    if (highBin <= lowBin) return 0;

    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += dataArray[i];
    }
    return sum / (highBin - lowBin + 1);
  }

  // ── Internal: classification ──────────────────────────────────

  /**
   * Determine the ambient sound category from smoothed energy bands.
   * Uses a sustained-candidate approach to avoid rapid flickering.
   */
  _classify() {
    const { speech, typing } = this._rollingAvg;
    const threshold = this._silenceThreshold;

    let raw;
    if (speech < threshold && typing < threshold) {
      raw = 'idle';
    } else if (typing > speech * this._typingRatio && typing > threshold) {
      raw = 'typing';
    } else if (speech > threshold) {
      raw = 'speech';
    } else {
      raw = 'noise';
    }

    // Idle transitions are instant (no sustain needed)
    if (raw === 'idle') {
      this._candidateState = null;
      this._candidateSince = 0;
      this._setState('idle');
      return;
    }

    // For non-idle states, require sustained classification
    const now = performance.now();

    if (raw !== this._candidateState) {
      // New candidate — start the sustain timer
      this._candidateState = raw;
      this._candidateSince = now;
      return;
    }

    // Same candidate — check if sustained long enough
    const requiredMs = raw === 'typing' ? this._typingSustainMs : this._speechSustainMs;
    if (now - this._candidateSince >= requiredMs) {
      this._setState(raw);
    }
  }

  // ── Internal: state management ────────────────────────────────

  /**
   * Transition to a new state, firing the callback if changed.
   */
  _setState(newState) {
    if (newState === this.state) return;
    const oldState = this.state;
    this.state = newState;
    this.onStateChange?.(newState, oldState);
  }

  /**
   * Zero out the rolling averages.
   */
  _resetRolling() {
    this._rollingAvg.speech = 0;
    this._rollingAvg.typing = 0;
  }
}
