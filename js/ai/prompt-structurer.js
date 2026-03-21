/**
 * Prompt Structurer — on-demand transformation of dictated text
 * into polished written text using the active template.
 */

import { getAllTemplates, TEMPLATES } from './prompt-templates.js';

const BASE_SYSTEM_PROMPT = `You are a dictation processing assistant. Transform the user's raw spoken text into polished written text according to the template instructions provided.

Rules:
1. Follow the template's tone and formatting instructions precisely
2. Do not add information that wasn't in the original dictation
3. Fix dictation artifacts: filler words, false starts, repetitions
4. Return ONLY the processed text, no preamble or explanation`;

export class PromptStructurer {
  constructor(ollamaClient, options = {}) {
    this.client = ollamaClient;
    this.model = options.model || 'mistral:7b-instruct';
    this.currentTemplate = 'freeform';
    this.projectContext = options.projectContext || '';
    this.stackContext = options.stackContext || '';

    // Callbacks
    this.onStructureStart = options.onStructureStart || null;
    this.onStructureToken = options.onStructureToken || null;
    this.onStructureDone = options.onStructureDone || null;
    this.onError = options.onError || null;

    this._abortController = null;
    this._structuring = false;
  }

  get isActive() { return this._structuring; }

  setTemplate(templateKey) {
    const all = getAllTemplates();
    if (all[templateKey]) {
      this.currentTemplate = templateKey;
      return true;
    }
    return false;
  }

  /** Build system prompt, merging base with template overrides and constraints */
  _buildSystemPrompt(template) {
    let system = BASE_SYSTEM_PROMPT;

    if (template.systemPrompt) {
      system += `\n\n${template.systemPrompt}`;
    }

    if (template.constraints) {
      system += `\n\nOutput constraints: ${template.constraints}`;
    }

    return system;
  }

  /** Build user prompt with template instruction, few-shot examples, and text */
  _buildUserPrompt(text, template) {
    let prompt = template.instruction;

    if (template.examples && template.examples.length > 0) {
      prompt += '\n';
      for (const ex of template.examples) {
        prompt += `\n\nExample input:\n${ex.input}\n\nExample output:\n${ex.output}`;
      }
    }

    let contextBlock = '';
    if (this.projectContext) contextBlock += `\nProject: ${this.projectContext}`;
    if (this.stackContext) contextBlock += `\nTech stack: ${this.stackContext}`;
    if (contextBlock) prompt += contextBlock;

    prompt += `\n\nRaw dictation:\n${text}`;

    return prompt;
  }

  /** Strip common LLM artifacts from structured output */
  _stripArtifacts(text) {
    let result = text;

    // Strip markdown code fences if the entire output is wrapped
    const fenceMatch = result.match(/^```(?:\w*)\n([\s\S]*?)\n```\s*$/);
    if (fenceMatch) {
      result = fenceMatch[1];
    }

    // Strip leading preamble lines
    const preamblePattern = /^(?:Here's|Here is|Sure|I'll|Below is)[^\n]*\n+/i;
    result = result.replace(preamblePattern, '');

    // Strip trailing explanatory paragraphs
    result = result.replace(/\n\n(?:Note:|This prompt)[^\n]*(?:\n[^\n#-][^\n]*)*\s*$/i, '');

    return result.trim();
  }

  /** Structure the given text using the current template */
  async structure(text) {
    if (!text.trim()) return '';
    if (!this.client.connected) {
      this.onError?.('AI not connected');
      return '';
    }

    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();
    this._structuring = true;
    this.onStructureStart?.();

    try {
      const all = getAllTemplates();
      const template = all[this.currentTemplate] || TEMPLATES.freeform;

      const systemPrompt = this._buildSystemPrompt(template);
      const userPrompt = this._buildUserPrompt(text, template);

      const maxTokens = template.parameters?.maxTokens || 1200;
      const temperature = template.parameters?.temperature || 0.3;

      let structured = '';
      for await (const { token, done } of this.client.generate(
        this.model, userPrompt, systemPrompt,
        { num_predict: maxTokens, temperature },
        this._abortController.signal
      )) {
        structured += token;
        this.onStructureToken?.(structured);
        if (done) break;
      }

      structured = this._stripArtifacts(structured);
      this.onStructureDone?.(structured);
      return structured;
    } catch (e) {
      if (e.name === 'AbortError') return '';
      this.onError?.(e.message);
      return '';
    } finally {
      this._structuring = false;
    }
  }

  cancel() {
    if (this._abortController) this._abortController.abort();
    this._structuring = false;
  }

  setModel(model) { this.model = model; }
}
