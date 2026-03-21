/**
 * Prompt Builder — Visual Template Editor Modal
 * Provides a drag-and-drop interface for building and customizing
 * prompt templates with live AI preview.
 */

import { getAllTemplates, saveCustomTemplate } from '../ai/prompt-templates.js';

const SECTION_META = {
  systemPrompt: {
    title: 'System Prompt',
    placeholder: 'Define the AI role/persona for this template...',
    field: 'systemPrompt',
  },
  instruction: {
    title: 'Instruction',
    placeholder: 'Main instruction text — what the AI should do with the input...',
    field: 'instruction',
  },
  examples: {
    title: 'Few-Shot Examples',
    field: 'examples',
  },
  constraints: {
    title: 'Output Constraints',
    placeholder: 'Format rules, length limits, required sections...',
    field: 'constraints',
  },
  parameters: {
    title: 'Parameters',
    field: 'parameters',
  },
};

export class PromptBuilder {
  /**
   * @param {import('../ai/ollama-client.js').OllamaClient} aiClient
   */
  constructor(aiClient) {
    this._client = aiClient;
    this._el = null;
    this._editingKey = null;
    this._sections = ['systemPrompt', 'instruction', 'examples', 'constraints', 'parameters'];
    this._sectionOrder = [...this._sections];
    this._collapsed = new Set();
    this._abortController = null;
    this._testing = false;
    this._stylesInjected = false;

    /** @type {((key: string, template: object) => void) | null} */
    this.onSave = null;
  }

  // ──────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────

  /**
   * Open the builder modal, optionally loading an existing template.
   * @param {string|null} templateKey
   */
  open(templateKey = null) {
    this._editingKey = templateKey;
    this._sectionOrder = [...this._sections];
    this._collapsed.clear();
    this._injectStyles();
    this.render();

    // Always populate the template selector
    this._renderTemplateSelector();

    // Load template data into fields
    const loadKey = templateKey || null;
    if (loadKey) {
      const all = getAllTemplates();
      const t = all[loadKey];
      if (t) {
        this._populateFromTemplate(loadKey, t);
        // Select it in the dropdown
        if (this._templateSelect) this._templateSelect.value = loadKey;
      }
    }

    document.body.appendChild(this._el);
  }

  /** Close and remove the modal. */
  close() {
    this._cancelTest();
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────

  /** Build the full modal DOM. */
  render() {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay prompt-builder-overlay';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });

    // Modal container
    const modal = document.createElement('div');
    modal.className = 'folder-modal';
    overlay.appendChild(modal);

    // Header
    modal.appendChild(this._renderHeader());

    // Body: sections + preview
    const body = document.createElement('div');
    body.className = 'prompt-builder-body';

    this._sectionsEl = document.createElement('div');
    this._sectionsEl.className = 'prompt-builder-sections';
    this._renderSections();
    body.appendChild(this._sectionsEl);

    body.appendChild(this._renderPreview());
    modal.appendChild(body);

    // Footer
    modal.appendChild(this._renderFooter());

    this._el = overlay;
    this._setupDragDrop();
  }

  // ──────────────────────────────────────────
  // Header
  // ──────────────────────────────────────────

  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'prompt-builder-header';

    // Template selector row
    const selectorRow = document.createElement('div');
    selectorRow.className = 'pb-selector-row';

    const selectorLabel = document.createElement('span');
    selectorLabel.className = 'pb-selector-label';
    selectorLabel.textContent = 'LOAD TEMPLATE';
    selectorRow.appendChild(selectorLabel);

    this._templateSelect = document.createElement('select');
    this._templateSelect.className = 'pb-template-select';
    selectorRow.appendChild(this._templateSelect);

    header.appendChild(selectorRow);

    // Name input row
    const nameRow = document.createElement('div');
    nameRow.className = 'pb-name-row';

    this._nameInput = document.createElement('input');
    this._nameInput.type = 'text';
    this._nameInput.className = 'pb-name-input';
    this._nameInput.placeholder = 'Template Name';
    this._nameInput.addEventListener('input', () => this._updateKeyBadge());
    nameRow.appendChild(this._nameInput);

    // Key badge
    this._keyBadge = document.createElement('span');
    this._keyBadge.className = 'pb-key-badge';
    this._keyBadge.textContent = 'key: ...';
    nameRow.appendChild(this._keyBadge);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'folder-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());
    nameRow.appendChild(closeBtn);

    header.appendChild(nameRow);

    return header;
  }

  /** Populate the template dropdown and wire change handler. */
  _renderTemplateSelector() {
    if (!this._templateSelect) return;

    const all = getAllTemplates();
    this._templateSelect.innerHTML = '';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— New blank template —';
    this._templateSelect.appendChild(blank);

    for (const [key, tmpl] of Object.entries(all)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = tmpl.label || key;
      this._templateSelect.appendChild(opt);
    }

    this._templateSelect.addEventListener('change', () => {
      const key = this._templateSelect.value;
      if (!key) {
        // Reset to blank
        this._editingKey = null;
        this._clearFields();
        return;
      }
      const tmpl = all[key];
      if (tmpl) {
        this._editingKey = key;
        this._populateFromTemplate(key, tmpl);
      }
    });
  }

  /** Clear all fields to blank state. */
  _clearFields() {
    this._nameInput.value = '';
    this._updateKeyBadge();
    if (!this._sectionsEl) return;

    // Clear textareas
    this._sectionsEl.querySelectorAll('textarea[data-field]').forEach(ta => { ta.value = ''; });

    // Clear examples
    const list = this._sectionsEl.querySelector('.pb-examples-list');
    if (list) list.innerHTML = '';

    // Reset sliders
    const tempSlider = this._sectionsEl.querySelector('input[data-param="temperature"]');
    const tokSlider = this._sectionsEl.querySelector('input[data-param="maxTokens"]');
    if (tempSlider) {
      tempSlider.value = '0.3';
      const v = tempSlider.parentElement.querySelector('.pb-slider-value');
      if (v) v.textContent = '0.3';
    }
    if (tokSlider) {
      tokSlider.value = '800';
      const v = tokSlider.parentElement.querySelector('.pb-slider-value');
      if (v) v.textContent = '800';
    }
  }

  _updateKeyBadge() {
    const slug = this._slugify(this._nameInput.value);
    this._keyBadge.textContent = slug ? `key: ${slug}` : 'key: ...';
  }

  _slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ──────────────────────────────────────────
  // Sections (left column)
  // ──────────────────────────────────────────

  /** Render all section cards in current order. */
  _renderSections() {
    this._sectionsEl.innerHTML = '';
    for (const sectionId of this._sectionOrder) {
      this._sectionsEl.appendChild(this._renderCard(sectionId));
    }
  }

  /** Create a single draggable section card. */
  _renderCard(sectionId) {
    const meta = SECTION_META[sectionId];
    const card = document.createElement('div');
    card.className = 'pb-section-card';
    card.dataset.section = sectionId;
    card.draggable = true;

    // Header row
    const header = document.createElement('div');
    header.className = 'pb-card-header';

    const handle = document.createElement('span');
    handle.className = 'pb-drag-handle';
    handle.textContent = '\u2261'; // ≡
    handle.title = 'Drag to reorder';
    header.appendChild(handle);

    const title = document.createElement('span');
    title.className = 'pb-section-title';
    title.textContent = meta.title;
    header.appendChild(title);

    const toggle = document.createElement('button');
    toggle.className = 'pb-collapse-toggle';
    toggle.textContent = '\u25BC'; // ▼
    if (this._collapsed.has(sectionId)) toggle.classList.add('collapsed');
    header.appendChild(toggle);

    header.addEventListener('click', e => {
      if (e.target === handle) return; // let drag handle work
      this._toggleCollapse(sectionId, card);
    });

    card.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'pb-card-content';
    if (this._collapsed.has(sectionId)) content.classList.add('collapsed');
    content.dataset.sectionContent = sectionId;

    if (sectionId === 'examples') {
      content.appendChild(this._renderExamplesContent());
    } else if (sectionId === 'parameters') {
      content.appendChild(this._renderParametersContent());
    } else {
      const textarea = document.createElement('textarea');
      textarea.placeholder = meta.placeholder;
      textarea.rows = sectionId === 'systemPrompt' ? 4 : 5;
      textarea.dataset.field = meta.field;
      content.appendChild(textarea);
    }

    card.appendChild(content);
    return card;
  }

  /** Render the few-shot examples editor. */
  _renderExamplesContent() {
    const wrap = document.createElement('div');

    const list = document.createElement('div');
    list.className = 'pb-examples-list';
    list.dataset.field = 'examples';
    wrap.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'pb-add-example';
    addBtn.textContent = '+ Add Example';
    addBtn.addEventListener('click', () => this._addExamplePair(list));
    wrap.appendChild(addBtn);

    return wrap;
  }

  /** Add a single input/output example pair to the list. */
  _addExamplePair(listEl, inputVal = '', outputVal = '') {
    const pair = document.createElement('div');
    pair.className = 'pb-example-pair';

    // Header with remove button
    const pairHeader = document.createElement('div');
    pairHeader.className = 'pb-example-pair-header';

    const label = document.createElement('span');
    label.className = 'pb-example-label';
    label.textContent = `Example ${listEl.children.length + 1}`;
    pairHeader.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'pb-remove-example';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove example';
    removeBtn.addEventListener('click', () => {
      pair.remove();
      this._renumberExamples(listEl);
    });
    pairHeader.appendChild(removeBtn);
    pair.appendChild(pairHeader);

    // Input field
    const inputField = document.createElement('div');
    inputField.className = 'pb-example-field';
    const inputLabel = document.createElement('span');
    inputLabel.className = 'pb-example-field-label';
    inputLabel.textContent = 'Input';
    inputField.appendChild(inputLabel);
    const inputArea = document.createElement('textarea');
    inputArea.placeholder = 'Sample input text...';
    inputArea.rows = 2;
    inputArea.dataset.role = 'input';
    inputArea.value = inputVal;
    inputField.appendChild(inputArea);
    pair.appendChild(inputField);

    // Output field
    const outputField = document.createElement('div');
    outputField.className = 'pb-example-field';
    const outputLabel = document.createElement('span');
    outputLabel.className = 'pb-example-field-label';
    outputLabel.textContent = 'Output';
    outputField.appendChild(outputLabel);
    const outputArea = document.createElement('textarea');
    outputArea.placeholder = 'Expected output...';
    outputArea.rows = 2;
    outputArea.dataset.role = 'output';
    outputArea.value = outputVal;
    outputField.appendChild(outputArea);
    pair.appendChild(outputField);

    listEl.appendChild(pair);
  }

  _renumberExamples(listEl) {
    const pairs = listEl.querySelectorAll('.pb-example-pair');
    pairs.forEach((pair, i) => {
      const label = pair.querySelector('.pb-example-label');
      if (label) label.textContent = `Example ${i + 1}`;
    });
  }

  /** Render temperature and max tokens sliders. */
  _renderParametersContent() {
    const wrap = document.createElement('div');

    // Temperature
    const tempGroup = document.createElement('div');
    tempGroup.className = 'pb-slider-group';

    const tempLabel = document.createElement('span');
    tempLabel.className = 'pb-slider-label';
    tempLabel.textContent = 'Temperature';
    tempGroup.appendChild(tempLabel);

    const tempSlider = document.createElement('input');
    tempSlider.type = 'range';
    tempSlider.min = '0';
    tempSlider.max = '1';
    tempSlider.step = '0.1';
    tempSlider.value = '0.3';
    tempSlider.dataset.param = 'temperature';
    tempGroup.appendChild(tempSlider);

    const tempVal = document.createElement('span');
    tempVal.className = 'pb-slider-value';
    tempVal.textContent = '0.3';
    tempGroup.appendChild(tempVal);

    tempSlider.addEventListener('input', () => {
      tempVal.textContent = tempSlider.value;
    });
    wrap.appendChild(tempGroup);

    // Max tokens
    const tokGroup = document.createElement('div');
    tokGroup.className = 'pb-slider-group';

    const tokLabel = document.createElement('span');
    tokLabel.className = 'pb-slider-label';
    tokLabel.textContent = 'Max Tokens';
    tokGroup.appendChild(tokLabel);

    const tokSlider = document.createElement('input');
    tokSlider.type = 'range';
    tokSlider.min = '200';
    tokSlider.max = '2000';
    tokSlider.step = '100';
    tokSlider.value = '800';
    tokSlider.dataset.param = 'maxTokens';
    tokGroup.appendChild(tokSlider);

    const tokVal = document.createElement('span');
    tokVal.className = 'pb-slider-value';
    tokVal.textContent = '800';
    tokGroup.appendChild(tokVal);

    tokSlider.addEventListener('input', () => {
      tokVal.textContent = tokSlider.value;
    });
    wrap.appendChild(tokGroup);

    return wrap;
  }

  // ──────────────────────────────────────────
  // Preview (right column)
  // ──────────────────────────────────────────

  _renderPreview() {
    const preview = document.createElement('div');
    preview.className = 'prompt-builder-preview';

    const label = document.createElement('div');
    label.className = 'pb-preview-label';
    label.textContent = 'LIVE PREVIEW';
    preview.appendChild(label);

    this._previewOutput = document.createElement('div');
    this._previewOutput.className = 'pb-preview-output';
    this._previewOutput.textContent = 'Click TEST to preview AI output with your template configuration.';
    preview.appendChild(this._previewOutput);

    this._sampleInput = document.createElement('textarea');
    this._sampleInput.className = 'pb-sample-input';
    this._sampleInput.placeholder = 'Enter sample text to test the template with...';
    this._sampleInput.rows = 3;
    preview.appendChild(this._sampleInput);

    return preview;
  }

  // ──────────────────────────────────────────
  // Footer
  // ──────────────────────────────────────────

  _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'prompt-builder-footer';

    // Test button
    this._testBtn = document.createElement('button');
    this._testBtn.className = 'pb-btn pb-btn-test';
    this._testBtn.textContent = 'TEST';
    this._testBtn.addEventListener('click', () => this._test());
    footer.appendChild(this._testBtn);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'pb-btn pb-btn-save';
    saveBtn.textContent = 'SAVE';
    saveBtn.addEventListener('click', () => this._save());
    footer.appendChild(saveBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pb-btn';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => this.close());
    footer.appendChild(closeBtn);

    return footer;
  }

  // ──────────────────────────────────────────
  // Collapse / Expand
  // ──────────────────────────────────────────

  _toggleCollapse(sectionId, card) {
    const content = card.querySelector(`[data-section-content="${sectionId}"]`);
    const toggle = card.querySelector('.pb-collapse-toggle');
    if (!content) return;

    if (this._collapsed.has(sectionId)) {
      this._collapsed.delete(sectionId);
      content.classList.remove('collapsed');
      toggle.classList.remove('collapsed');
    } else {
      this._collapsed.add(sectionId);
      content.classList.add('collapsed');
      toggle.classList.add('collapsed');
    }
  }

  // ──────────────────────────────────────────
  // Drag and Drop
  // ──────────────────────────────────────────

  _setupDragDrop() {
    let draggedSection = null;

    this._sectionsEl.addEventListener('dragstart', e => {
      const card = e.target.closest('.pb-section-card');
      if (!card) return;
      draggedSection = card.dataset.section;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedSection);
    });

    this._sectionsEl.addEventListener('dragend', e => {
      const card = e.target.closest('.pb-section-card');
      if (card) card.classList.remove('dragging');
      draggedSection = null;
      // Clear all drag-over indicators
      this._sectionsEl.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });

    this._sectionsEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const card = e.target.closest('.pb-section-card');
      if (!card || card.dataset.section === draggedSection) return;

      // Clear previous drag-over states
      this._sectionsEl.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      card.classList.add('drag-over');
    });

    this._sectionsEl.addEventListener('dragleave', e => {
      const card = e.target.closest('.pb-section-card');
      if (card) card.classList.remove('drag-over');
    });

    this._sectionsEl.addEventListener('drop', e => {
      e.preventDefault();
      const targetCard = e.target.closest('.pb-section-card');
      if (!targetCard || !draggedSection) return;

      const targetSection = targetCard.dataset.section;
      if (targetSection === draggedSection) return;

      // Reorder the section list
      const fromIdx = this._sectionOrder.indexOf(draggedSection);
      const toIdx = this._sectionOrder.indexOf(targetSection);
      if (fromIdx === -1 || toIdx === -1) return;

      this._sectionOrder.splice(fromIdx, 1);
      this._sectionOrder.splice(toIdx, 0, draggedSection);

      // Preserve current field values before re-rendering
      const currentValues = this._buildTemplateFromUI();
      this._renderSections();
      this._populateFields(currentValues);
      this._setupDragDrop();
    });
  }

  // ──────────────────────────────────────────
  // Build template object from UI state
  // ──────────────────────────────────────────

  _buildTemplateFromUI() {
    const template = {
      label: this._nameInput.value.trim() || 'Untitled',
      description: '',
      instruction: '',
      systemPrompt: '',
      examples: [],
      constraints: '',
      parameters: { temperature: 0.3, maxTokens: 800 },
    };

    if (!this._sectionsEl) return template;

    // Textareas: systemPrompt, instruction, constraints
    const textareas = this._sectionsEl.querySelectorAll('textarea[data-field]');
    textareas.forEach(ta => {
      const field = ta.dataset.field;
      if (field in template) template[field] = ta.value;
    });

    // Examples
    const pairs = this._sectionsEl.querySelectorAll('.pb-example-pair');
    pairs.forEach(pair => {
      const inputArea = pair.querySelector('textarea[data-role="input"]');
      const outputArea = pair.querySelector('textarea[data-role="output"]');
      if (inputArea && outputArea) {
        const input = inputArea.value.trim();
        const output = outputArea.value.trim();
        if (input || output) {
          template.examples.push({ input, output });
        }
      }
    });

    // Parameters
    const tempSlider = this._sectionsEl.querySelector('input[data-param="temperature"]');
    const tokSlider = this._sectionsEl.querySelector('input[data-param="maxTokens"]');
    if (tempSlider) template.parameters.temperature = parseFloat(tempSlider.value);
    if (tokSlider) template.parameters.maxTokens = parseInt(tokSlider.value, 10);

    return template;
  }

  // ──────────────────────────────────────────
  // Populate UI from template data
  // ──────────────────────────────────────────

  _populateFromTemplate(key, template) {
    this._nameInput.value = template.label || key;
    this._updateKeyBadge();
    this._populateFields(template);
  }

  _populateFields(template) {
    if (!this._sectionsEl) return;

    // Simple text fields
    const fieldMap = { systemPrompt: '', instruction: '', constraints: '' };
    for (const field of Object.keys(fieldMap)) {
      const ta = this._sectionsEl.querySelector(`textarea[data-field="${field}"]`);
      if (ta && template[field]) ta.value = template[field];
    }

    // Examples
    if (template.examples && template.examples.length > 0) {
      const list = this._sectionsEl.querySelector('.pb-examples-list');
      if (list) {
        list.innerHTML = '';
        template.examples.forEach(ex => {
          this._addExamplePair(list, ex.input || '', ex.output || '');
        });
      }
    }

    // Parameters
    if (template.parameters) {
      const tempSlider = this._sectionsEl.querySelector('input[data-param="temperature"]');
      const tokSlider = this._sectionsEl.querySelector('input[data-param="maxTokens"]');
      if (tempSlider && template.parameters.temperature != null) {
        tempSlider.value = template.parameters.temperature;
        const valEl = tempSlider.parentElement.querySelector('.pb-slider-value');
        if (valEl) valEl.textContent = template.parameters.temperature;
      }
      if (tokSlider && template.parameters.maxTokens != null) {
        tokSlider.value = template.parameters.maxTokens;
        const valEl = tokSlider.parentElement.querySelector('.pb-slider-value');
        if (valEl) valEl.textContent = template.parameters.maxTokens;
      }
    }
  }

  // ──────────────────────────────────────────
  // Test — run AI with current config
  // ──────────────────────────────────────────

  async _test() {
    const sampleText = this._sampleInput.value.trim();
    if (!sampleText) {
      this._previewOutput.textContent = 'Enter sample text below to test your template.';
      this._previewOutput.classList.remove('has-content');
      return;
    }

    if (!this._client || !this._client.connected) {
      this._previewOutput.textContent = 'AI is not connected. Check your provider settings and try again.';
      this._previewOutput.classList.remove('has-content');
      return;
    }

    this._cancelTest();
    this._abortController = new AbortController();
    this._testing = true;
    this._testBtn.classList.add('testing');
    this._testBtn.textContent = 'TESTING...';

    // Show loading state
    this._previewOutput.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'pb-loading';
    const dot = document.createElement('span');
    dot.className = 'pb-loading-dot';
    loading.appendChild(dot);
    loading.appendChild(document.createTextNode('Generating...'));
    this._previewOutput.appendChild(loading);

    try {
      const template = this._buildTemplateFromUI();
      const { systemPrompt, userPrompt } = this._buildPromptParts(template, sampleText);
      const model = this._getSelectedModel();
      const options = {
        temperature: template.parameters.temperature,
        num_predict: template.parameters.maxTokens,
      };

      let output = '';
      this._previewOutput.innerHTML = '';
      this._previewOutput.classList.add('has-content');

      for await (const { token, done } of this._client.generate(
        model, userPrompt, systemPrompt, options, this._abortController.signal
      )) {
        output += token;
        this._previewOutput.textContent = output;
        if (done) break;
      }

      if (!output.trim()) {
        this._previewOutput.textContent = '(No output generated)';
        this._previewOutput.classList.remove('has-content');
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        this._previewOutput.textContent = 'Test cancelled.';
      } else {
        this._previewOutput.textContent = `Error: ${e.message}`;
      }
      this._previewOutput.classList.remove('has-content');
    } finally {
      this._testing = false;
      this._testBtn.classList.remove('testing');
      this._testBtn.textContent = 'TEST';
    }
  }

  /**
   * Build separated system and user prompts from template config + sample text.
   * @returns {{ systemPrompt: string, userPrompt: string }}
   */
  _buildPromptParts(template, sampleText) {
    // System prompt
    const systemPrompt = template.systemPrompt || 'You are a text formatting assistant. Transform raw dictation into the requested format.';

    // User prompt
    const parts = [];

    if (template.instruction) {
      parts.push(template.instruction);
      parts.push('');
    }

    if (template.examples && template.examples.length > 0) {
      parts.push('Examples:');
      template.examples.forEach((ex, i) => {
        parts.push(`\nExample ${i + 1}:`);
        parts.push(`Input: ${ex.input}`);
        parts.push(`Output: ${ex.output}`);
      });
      parts.push('');
    }

    if (template.constraints) {
      parts.push(`Output constraints: ${template.constraints}`);
      parts.push('');
    }

    parts.push(`Raw dictation:\n${sampleText}`);

    return { systemPrompt, userPrompt: parts.join('\n') };
  }

  _cancelTest() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._testing = false;
    if (this._testBtn) {
      this._testBtn.classList.remove('testing');
      this._testBtn.textContent = 'TEST';
    }
  }

  /** Get the currently selected model from the main app's model selector. */
  _getSelectedModel() {
    const modelSelect = document.getElementById('modelSelect');
    return modelSelect ? modelSelect.value : 'gemma3:4b';
  }

  // ──────────────────────────────────────────
  // Save
  // ──────────────────────────────────────────

  _save() {
    const template = this._buildTemplateFromUI();
    const name = this._nameInput.value.trim();

    if (!name) {
      this._nameInput.style.borderColor = 'var(--danger)';
      this._nameInput.focus();
      setTimeout(() => { this._nameInput.style.borderColor = ''; }, 2000);
      return;
    }

    if (!template.instruction) {
      // Find the instruction textarea and highlight it
      const instrTa = this._sectionsEl.querySelector('textarea[data-field="instruction"]');
      if (instrTa) {
        instrTa.style.borderColor = 'var(--danger)';
        instrTa.focus();
        setTimeout(() => { instrTa.style.borderColor = ''; }, 2000);
      }
      return;
    }

    const key = this._editingKey || this._slugify(name);
    if (!key) return;

    // Set description from first line of instruction
    template.description = template.instruction.split('\n')[0].slice(0, 80);

    // Clean up empty examples
    template.examples = template.examples.filter(ex => ex.input || ex.output);

    // Remove empty optional fields
    if (!template.systemPrompt) delete template.systemPrompt;
    if (!template.constraints) delete template.constraints;
    if (template.examples.length === 0) delete template.examples;

    saveCustomTemplate(key, template);
    this.onSave?.(key, template);
    this.close();
  }

  // ──────────────────────────────────────────
  // CSS Injection
  // ──────────────────────────────────────────

  _injectStyles() {
    if (this._stylesInjected) return;

    // Check if the stylesheet is already linked
    const existing = document.querySelector('link[href*="prompt-builder.css"]');
    if (existing) {
      this._stylesInjected = true;
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/prompt-builder.css';
    document.head.appendChild(link);
    this._stylesInjected = true;
  }
}
