/**
 * Multi-Target Output Formatter
 * Transforms raw dictation into multiple structured output formats in parallel.
 * Uses the OllamaClient for AI-powered formatting.
 */

const FORMAT_SPECS = {
  'claude-code': {
    label: 'Claude Code',
    maxTokens: 1000,
    instruction: 'Transform into a well-structured Claude Code prompt using markdown headers and bullet points.',
  },
  'github-issue': {
    label: 'GitHub Issue',
    maxTokens: 800,
    instruction: 'Transform into a GitHub issue with Title, Description, Steps to Reproduce (if applicable), and Expected Behavior sections.',
  },
  'commit-msg': {
    label: 'Commit Message',
    maxTokens: 200,
    instruction: 'Transform into a conventional commit message. First line: type(scope): description (max 72 chars). Body: explain what and why, not how.',
  },
  'pr-description': {
    label: 'PR Description',
    maxTokens: 800,
    instruction: 'Transform into a pull request description with ## Summary, ## Changes, ## Testing sections.',
  },
  'slack-msg': {
    label: 'Slack Message',
    maxTokens: 400,
    instruction: 'Transform into a concise, casual Slack message. Use emoji sparingly. Be brief and direct.',
  },
  'jira-ticket': {
    label: 'JIRA Ticket',
    maxTokens: 800,
    instruction: 'Transform into a JIRA ticket with Summary, Description, Acceptance Criteria, and Story Points estimate.',
  },
};

export class MultiFormatter {
  /**
   * @param {import('./ollama-client.js').OllamaClient} aiClient
   */
  constructor(aiClient) {
    this.client = aiClient;

    /** @type {((format: string) => void)|null} */
    this.onFormatStart = null;

    /** @type {((format: string, result: object) => void)|null} */
    this.onFormatDone = null;

    /** @type {((results: object) => void)|null} */
    this.onAllDone = null;

    /** @type {((format: string, error: Error) => void)|null} */
    this.onError = null;
  }

  /** Return the full format spec map (read-only snapshot). */
  get formats() {
    return FORMAT_SPECS;
  }

  /**
   * Build the full prompt string from a format spec, context, and raw text.
   * Embeds system-level instructions directly since Ollama's /api/generate
   * does not accept a separate system prompt field.
   */
  _buildPrompt(spec, text, context) {
    const system = [
      'You are a text formatting assistant.',
      'Transform the user\'s raw dictation into the requested format.',
      'Return ONLY the formatted output, no preamble or explanation.',
    ].join(' ');

    const contextLine = context.project || context.stack
      ? `Context: ${context.project || 'general'} (${context.stack || 'unknown stack'})`
      : '';

    return [
      `[System] ${system}`,
      '',
      spec.instruction,
      contextLine,
      '',
      'Raw dictation:',
      text,
    ].filter(Boolean).join('\n');
  }

  /**
   * Format text into all (or a subset of) formats in parallel.
   *
   * @param {string}   text             Raw dictation text
   * @param {string}   model            Ollama model name
   * @param {string[]|null} selectedFormats  Array of format keys, or null for all
   * @param {object}   context          Optional project/stack context
   * @returns {Promise<Record<string, {format: string, label: string, output: string, error?: string}>>}
   */
  async formatAll(text, model, selectedFormats = null, context = {}) {
    if (!text || !text.trim()) return {};

    const formats = selectedFormats || Object.keys(FORMAT_SPECS);
    const results = {};

    const promises = formats.map(async (fmt) => {
      const spec = FORMAT_SPECS[fmt];
      if (!spec) return;

      this.onFormatStart?.(fmt);

      try {
        const prompt = this._buildPrompt(spec, text, context);

        const systemPrompt = 'You are a text formatting assistant. Transform the user\'s raw dictation into the requested format. Return ONLY the formatted output, no preamble.';
        const response = await this.client.generateFull(
          model,
          prompt,
          systemPrompt,
          { num_predict: spec.maxTokens, temperature: 0.2, top_p: 0.9 },
        );

        const output = (response || '').trim();
        results[fmt] = { format: fmt, label: spec.label, output };
        this.onFormatDone?.(fmt, results[fmt]);
      } catch (e) {
        results[fmt] = { format: fmt, label: spec.label, output: '', error: e.message };
        this.onError?.(fmt, e);
      }
    });

    await Promise.allSettled(promises);
    this.onAllDone?.(results);
    return results;
  }

  /**
   * Format text into a single format.
   *
   * @param {string} text    Raw dictation text
   * @param {string} model   Ollama model name
   * @param {string} format  Format key from FORMAT_SPECS
   * @param {object} context Optional project/stack context
   * @returns {Promise<{format: string, label: string, output: string, error?: string}|undefined>}
   */
  async formatSingle(text, model, format, context = {}) {
    const results = await this.formatAll(text, model, [format], context);
    return results[format];
  }

  /**
   * Get a list of available format keys.
   * @returns {string[]}
   */
  getFormatKeys() {
    return Object.keys(FORMAT_SPECS);
  }

  /**
   * Get the human-readable label for a format.
   * @param {string} key
   * @returns {string}
   */
  getLabel(key) {
    return FORMAT_SPECS[key]?.label || key;
  }
}
