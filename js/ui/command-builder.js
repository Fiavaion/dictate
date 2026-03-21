/**
 * Command Builder Modal -- visual UI for building custom compound voice commands.
 * Uses the `.folder-modal-overlay` / `.folder-modal` pattern from the folder browser.
 *
 * Provides drag-to-reorder step cards, condition cards, test and save buttons.
 * Injects its own scoped styles on first open.
 */

import { ACTION_TYPES, CONDITION_TYPES } from '../stt/command-composer.js';

/** Human-readable labels for action types */
const ACTION_LABELS = {
  command:  'Command',
  text:     'Insert Text',
  template: 'Set Template',
  copy:     'Copy',
  delay:    'Delay (ms)',
};

/** Human-readable labels for condition types */
const CONDITION_LABELS = {
  hasText:    'Has Text',
  templateIs: 'Template Is',
  projectIs:  'Project Is',
};

/** Placeholder hints per action type */
const ACTION_HINTS = {
  command:  'e.g. delete last word',
  text:     'Text to insert...',
  template: 'e.g. email, bug-report',
  copy:     'raw | refined | structured',
  delay:    'Milliseconds (max 5000)',
};

/** Placeholder hints per condition type */
const CONDITION_HINTS = {
  hasText:    'Text that must be present...',
  templateIs: 'Template name...',
  projectIs:  'Project name...',
};

export class CommandBuilderModal {
  /**
   * @param {import('../stt/command-composer.js').CommandComposer} commandComposer
   */
  constructor(commandComposer) {
    this._composer = commandComposer;
    this._el = null;
    this._stylesInjected = false;

    /** @type {?function(string, object): void} callback(trigger, command) */
    this.onSave = null;
    /** @type {?function(object): void} callback(command) to test-run */
    this.onTest = null;

    // Internal editing state
    this._trigger = '';
    this._steps = [];       // [{action, value}]
    this._conditions = [];  // [{check, value}]
    this._editingTrigger = null; // non-null when editing an existing command
    this._dragIdx = -1;
  }

  /**
   * Open the modal. If a trigger is provided, load that command for editing.
   * @param {string|null} [trigger=null]
   */
  open(trigger = null) {
    this._injectStyles();

    // Load existing command or start fresh
    if (trigger) {
      const cmd = this._composer.getCommand(trigger);
      if (cmd) {
        this._trigger = trigger;
        this._steps = cmd.steps.map(s => ({ ...s }));
        this._conditions = cmd.conditions.map(c => ({ ...c }));
        this._editingTrigger = trigger;
      } else {
        this._resetFields();
        this._trigger = trigger;
      }
    } else {
      this._resetFields();
    }

    this.render();
    document.body.appendChild(this._el);
  }

  /** Close and remove the modal from the DOM. */
  close() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }

  /** Build the full modal DOM and attach event listeners. */
  render() {
    // Remove old element if present
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }

    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay cmd-builder-overlay';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });

    overlay.innerHTML = `
      <div class="folder-modal cmd-builder-modal">
        <div class="folder-modal-header">
          <span class="folder-modal-title">${this._editingTrigger ? 'EDIT COMMAND' : 'NEW COMMAND'}</span>
          <button class="folder-modal-close cmd-builder-close">&times;</button>
        </div>

        <div class="cmd-builder-body">
          <!-- Trigger phrase -->
          <div class="cmd-builder-section">
            <label class="cmd-builder-label">TRIGGER PHRASE</label>
            <input type="text" class="cmd-builder-input cmd-builder-trigger"
              placeholder="What you say to activate this command..."
              value="${_escAttr(this._trigger)}" />
          </div>

          <!-- Steps -->
          <div class="cmd-builder-section">
            <div class="cmd-builder-section-header">
              <label class="cmd-builder-label">STEPS</label>
              <button class="cmd-builder-add-btn cmd-builder-add-step">+ STEP</button>
            </div>
            <div class="cmd-builder-steps-list"></div>
          </div>

          <!-- Conditions -->
          <div class="cmd-builder-section">
            <div class="cmd-builder-section-header">
              <label class="cmd-builder-label">CONDITIONS <span class="cmd-builder-hint">(optional)</span></label>
              <button class="cmd-builder-add-btn cmd-builder-add-cond">+ CONDITION</button>
            </div>
            <div class="cmd-builder-conditions-list"></div>
          </div>
        </div>

        <div class="folder-modal-footer">
          <button class="btn-secondary cmd-builder-test-btn">TEST</button>
          <button class="btn-secondary cmd-builder-save-btn" style="border-color:var(--accent2);color:var(--accent2)">SAVE</button>
          <button class="btn-secondary cmd-builder-close-btn">CLOSE</button>
        </div>
      </div>
    `;

    this._el = overlay;

    // Wire up buttons
    overlay.querySelector('.cmd-builder-close').addEventListener('click', () => this.close());
    overlay.querySelector('.cmd-builder-close-btn').addEventListener('click', () => this.close());
    overlay.querySelector('.cmd-builder-save-btn').addEventListener('click', () => this._save());
    overlay.querySelector('.cmd-builder-test-btn').addEventListener('click', () => this._test());
    overlay.querySelector('.cmd-builder-add-step').addEventListener('click', () => {
      this._steps.push({ action: 'command', value: '' });
      this._renderSteps();
    });
    overlay.querySelector('.cmd-builder-add-cond').addEventListener('click', () => {
      this._conditions.push({ check: 'hasText', value: '' });
      this._renderConditions();
    });

    // Initial render of dynamic lists
    this._renderSteps();
    this._renderConditions();
  }

  // ── Dynamic List Rendering ─────────────────

  /** Render the steps list with drag-reorder and remove buttons. */
  _renderSteps() {
    const container = this._el.querySelector('.cmd-builder-steps-list');
    container.innerHTML = '';

    if (this._steps.length === 0) {
      container.innerHTML = '<div class="cmd-builder-empty">No steps yet. Add one above.</div>';
      return;
    }

    this._steps.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'cmd-builder-card';
      card.draggable = true;
      card.dataset.idx = idx;

      // Drag events
      card.addEventListener('dragstart', e => {
        this._dragIdx = idx;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this._dragIdx = -1;
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (this._dragIdx >= 0 && this._dragIdx !== idx) {
          const moved = this._steps.splice(this._dragIdx, 1)[0];
          this._steps.splice(idx, 0, moved);
          this._renderSteps();
        }
      });

      // Action type dropdown
      const select = document.createElement('select');
      select.className = 'cmd-builder-select';
      for (const type of ACTION_TYPES) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = ACTION_LABELS[type] || type;
        if (type === step.action) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this._steps[idx].action = select.value;
        // Update placeholder
        input.placeholder = ACTION_HINTS[select.value] || '';
      });

      // Value input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cmd-builder-input';
      input.value = step.value;
      input.placeholder = ACTION_HINTS[step.action] || '';
      input.addEventListener('input', () => {
        this._steps[idx].value = input.value;
      });

      // Drag handle
      const handle = document.createElement('span');
      handle.className = 'cmd-builder-handle';
      handle.textContent = '\u2261'; // triple bar

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'cmd-builder-remove';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove step';
      removeBtn.addEventListener('click', () => {
        this._steps.splice(idx, 1);
        this._renderSteps();
      });

      card.appendChild(handle);
      card.appendChild(select);
      card.appendChild(input);
      card.appendChild(removeBtn);
      container.appendChild(card);
    });
  }

  /** Render the conditions list with add/remove. */
  _renderConditions() {
    const container = this._el.querySelector('.cmd-builder-conditions-list');
    container.innerHTML = '';

    if (this._conditions.length === 0) {
      container.innerHTML = '<div class="cmd-builder-empty">No conditions. Command runs unconditionally.</div>';
      return;
    }

    this._conditions.forEach((cond, idx) => {
      const card = document.createElement('div');
      card.className = 'cmd-builder-card cmd-builder-cond-card';

      // Condition type dropdown
      const select = document.createElement('select');
      select.className = 'cmd-builder-select';
      for (const type of CONDITION_TYPES) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = CONDITION_LABELS[type] || type;
        if (type === cond.check) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this._conditions[idx].check = select.value;
        input.placeholder = CONDITION_HINTS[select.value] || '';
      });

      // Value input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cmd-builder-input';
      input.value = cond.value;
      input.placeholder = CONDITION_HINTS[cond.check] || '';
      input.addEventListener('input', () => {
        this._conditions[idx].value = input.value;
      });

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'cmd-builder-remove';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove condition';
      removeBtn.addEventListener('click', () => {
        this._conditions.splice(idx, 1);
        this._renderConditions();
      });

      card.appendChild(select);
      card.appendChild(input);
      card.appendChild(removeBtn);
      container.appendChild(card);
    });
  }

  // ── Actions ─────────────────────────────────

  /**
   * Collect current UI fields into a command object.
   * @returns {{trigger: string, steps: Array, conditions: Array}|null}
   */
  _buildFromUI() {
    // Read trigger from live input
    const triggerInput = this._el.querySelector('.cmd-builder-trigger');
    const trigger = (triggerInput?.value || '').trim();
    if (!trigger) return null;

    // Filter out empty steps
    const steps = this._steps.filter(s => s.value.trim() || s.action === 'delay');
    if (steps.length === 0) return null;

    // Filter out empty conditions
    const conditions = this._conditions.filter(c => c.value.trim());

    return { trigger, steps, conditions };
  }

  /** Save the command via CommandComposer. */
  _save() {
    const built = this._buildFromUI();
    if (!built) {
      _flashError(this._el, 'Trigger and at least one step required.');
      return;
    }

    // If editing and trigger changed, remove the old one
    if (this._editingTrigger && this._editingTrigger !== built.trigger.toLowerCase()) {
      this._composer.deleteCommand(this._editingTrigger);
    }

    const ok = this._composer.define(built.trigger, built.steps, built.conditions);
    if (!ok) {
      _flashError(this._el, 'Invalid command definition.');
      return;
    }

    this._editingTrigger = built.trigger.toLowerCase();
    this.onSave?.(built.trigger, this._composer.getCommand(built.trigger));
    _flashSuccess(this._el, 'Command saved.');
  }

  /** Test-run the command without saving. */
  _test() {
    const built = this._buildFromUI();
    if (!built) {
      _flashError(this._el, 'Build a command first.');
      return;
    }
    this.onTest?.({
      steps: built.steps,
      conditions: built.conditions,
    });
  }

  /** Reset fields to empty state. */
  _resetFields() {
    this._trigger = '';
    this._steps = [{ action: 'command', value: '' }]; // start with one empty step
    this._conditions = [];
    this._editingTrigger = null;
  }

  // ── Style Injection ─────────────────────────

  /** Inject scoped CSS for the command builder (once). */
  _injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      /* ── Command Builder Modal ── */
      .cmd-builder-modal {
        width: 580px;
        max-width: 94vw;
        max-height: 85vh;
      }
      .cmd-builder-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
      }
      .cmd-builder-body::-webkit-scrollbar { width: 4px; }
      .cmd-builder-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

      .cmd-builder-section {}
      .cmd-builder-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .cmd-builder-label {
        font-family: var(--mono);
        font-size: 0.58rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--ai-glow);
        display: block;
        margin-bottom: 6px;
      }
      .cmd-builder-section-header .cmd-builder-label {
        margin-bottom: 0;
      }
      .cmd-builder-hint {
        color: var(--dim);
        font-size: 0.52rem;
        letter-spacing: 0.1em;
      }

      .cmd-builder-input {
        width: 100%;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--text);
        font-family: var(--mono);
        font-size: 0.72rem;
        padding: 8px 10px;
        border-radius: 3px;
        outline: none;
        transition: border-color 0.2s;
      }
      .cmd-builder-input:focus {
        border-color: var(--ai-glow);
      }
      .cmd-builder-input::placeholder {
        color: var(--dim);
        font-size: 0.65rem;
      }

      .cmd-builder-add-btn {
        font-family: var(--mono);
        font-size: 0.55rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent2);
        background: none;
        border: 1px solid color-mix(in srgb, var(--accent2) 40%, var(--border));
        padding: 3px 10px;
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .cmd-builder-add-btn:hover {
        background: color-mix(in srgb, var(--accent2) 8%, transparent);
        border-color: var(--accent2);
      }

      /* Step / Condition cards */
      .cmd-builder-card {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 3px;
        margin-bottom: 6px;
        transition: border-color 0.15s, background 0.15s;
      }
      .cmd-builder-card:hover {
        border-color: var(--muted);
      }
      .cmd-builder-card.dragging {
        opacity: 0.5;
        border-color: var(--ai-glow);
      }
      .cmd-builder-card.drag-over {
        border-color: var(--accent2);
        background: color-mix(in srgb, var(--accent2) 5%, var(--surface));
      }
      .cmd-builder-card .cmd-builder-input {
        flex: 1;
        min-width: 0;
        padding: 5px 8px;
        font-size: 0.68rem;
      }

      .cmd-builder-handle {
        cursor: grab;
        color: var(--dim);
        font-size: 1rem;
        line-height: 1;
        padding: 0 2px;
        user-select: none;
        flex-shrink: 0;
      }
      .cmd-builder-handle:active { cursor: grabbing; }

      .cmd-builder-select {
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        font-family: var(--mono);
        font-size: 0.6rem;
        letter-spacing: 0.05em;
        padding: 5px 6px;
        border-radius: 3px;
        cursor: pointer;
        outline: none;
        flex-shrink: 0;
        min-width: 100px;
      }
      .cmd-builder-select:focus { border-color: var(--muted); }

      .cmd-builder-remove {
        background: none;
        border: none;
        color: var(--dim);
        font-size: 1rem;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.15s;
        flex-shrink: 0;
      }
      .cmd-builder-remove:hover { color: var(--danger); }

      .cmd-builder-empty {
        font-family: var(--body);
        font-size: 0.72rem;
        color: var(--dim);
        font-style: italic;
        padding: 8px 4px;
      }

      /* Condition cards -- slightly different accent */
      .cmd-builder-cond-card {
        border-left: 2px solid color-mix(in srgb, var(--warning) 40%, var(--border));
      }

      /* Flash messages */
      .cmd-builder-flash {
        position: absolute;
        bottom: 56px;
        left: 16px;
        right: 16px;
        font-family: var(--mono);
        font-size: 0.62rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 6px 12px;
        border-radius: 3px;
        text-align: center;
        z-index: 10;
        animation: cmdBuilderFlashIn 0.2s ease-out, cmdBuilderFlashOut 0.3s 1.5s ease-in forwards;
        pointer-events: none;
      }
      .cmd-builder-flash.success {
        background: color-mix(in srgb, var(--success) 15%, var(--panel));
        border: 1px solid var(--success);
        color: var(--success);
      }
      .cmd-builder-flash.error {
        background: color-mix(in srgb, var(--danger) 15%, var(--panel));
        border: 1px solid var(--danger);
        color: var(--danger);
      }
      @keyframes cmdBuilderFlashIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes cmdBuilderFlashOut {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ── Helpers ─────────────────────────────────

function _escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _flashMessage(el, msg, cls) {
  if (!el) return;
  // Remove previous flash
  const prev = el.querySelector('.cmd-builder-flash');
  if (prev) prev.remove();

  const modal = el.querySelector('.cmd-builder-modal');
  if (!modal) return;

  const flash = document.createElement('div');
  flash.className = `cmd-builder-flash ${cls}`;
  flash.textContent = msg;
  modal.style.position = 'relative';
  modal.appendChild(flash);

  // Auto-remove after animation
  setTimeout(() => flash.remove(), 2000);
}

function _flashSuccess(el, msg) { _flashMessage(el, msg, 'success'); }
function _flashError(el, msg)   { _flashMessage(el, msg, 'error'); }
