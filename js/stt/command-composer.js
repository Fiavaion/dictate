/**
 * Command Composer -- design custom compound voice commands with conditions
 * and multi-step execution.
 *
 * Each custom command has:
 *   - trigger phrase (what the user says)
 *   - steps: ordered actions to execute
 *   - conditions: optional guards that must all pass
 *
 * Persists to localStorage under STORAGE_KEY.
 */

const STORAGE_KEY = 'fiavaion-custom-commands';
const STEP_DELAY = 80; // ms between step execution

/** Valid action types for command steps */
export const ACTION_TYPES = ['command', 'text', 'template', 'copy', 'delay'];

/** Valid condition check types */
export const CONDITION_TYPES = ['hasText', 'templateIs', 'projectIs'];

export class CommandComposer {
  constructor() {
    /**
     * @type {Object.<string, {
     *   steps: Array<{action: string, value: string}>,
     *   conditions: Array<{check: string, value: string}>,
     *   created: number
     * }>}
     */
    this.commands = {};
    this._load();
  }

  /**
   * Create or update a custom compound command.
   * @param {string} trigger - the voice phrase that activates this command
   * @param {Array<{action: string, value: string}>} steps - actions to execute in order
   *   action: 'command' | 'text' | 'template' | 'copy' | 'delay'
   *   value: command phrase, text to insert, template name, copy target, or delay in ms
   * @param {Array<{check: string, value: string}>} [conditions=[]] - all must pass
   *   check: 'hasText' | 'templateIs' | 'projectIs'
   *   value: expected value for the check
   * @returns {boolean} true if saved
   */
  define(trigger, steps, conditions = []) {
    const key = _normalise(trigger);
    if (!key) return false;
    if (!Array.isArray(steps) || steps.length === 0) return false;

    // Validate step actions
    for (const step of steps) {
      if (!step || !ACTION_TYPES.includes(step.action)) return false;
      if (step.value == null) return false;
    }

    // Validate conditions (if any)
    if (!Array.isArray(conditions)) conditions = [];
    for (const cond of conditions) {
      if (!cond || !CONDITION_TYPES.includes(cond.check)) return false;
    }

    this.commands[key] = {
      steps: steps.map(s => ({ action: s.action, value: String(s.value) })),
      conditions: conditions.map(c => ({ check: c.check, value: String(c.value) })),
      created: this.commands[key]?.created || Date.now(),
    };

    this._save();
    return true;
  }

  /**
   * Execute a custom command by trigger phrase.
   * Checks conditions first; if any fail, execution is aborted.
   *
   * @param {string} trigger - the trigger phrase
   * @param {{rawTranscript?: string, template?: string, project?: string}} context
   *   Current app context for condition checks
   * @param {function({action: string, value: string}, number): Promise<void>|void} executeAction
   *   Callback to process each step. Receives (step, index).
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  async execute(trigger, context, executeAction) {
    const key = _normalise(trigger);
    const cmd = this.commands[key];
    if (!cmd) return { ok: false, reason: 'Command not found' };
    if (typeof executeAction !== 'function') return { ok: false, reason: 'No executor' };

    // Check conditions
    const condResult = this._checkConditions(cmd.conditions, context || {});
    if (!condResult.pass) {
      return { ok: false, reason: `Condition failed: ${condResult.failedCheck}` };
    }

    // Execute steps sequentially
    for (let i = 0; i < cmd.steps.length; i++) {
      const step = cmd.steps[i];

      // Built-in delay action
      if (step.action === 'delay') {
        const ms = parseInt(step.value, 10) || 200;
        await _delay(Math.min(ms, 5000)); // cap at 5 seconds
        continue;
      }

      await executeAction(step, i);

      // Small gap between steps for UI settling
      if (i < cmd.steps.length - 1) {
        await _delay(STEP_DELAY);
      }
    }

    return { ok: true };
  }

  /**
   * Check if an utterance matches a custom command trigger.
   * @param {string} utterance - the raw spoken text (will be normalised)
   * @returns {{trigger: string, command: object}|null}
   */
  tryMatch(utterance) {
    const key = _normalise(utterance);
    if (!key) return null;
    const cmd = this.commands[key];
    if (!cmd) return null;
    return { trigger: key, command: cmd };
  }

  /**
   * Return all custom commands as an array for UI rendering.
   * @returns {Array<{trigger: string, steps: Array, conditions: Array, created: number}>}
   */
  listCommands() {
    return Object.entries(this.commands)
      .map(([trigger, cmd]) => ({
        trigger,
        steps: cmd.steps,
        conditions: cmd.conditions,
        created: cmd.created,
      }))
      .sort((a, b) => b.created - a.created);
  }

  /**
   * Get a single command by trigger.
   * @param {string} trigger
   * @returns {object|null}
   */
  getCommand(trigger) {
    const key = _normalise(trigger);
    return this.commands[key] || null;
  }

  /**
   * Delete a custom command.
   * @param {string} trigger
   * @returns {boolean}
   */
  deleteCommand(trigger) {
    const key = _normalise(trigger);
    if (!this.commands[key]) return false;
    delete this.commands[key];
    this._save();
    return true;
  }

  /**
   * Rename a command's trigger phrase.
   * @param {string} oldTrigger
   * @param {string} newTrigger
   * @returns {boolean}
   */
  renameCommand(oldTrigger, newTrigger) {
    const oldKey = _normalise(oldTrigger);
    const newKey = _normalise(newTrigger);
    if (!oldKey || !newKey || oldKey === newKey) return false;
    if (!this.commands[oldKey]) return false;
    if (this.commands[newKey]) return false; // don't silently overwrite

    this.commands[newKey] = this.commands[oldKey];
    delete this.commands[oldKey];
    this._save();
    return true;
  }

  /**
   * Get the total number of custom commands.
   * @returns {number}
   */
  get count() {
    return Object.keys(this.commands).length;
  }

  // ── Condition Checking ─────────────────────

  /**
   * Evaluate a single condition against the current context.
   * @param {{check: string, value: string}} condition
   * @param {{rawTranscript?: string, template?: string, project?: string}} context
   * @returns {boolean}
   * @private
   */
  _checkCondition(condition, context) {
    if (!condition || !condition.check) return true;

    switch (condition.check) {
      case 'hasText':
        // Pass if rawTranscript contains the value (case-insensitive)
        return (context.rawTranscript || '').toLowerCase().includes(
          (condition.value || '').toLowerCase()
        );

      case 'templateIs':
        // Pass if the current template matches (case-insensitive)
        return (context.template || '').toLowerCase() ===
               (condition.value || '').toLowerCase();

      case 'projectIs':
        // Pass if the current project matches (case-insensitive)
        return (context.project || '').toLowerCase() ===
               (condition.value || '').toLowerCase();

      default:
        return true;
    }
  }

  /**
   * Check all conditions -- all must pass (AND logic).
   * @param {Array<{check: string, value: string}>} conditions
   * @param {object} context
   * @returns {{pass: boolean, failedCheck?: string}}
   * @private
   */
  _checkConditions(conditions, context) {
    if (!conditions || conditions.length === 0) return { pass: true };

    for (const cond of conditions) {
      if (!this._checkCondition(cond, context)) {
        return { pass: false, failedCheck: `${cond.check}: "${cond.value}"` };
      }
    }
    return { pass: true };
  }

  // ── Persistence ────────────────────────────

  /** @private */
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commands));
    } catch { /* storage full -- degrade gracefully */ }
  }

  /** @private */
  _load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (data && typeof data === 'object') {
        this.commands = data;
      }
    } catch {
      this.commands = {};
    }
  }
}

// ── Helpers ─────────────────────────────────

/**
 * Normalise a trigger phrase: lowercase, collapse whitespace, trim.
 * @param {string} s
 * @returns {string}
 */
function _normalise(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Promise-based delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
