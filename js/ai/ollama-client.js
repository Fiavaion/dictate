/**
 * Ollama Client — streaming API wrapper
 * Connects to local Ollama at http://localhost:11434
 */

const DEFAULT_URL = 'http://localhost:11434';

export class OllamaClient {
  constructor(baseUrl = DEFAULT_URL) {
    this.baseUrl = baseUrl;
    this.connected = false;
    this.models = [];
    this._checkInterval = null;
  }

  /** Check connection and list available models */
  async checkConnection() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.models = (data.models || []).map(m => ({
        name: m.name,
        size: m.details?.parameter_size || '?',
        family: m.details?.family || '',
      }));
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      this.models = [];
      return false;
    }
  }

  /** Start periodic connection checks */
  startMonitoring(intervalMs = 10000, onStatusChange) {
    let wasConnected = this.connected;
    this._checkInterval = setInterval(async () => {
      await this.checkConnection();
      if (this.connected !== wasConnected) {
        wasConnected = this.connected;
        onStatusChange?.(this.connected, this.models);
      }
    }, intervalMs);
    // Initial check
    this.checkConnection().then(() => onStatusChange?.(this.connected, this.models));
  }

  stopMonitoring() {
    clearInterval(this._checkInterval);
    this._checkInterval = null;
  }

  /** Pre-warm a model with a tiny prompt (avoids cold-start delay on first real use) */
  async warmup(model) {
    if (!this.connected) return;
    try {
      await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'Hi', stream: false, options: { num_predict: 1 } }),
        signal: AbortSignal.timeout(30000),
      });
    } catch { /* warmup failure is non-critical */ }
  }

  /**
   * Streaming generate — yields tokens as they arrive.
   * @param {string} model
   * @param {string} prompt
   * @param {object} options - Ollama options (temperature, num_predict, etc.)
   * @param {AbortSignal} signal - for cancellation
   * @yields {{ token: string, done: boolean }}
   */
  async *generate(model, prompt, options = {}, signal) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: { temperature: 0.1, top_p: 0.9, num_predict: 300, ...options },
      }),
      signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield { token: data.response || '', done: !!data.done };
          if (data.done) return;
        } catch { /* skip malformed lines */ }
      }
    }
  }

  /**
   * Non-streaming generate — returns full response.
   */
  async generateFull(model, prompt, options = {}, signal) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1, top_p: 0.9, num_predict: 300, ...options },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.response || '';
  }
}
