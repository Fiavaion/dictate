/**
 * API Settings Modal — configure AI providers
 * Matches the dark theme design language from theme.css.
 */

export class APISettingsModal {
  constructor(aiClient) {
    this.client = aiClient;
    this._el = null;
    this._activeTab = this.client.provider;
  }

  open() {
    if (!this._el) this.render();
    this._el.style.display = 'flex';
    this._renderTab(this._activeTab);
  }

  close() {
    if (this._el) this._el.style.display = 'none';
  }

  render(containerId) {
    if (this._el) this._el.remove();

    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay';
    overlay.id = 'aiSettingsModal';
    overlay.style.display = 'none';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });

    overlay.innerHTML = `
      <div class="folder-modal" style="max-width:520px;min-height:380px;display:flex;flex-direction:column">
        <div class="folder-modal-header">
          <span class="folder-modal-title" style="color:var(--ai-glow)">AI PROVIDER SETTINGS</span>
          <button class="folder-modal-close" id="aiSettingsClose">&times;</button>
        </div>
        <div class="ai-settings-tabs" id="aiSettingsTabs"></div>
        <div class="ai-settings-body" id="aiSettingsBody" style="flex:1;padding:16px;overflow-y:auto"></div>
        <div class="folder-modal-footer">
          <button class="btn-secondary" id="aiSettingsTestBtn" style="margin-right:auto;padding:6px 16px;font-size:0.7rem">TEST CONNECTION</button>
          <button class="btn-secondary" id="aiSettingsCancelBtn" style="padding:6px 16px;font-size:0.7rem">CLOSE</button>
          <button class="btn-mic" id="aiSettingsSaveBtn" style="padding:8px 24px;font-size:0.75rem"><span>SAVE</span></button>
        </div>
      </div>
    `;

    const container = containerId ? document.getElementById(containerId) : document.body;
    container.appendChild(overlay);
    this._el = overlay;

    this._el.querySelector('#aiSettingsClose').onclick = () => this.close();
    this._el.querySelector('#aiSettingsCancelBtn').onclick = () => this.close();
    this._el.querySelector('#aiSettingsSaveBtn').onclick = () => this._save();
    this._el.querySelector('#aiSettingsTestBtn').onclick = () => this._testConnection();

    this._renderTabs();
    this._injectStyles();
  }

  _renderTabs() {
    const tabsEl = this._el.querySelector('#aiSettingsTabs');
    tabsEl.innerHTML = '';
    for (const p of this.client.allProviders) {
      const tab = document.createElement('button');
      tab.className = 'ai-settings-tab' + (p.key === this._activeTab ? ' active' : '');
      tab.textContent = p.label;
      tab.dataset.provider = p.key;
      tab.onclick = () => {
        this._activeTab = p.key;
        tabsEl.querySelectorAll('.ai-settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderTab(p.key);
      };
      tabsEl.appendChild(tab);
    }
  }

  _renderTab(provider) {
    const body = this._el.querySelector('#aiSettingsBody');
    const isOllama = provider === 'ollama';

    if (isOllama) {
      const baseUrl = this.client.getOllamaBaseUrl();
      const models = this.client.models;
      const modelList = models.length > 0
        ? models.map(m => `<div class="ai-settings-model-item">${m.name} <span style="color:var(--dim)">${m.size}</span></div>`).join('')
        : '<div style="color:var(--dim);font-size:0.75rem">No models found. Is Ollama running?</div>';

      body.innerHTML = `
        <label class="ai-settings-label">Base URL</label>
        <input class="ai-settings-input" id="aiSettingsOllamaUrl" type="text" value="${this._escHtml(baseUrl)}" placeholder="http://localhost:11434">
        <label class="ai-settings-label" style="margin-top:16px">Available Models</label>
        <div class="ai-settings-model-list">${modelList}</div>
        <div class="ai-settings-status" id="aiSettingsStatus"></div>
      `;
    } else {
      const apiKey = this.client.getApiKey(provider);
      const hasKey = !!apiKey;
      const models = this.client._providerModels[provider] || [];
      const selectedModel = this.client.getSelectedModel(provider);

      const optionsHtml = models.map(m =>
        `<option value="${m.name}"${m.name === selectedModel ? ' selected' : ''}>${m.label || m.name}</option>`
      ).join('');

      body.innerHTML = `
        <label class="ai-settings-label">API Key</label>
        <div class="ai-settings-key-row">
          <input class="ai-settings-input" id="aiSettingsApiKey" type="password" value="${hasKey ? apiKey : ''}" placeholder="Enter API key" style="flex:1">
          <button class="ai-settings-eye" id="aiSettingsEyeBtn" title="Show/hide key">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <label class="ai-settings-checkbox-row">
          <input type="checkbox" id="aiSettingsRemember" ${hasKey ? 'checked' : ''}>
          <span>Remember key in browser</span>
        </label>
        <label class="ai-settings-label" style="margin-top:16px">Model</label>
        <select class="ai-settings-input" id="aiSettingsModel">${optionsHtml}</select>
        <div class="ai-settings-status" id="aiSettingsStatus"></div>
      `;

      const eyeBtn = this._el.querySelector('#aiSettingsEyeBtn');
      const keyInput = this._el.querySelector('#aiSettingsApiKey');
      if (eyeBtn && keyInput) {
        eyeBtn.onclick = () => {
          keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        };
      }
    }
  }

  _save() {
    const provider = this._activeTab;

    if (provider === 'ollama') {
      const urlInput = this._el.querySelector('#aiSettingsOllamaUrl');
      if (urlInput) {
        this.client.setOllamaBaseUrl(urlInput.value.trim() || 'http://localhost:11434');
      }
    } else {
      const keyInput = this._el.querySelector('#aiSettingsApiKey');
      const rememberCb = this._el.querySelector('#aiSettingsRemember');
      const modelSelect = this._el.querySelector('#aiSettingsModel');

      if (keyInput) {
        const key = keyInput.value.trim();
        if (key) {
          this.client.setApiKey(provider, key, rememberCb?.checked ?? true);
        } else {
          this.client.clearApiKey(provider);
        }
      }
      if (modelSelect) {
        this.client.setSelectedModel(provider, modelSelect.value);
      }
    }

    this.client.setProvider(provider);
    this._showStatus('Settings saved', 'var(--success)');
  }

  async _testConnection() {
    const statusEl = this._el.querySelector('#aiSettingsStatus');
    if (!statusEl) return;

    this._save();
    statusEl.textContent = 'Testing connection...';
    statusEl.style.color = 'var(--muted)';

    const result = await this.client.checkConnection();
    if (result.ok) {
      this._showStatus('Connected', 'var(--success)');
      if (this._activeTab === 'ollama') this._renderTab('ollama');
    } else {
      this._showStatus(result.error || 'Connection failed', 'var(--danger)');
    }
  }

  _showStatus(text, color) {
    const statusEl = this._el.querySelector('#aiSettingsStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  _escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _injectStyles() {
    if (document.getElementById('ai-settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-settings-styles';
    style.textContent = `
      .ai-settings-tabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid var(--border);
      }
      .ai-settings-tab {
        flex: 1;
        padding: 10px 12px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--dim);
        font-family: var(--mono);
        font-size: 0.7rem;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      .ai-settings-tab:hover { color: var(--text); }
      .ai-settings-tab.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
      .ai-settings-label {
        display: block;
        font-family: var(--mono);
        font-size: 0.65rem;
        letter-spacing: 0.08em;
        color: var(--dim);
        margin-bottom: 6px;
        text-transform: uppercase;
      }
      .ai-settings-input {
        display: block;
        width: 100%;
        padding: 8px 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text);
        font-family: var(--mono);
        font-size: 0.78rem;
        outline: none;
        transition: border-color 0.15s;
      }
      .ai-settings-input:focus {
        border-color: var(--ai-glow);
      }
      .ai-settings-key-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .ai-settings-eye {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 7px 8px;
        cursor: pointer;
        color: var(--dim);
        display: flex;
        align-items: center;
      }
      .ai-settings-eye:hover { color: var(--text); }
      .ai-settings-checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        font-size: 0.75rem;
        color: var(--muted);
        cursor: pointer;
      }
      .ai-settings-checkbox-row input[type="checkbox"] {
        accent-color: var(--ai-glow);
      }
      .ai-settings-model-list {
        max-height: 140px;
        overflow-y: auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px;
      }
      .ai-settings-model-list::-webkit-scrollbar { width: 4px; }
      .ai-settings-model-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      .ai-settings-model-item {
        padding: 4px 6px;
        font-family: var(--mono);
        font-size: 0.73rem;
        color: var(--text);
        border-radius: 4px;
      }
      .ai-settings-model-item:hover {
        background: var(--elevated);
      }
      .ai-settings-status {
        margin-top: 16px;
        font-family: var(--mono);
        font-size: 0.72rem;
        min-height: 1.2em;
      }
    `;
    document.head.appendChild(style);
  }
}
