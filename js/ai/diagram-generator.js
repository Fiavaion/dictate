/**
 * Diagram Generator
 * Converts spoken descriptions into valid Mermaid.js diagram syntax
 * using the OllamaClient for AI-powered generation.
 */

const DIAGRAM_TYPES = {
  flowchart:    { prefix: 'graph',           label: 'Flowchart' },
  sequence:     { prefix: 'sequenceDiagram', label: 'Sequence Diagram' },
  classDiagram: { prefix: 'classDiagram',    label: 'Class Diagram' },
  erDiagram:    { prefix: 'erDiagram',       label: 'ER Diagram' },
  stateDiagram: { prefix: 'stateDiagram-v2', label: 'State Diagram' },
  gantt:        { prefix: 'gantt',           label: 'Gantt Chart' },
};

export class DiagramGenerator {
  /**
   * @param {import('./ollama-client.js').OllamaClient} aiClient
   */
  constructor(aiClient) {
    this.client = aiClient;

    /** @type {(() => void)|null} */
    this.onDiagramStart = null;

    /** @type {((diagram: object) => void)|null} */
    this.onDiagramDone = null;

    /** @type {((error: Error) => void)|null} */
    this.onError = null;
  }

  /** Return the available diagram types. */
  get diagramTypes() {
    return DIAGRAM_TYPES;
  }

  /**
   * Build the prompt string for diagram generation.
   * Includes system instructions inline for Ollama compatibility.
   */
  _buildPrompt(spokenDescription, typeHint) {
    const system = [
      'You are a diagram generation expert.',
      'Convert spoken descriptions into valid Mermaid.js syntax.',
      typeHint,
      '',
      'Rules:',
      '1. Return ONLY valid Mermaid.js code, no explanation or markdown fences',
      '2. Use descriptive node labels',
      '3. Keep diagrams clean and readable',
      '4. Handle edge cases (loops, conditions, error paths)',
      '5. Use proper Mermaid syntax — no invalid characters in node IDs',
    ].join('\n');

    return `[System] ${system}\n\nConvert this description into a Mermaid diagram:\n\n${spokenDescription}`;
  }

  /**
   * Strip markdown code fences from AI output if present.
   * @param {string} raw
   * @returns {string}
   */
  _cleanMermaid(raw) {
    let cleaned = raw.trim();

    // Remove ```mermaid ... ``` or ``` ... ``` fences
    const fenceMatch = cleaned.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n\s*```\s*$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Also handle case where only opening fence is present (no closing)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    return cleaned;
  }

  /**
   * Detect the diagram type from the generated Mermaid syntax.
   * @param {string} mermaid
   * @returns {string}
   */
  _detectType(mermaid) {
    const firstLine = mermaid.split('\n')[0].trim().toLowerCase();

    for (const [key, cfg] of Object.entries(DIAGRAM_TYPES)) {
      if (firstLine.startsWith(cfg.prefix.toLowerCase())) {
        return key;
      }
    }

    // Flowchart variants: graph TD, graph LR, graph TB, etc.
    if (/^graph\s+(td|tb|bt|lr|rl)/i.test(firstLine)) {
      return 'flowchart';
    }

    return 'flowchart'; // default fallback
  }

  /**
   * Generate a Mermaid diagram from a spoken description.
   *
   * @param {string} spokenDescription  Natural-language description of the diagram
   * @param {string} model              Ollama model name
   * @param {string} diagramType        Diagram type key, or 'auto' for AI to choose
   * @returns {Promise<{mermaid: string, type: string, label: string, description: string}|null>}
   */
  async generate(spokenDescription, model, diagramType = 'auto') {
    if (!spokenDescription || !spokenDescription.trim()) return null;

    let typeHint;
    if (diagramType !== 'auto' && DIAGRAM_TYPES[diagramType]) {
      typeHint = `Generate a ${DIAGRAM_TYPES[diagramType].label} using Mermaid.js syntax.`;
    } else {
      typeHint = 'Choose the most appropriate Mermaid.js diagram type for this description.';
    }

    this.onDiagramStart?.();

    try {
      const prompt = this._buildPrompt(spokenDescription, typeHint);

      const systemPrompt = 'You are a diagram generation expert. Convert spoken descriptions into valid Mermaid.js syntax. Return ONLY valid Mermaid code, no explanation.';
      const response = await this.client.generateFull(
        model,
        prompt,
        systemPrompt,
        { num_predict: 800, temperature: 0.2, top_p: 0.9 },
      );

      const mermaid = this._cleanMermaid(response || '');

      if (!mermaid) {
        throw new Error('AI returned empty diagram');
      }

      const detectedType = this._detectType(mermaid);
      const diagram = {
        mermaid,
        type: detectedType,
        label: DIAGRAM_TYPES[detectedType]?.label || 'Diagram',
        description: spokenDescription,
      };

      this.onDiagramDone?.(diagram);
      return diagram;
    } catch (e) {
      this.onError?.(e);
      return null;
    }
  }

  /**
   * Get the list of available diagram type keys.
   * @returns {string[]}
   */
  getTypeKeys() {
    return Object.keys(DIAGRAM_TYPES);
  }

  /**
   * Get the human-readable label for a diagram type.
   * @param {string} key
   * @returns {string}
   */
  getTypeLabel(key) {
    return DIAGRAM_TYPES[key]?.label || key;
  }
}
