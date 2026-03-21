/**
 * Prompt Structurer — on-demand transformation of dictated text
 * into structured Claude Code prompts using Ollama.
 */

import { getAllTemplates, TEMPLATES } from './prompt-templates.js';

const STRUCTURER_SYSTEM = `You are a prompt engineering specialist for Claude Code, an AI coding assistant in VS Code. Transform the user's raw dictation into a well-structured, effective prompt.

Rules:
1. Use markdown formatting: ## headers, bullet points, backticks for code/paths
2. Be specific: convert vague references to concrete terms
3. Keep it concise — Claude Code works best with clear, focused prompts
4. Do not add information that wasn't in the original dictation
5. Return ONLY the structured prompt, no preamble or explanation`;

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

  /** Structure the given text using the current template */
  async structure(text) {
    if (!text.trim()) return '';
    if (!this.client.connected) {
      this.onError?.('Ollama not connected');
      return '';
    }

    // Cancel any in-flight structuring
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();
    this._structuring = true;
    this.onStructureStart?.();

    try {
      const all = getAllTemplates();
      const template = all[this.currentTemplate] || TEMPLATES.freeform;

      let contextBlock = '';
      if (this.projectContext) contextBlock += `\nProject: ${this.projectContext}`;
      if (this.stackContext) contextBlock += `\nTech stack: ${this.stackContext}`;

      const prompt = `${STRUCTURER_SYSTEM}\n\n${template.instruction}${contextBlock}\n\nRaw dictation:\n${text}`;

      let structured = '';
      for await (const { token, done } of this.client.generate(
        this.model, prompt,
        { num_predict: 800, temperature: 0.3 },
        this._abortController.signal
      )) {
        structured += token;
        this.onStructureToken?.(structured);
        if (done) break;
      }

      structured = structured.trim();
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
