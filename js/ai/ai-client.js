/**
 * Unified AI Client — multi-provider wrapper
 * Supports Ollama (local), Anthropic (Claude), OpenAI (GPT), Google (Gemini).
 * Cloud providers proxy through the Python server at /api/ai/proxy.
 */

import { OllamaClient } from './ollama-client.js';

const PROVIDERS = {
  ollama: {
    label: 'Ollama',
    defaultModel: 'gemma3:4b',
    models: [],
    local: true,
  },
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-haiku-4-5',
    models: [
      { name: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { name: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { name: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    ],
    local: false,
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: [
      { name: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { name: 'gpt-4o', label: 'GPT-4o' },
      { name: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    local: false,
  },
  google: {
    label: 'Google',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { name: 'gemini-2.0-flash', label: 'Gemini Flash' },
      { name: 'gemini-2.5-pro', label: 'Gemini Pro' },
    ],
    local: false,
  },
};

const STORAGE_PROVIDER = 'fiavaion-ai-provider';
const STORAGE_KEY_PREFIX = 'fiavaion-ai-apikey-';
const STORAGE_MODEL_PREFIX = 'fiavaion-ai-model-';

// Proxy endpoint — always use the full URL so there's no ambiguity about
// which server the browser is talking to.
const PROXY_URL = `${window.location.origin}/api/ai/proxy`;

function b64Encode(str) {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return ''; }
}

function b64Decode(str) {
  try { return decodeURIComponent(escape(atob(str))); } catch { return ''; }
}

export class AIClient {
  constructor() {
    this._ollamaClient = new OllamaClient();
    this._provider = localStorage.getItem(STORAGE_PROVIDER) || 'ollama';
    this._connected = false;
    this._checkInterval = null;
    this._providerModels = {};

    for (const [key, cfg] of Object.entries(PROVIDERS)) {
      this._providerModels[key] = [...cfg.models];
    }
  }

  // -------------------------------------------------------------------------
  // Provider / model getters-setters
  // -------------------------------------------------------------------------

  get provider() { return this._provider; }

  get connected() {
    if (this._provider === 'ollama') return this._ollamaClient.connected;
    return this._connected;
  }

  get models() {
    if (this._provider === 'ollama') {
      return this._ollamaClient.models.length > 0
        ? this._ollamaClient.models
        : this._providerModels.ollama;
    }
    return this._providerModels[this._provider] || [];
  }

  get providerConfig() { return PROVIDERS[this._provider]; }

  get allProviders() {
    return Object.entries(PROVIDERS).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      local: cfg.local,
    }));
  }

  getDefaultModel(provider) {
    const p = provider || this._provider;
    return PROVIDERS[p]?.defaultModel || '';
  }

  getSelectedModel(provider) {
    const p = provider || this._provider;
    const stored = localStorage.getItem(STORAGE_MODEL_PREFIX + p);
    // Validate stored model still exists in our list; if not, use default
    if (stored) {
      const known = this._providerModels[p] || [];
      if (known.length === 0 || known.some(m => m.name === stored)) return stored;
      // Stale model ID — clear it
      localStorage.removeItem(STORAGE_MODEL_PREFIX + p);
    }
    return this.getDefaultModel(p);
  }

  setSelectedModel(provider, model) {
    localStorage.setItem(STORAGE_MODEL_PREFIX + (provider || this._provider), model);
  }

  setProvider(name, config = {}) {
    if (!PROVIDERS[name]) return;
    this._provider = name;
    localStorage.setItem(STORAGE_PROVIDER, name);

    if (name === 'ollama' && config.baseUrl) {
      this._ollamaClient = new OllamaClient(config.baseUrl);
    }
  }

  getOllamaBaseUrl() {
    return this._ollamaClient.baseUrl;
  }

  setOllamaBaseUrl(url) {
    this._ollamaClient = new OllamaClient(url);
  }

  // -------------------------------------------------------------------------
  // API key management
  // -------------------------------------------------------------------------

  setApiKey(provider, key, remember = true) {
    if (remember) {
      localStorage.setItem(STORAGE_KEY_PREFIX + provider, b64Encode(key));
    } else {
      this._sessionKeys = this._sessionKeys || {};
      this._sessionKeys[provider] = key;
    }
  }

  getApiKey(provider) {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + provider);
    if (stored) return b64Decode(stored);
    return this._sessionKeys?.[provider] || '';
  }

  clearApiKey(provider) {
    localStorage.removeItem(STORAGE_KEY_PREFIX + provider);
    if (this._sessionKeys) delete this._sessionKeys[provider];
  }

  // -------------------------------------------------------------------------
  // Connection check
  // -------------------------------------------------------------------------

  async checkConnection() {
    if (this._provider === 'ollama') {
      const ok = await this._ollamaClient.checkConnection();
      this._providerModels.ollama = this._ollamaClient.models;
      return ok ? { ok: true } : { ok: false, error: 'Cannot reach Ollama' };
    }

    const apiKey = this.getApiKey(this._provider);
    if (!apiKey) {
      this._connected = false;
      return { ok: false, error: 'No API key provided' };
    }

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: this._provider,
          apiKey,
          model: this.getSelectedModel(),
          prompt: 'Hi',
          systemPrompt: 'Reply with just OK.',
          stream: false,
          options: { maxTokens: 5, temperature: 0 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        this._connected = true;
        return { ok: true };
      }

      // Try to extract a useful error message
      this._connected = false;
      try {
        const body = await res.json();
        const raw = body.error || '';
        // Anthropic wraps errors in nested JSON
        try {
          const nested = JSON.parse(raw);
          return { ok: false, error: nested?.error?.message || raw };
        } catch {
          return { ok: false, error: raw || `HTTP ${res.status}` };
        }
      } catch {
        return { ok: false, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      this._connected = false;
      if (e.name === 'TimeoutError') return { ok: false, error: 'Request timed out' };
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  // -------------------------------------------------------------------------
  // Monitoring
  // -------------------------------------------------------------------------

  startMonitoring(intervalMs = 10000, onStatusChange) {
    if (this._provider === 'ollama') {
      this._ollamaClient.startMonitoring(intervalMs, (connected, models) => {
        this._providerModels.ollama = models;
        onStatusChange?.(connected, this.models);
      });
      return;
    }

    let wasConnected = this._connected;
    this._checkInterval = setInterval(async () => {
      await this.checkConnection();
      if (this._connected !== wasConnected) {
        wasConnected = this._connected;
        onStatusChange?.(this._connected, this.models);
      }
    }, intervalMs);
    this.checkConnection().then(() => onStatusChange?.(this._connected, this.models));
  }

  stopMonitoring() {
    this._ollamaClient.stopMonitoring();
    clearInterval(this._checkInterval);
    this._checkInterval = null;
  }

  async warmup(model) {
    if (this._provider === 'ollama') {
      return this._ollamaClient.warmup(model);
    }
  }

  // -------------------------------------------------------------------------
  // Generation — public API (same signature for all callers)
  // -------------------------------------------------------------------------

  async *generate(model, prompt, systemPrompt, options = {}, signal) {
    if (this._provider === 'ollama') {
      yield* this._generateOllama(model, prompt, systemPrompt, options, signal);
      return;
    }
    yield* this._generateCloud(model, prompt, systemPrompt, options, signal);
  }

  async generateFull(model, prompt, systemPrompt, options = {}, signal) {
    if (this._provider === 'ollama') {
      return this._generateFullOllama(model, prompt, systemPrompt, options, signal);
    }
    return this._generateFullCloud(model, prompt, systemPrompt, options, signal);
  }

  // -------------------------------------------------------------------------
  // Ollama (local) — unchanged
  // -------------------------------------------------------------------------

  async *_generateOllama(model, prompt, systemPrompt, options, signal) {
    const res = await fetch(`${this._ollamaClient.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system: systemPrompt || '',
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

  async _generateFullOllama(model, prompt, systemPrompt, options, signal) {
    const res = await fetch(`${this._ollamaClient.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system: systemPrompt || '',
        stream: false,
        options: { temperature: 0.1, top_p: 0.9, num_predict: 300, ...options },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.response || '';
  }

  // -------------------------------------------------------------------------
  // Cloud (Anthropic / OpenAI / Google) — via server proxy
  // -------------------------------------------------------------------------

  _buildProxyPayload(model, prompt, systemPrompt, stream, options) {
    return JSON.stringify({
      provider: this._provider,
      apiKey: this.getApiKey(this._provider),
      model,
      prompt,
      systemPrompt: systemPrompt || '',
      stream,
      options,
    });
  }

  async *_generateCloud(model, prompt, systemPrompt, options, signal) {
    const apiKey = this.getApiKey(this._provider);
    if (!apiKey) throw new Error(`No API key for ${this._provider}`);

    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this._buildProxyPayload(model, prompt, systemPrompt, true, options),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI proxy error ${res.status}: ${text}`);
    }

    // Read NDJSON stream from proxy
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
        } catch { /* skip malformed NDJSON lines */ }
      }
    }
  }

  async _generateFullCloud(model, prompt, systemPrompt, options, signal) {
    const apiKey = this.getApiKey(this._provider);
    if (!apiKey) throw new Error(`No API key for ${this._provider}`);

    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this._buildProxyPayload(model, prompt, systemPrompt, false, options),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI proxy error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.response || '';
  }
}
