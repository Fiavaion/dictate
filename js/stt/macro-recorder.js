/**
 * Macro Recorder -- record sequences of voice commands + text as named macros,
 * replay with a single trigger. Like Vim's `q` register for voice.
 *
 * Persists to localStorage under STORAGE_KEY.
 */

const STORAGE_KEY = 'fiavaion-macros';
const REPLAY_STEP_DELAY = 100; // ms between replayed steps

export class MacroRecorder {
  constructor() {
    /** @type {Object.<string, {steps: Array<{type: string, value: string}>, created: number, usageCount: number}>} */
    this.macros = {};
    this.isRecording = false;
    this.recordingName = '';
    this._currentSteps = [];

    // Callbacks -- set by the app controller
    /** @type {?function(string): void} */
    this.onRecordStart = null;
    /** @type {?function(string, object): void} */
    this.onRecordStop = null;
    /** @type {?function(string): void} */
    this.onPlayStart = null;
    /** @type {?function(object, number): void} */
    this.onPlayStep = null;
    /** @type {?function(string): void} */
    this.onPlayDone = null;

    this._load();
  }

  /**
   * Start recording a new macro with the given name.
   * If a macro with that name exists it will be overwritten on stop.
   * @param {string} name - macro identifier (case-insensitive, stored lowercase)
   * @returns {boolean} true if recording started
   */
  startRecording(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return false;
    if (this.isRecording) return false;

    this.isRecording = true;
    this.recordingName = key;
    this._currentSteps = [];
    this.onRecordStart?.(key);
    return true;
  }

  /**
   * Stop the current recording and persist the macro.
   * @returns {object|null} the saved macro object, or null if nothing was recording
   */
  stopRecording() {
    if (!this.isRecording) return null;

    const name = this.recordingName;
    const macro = {
      steps: [...this._currentSteps],
      created: Date.now(),
      usageCount: 0,
    };

    // Only save non-empty macros
    if (macro.steps.length > 0) {
      this.macros[name] = macro;
      this._save();
    }

    this.isRecording = false;
    this.recordingName = '';
    this._currentSteps = [];
    this.onRecordStop?.(name, macro);
    return macro;
  }

  /**
   * Add a step to the current recording.
   * Called by the app whenever a command or text utterance occurs during recording.
   * @param {'command'|'text'} type
   * @param {string} value - the command phrase or dictated text
   */
  recordStep(type, value) {
    if (!this.isRecording) return;
    if (!value || !value.trim()) return;
    this._currentSteps.push({ type, value: value.trim() });
  }

  /**
   * Replay all steps in a named macro with a small delay between each.
   * @param {string} name - macro name
   * @param {function({type: string, value: string}, number): Promise<void>|void} executeStep
   *   Callback that processes each step. Receives the step and its 0-based index.
   * @returns {Promise<boolean>} resolves true when playback finishes, false if macro not found
   */
  async playMacro(name, executeStep) {
    const key = (name || '').trim().toLowerCase();
    const macro = this.macros[key];
    if (!macro || !macro.steps.length) return false;
    if (typeof executeStep !== 'function') return false;

    this.onPlayStart?.(key);

    macro.usageCount = (macro.usageCount || 0) + 1;
    this._save();

    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      this.onPlayStep?.(step, i);
      await executeStep(step, i);
      // Small delay between steps so the UI can settle
      if (i < macro.steps.length - 1) {
        await _delay(REPLAY_STEP_DELAY);
      }
    }

    this.onPlayDone?.(key);
    return true;
  }

  /**
   * List all saved macros with summary info.
   * @returns {Array<{name: string, stepCount: number, created: number, usageCount: number}>}
   */
  listMacros() {
    return Object.entries(this.macros)
      .map(([name, m]) => ({
        name,
        stepCount: m.steps.length,
        created: m.created,
        usageCount: m.usageCount || 0,
      }))
      .sort((a, b) => b.created - a.created);
  }

  /**
   * Check if a macro with the given name exists.
   * @param {string} name
   * @returns {boolean}
   */
  hasMacro(name) {
    return !!(name && this.macros[(name || '').trim().toLowerCase()]);
  }

  /**
   * Get the full macro object (steps, created, usageCount).
   * @param {string} name
   * @returns {object|null}
   */
  getMacro(name) {
    const key = (name || '').trim().toLowerCase();
    return this.macros[key] || null;
  }

  /**
   * Delete a macro by name.
   * @param {string} name
   * @returns {boolean} true if something was deleted
   */
  deleteMacro(name) {
    const key = (name || '').trim().toLowerCase();
    if (!this.macros[key]) return false;
    delete this.macros[key];
    this._save();
    return true;
  }

  /**
   * Rename a macro. Overwrites the target if it already exists.
   * @param {string} oldName
   * @param {string} newName
   * @returns {boolean}
   */
  renameMacro(oldName, newName) {
    const oldKey = (oldName || '').trim().toLowerCase();
    const newKey = (newName || '').trim().toLowerCase();
    if (!oldKey || !newKey || oldKey === newKey) return false;
    if (!this.macros[oldKey]) return false;

    this.macros[newKey] = this.macros[oldKey];
    delete this.macros[oldKey];
    this._save();
    return true;
  }

  /**
   * Cancel an in-progress recording without saving.
   * @returns {boolean} true if a recording was cancelled
   */
  cancelRecording() {
    if (!this.isRecording) return false;
    this.isRecording = false;
    this.recordingName = '';
    this._currentSteps = [];
    return true;
  }

  /**
   * Return the number of steps recorded so far (during active recording).
   * @returns {number}
   */
  get recordedStepCount() {
    return this._currentSteps.length;
  }

  // ── Persistence ─────────────────────────────

  /** @private */
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.macros));
    } catch { /* storage full -- degrade gracefully */ }
  }

  /** @private */
  _load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (data && typeof data === 'object') {
        this.macros = data;
      }
    } catch {
      this.macros = {};
    }
  }
}

// ── Helpers ─────────────────────────────────

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
