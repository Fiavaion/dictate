/**
 * Gemini Setup Wizard — guided setup for free Google Gemini API key.
 * Follows the APISettingsModal pattern (self-contained modal + injected styles).
 */

export class GeminiWizard {
  constructor(aiClient) {
    this.client = aiClient;
    this._el = null;
    this._step = 1;
    this.onComplete = null;
  }

  get isConfigured() {
    return !!this.client.getApiKey('google');
  }

  open() {
    if (!this._el) this.render();
    this._step = 1;
    this._el.style.display = 'flex';
    this._renderStep();
  }

  close() {
    if (this._el) this._el.style.display = 'none';
  }

  render() {
    if (this._el) this._el.remove();

    const overlay = document.createElement('div');
    overlay.className = 'folder-modal-overlay';
    overlay.id = 'geminiWizardModal';
    overlay.style.display = 'none';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });

    overlay.innerHTML = `
      <div class="folder-modal" style="max-width:460px;display:flex;flex-direction:column">
        <div class="folder-modal-header">
          <span class="folder-modal-title" style="color:var(--ai-glow)">GEMINI SETUP</span>
          <div class="gw-dots" id="gwDots"></div>
          <button class="folder-modal-close" id="gwClose">&times;</button>
        </div>
        <div class="gw-body" id="gwBody"></div>
        <div class="gw-actions" id="gwActions"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._el = overlay;
    this._el.querySelector('#gwClose').onclick = () => this.close();
    this._injectStyles();
  }

  _renderStep() {
    this._renderDots();
    const body = this._el.querySelector('#gwBody');
    const actions = this._el.querySelector('#gwActions');

    switch (this._step) {
      case 1: this._step1(body, actions); break;
      case 2: this._step2(body, actions); break;
      case 3: this._step3(body, actions); break;
      case 4: this._step4(body, actions); break;
    }
  }

  _renderDots() {
    const dots = this._el.querySelector('#gwDots');
    dots.innerHTML = [1, 2, 3, 4].map(n => {
      const cls = n === this._step ? 'active' : n < this._step ? 'done' : '';
      return `<span class="gw-dot ${cls}"></span>`;
    }).join('');
  }

  _goTo(n) {
    this._step = n;
    this._renderStep();
  }

  // ── Step 1: Welcome ──
  _step1(body, actions) {
    body.innerHTML = `
      <div class="gw-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ai-glow)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
        </svg>
      </div>
      <div class="gw-title">Enable Free Cloud AI</div>
      <div class="gw-desc">
        Google Gemini Flash is <strong>free</strong>, fast, and dramatically
        improves dictation cleanup compared to local models.<br><br>
        No credit card required — just a Google account.
      </div>
    `;
    actions.innerHTML = `
      <span></span>
      <button class="btn-mic gw-btn-next" id="gwNext"><span>GET STARTED</span></button>
    `;
    this._el.querySelector('#gwNext').onclick = () => this._goTo(2);
  }

  // ── Step 2: Get API Key ──
  _step2(body, actions) {
    body.innerHTML = `
      <div class="gw-title">Create Your API Key</div>
      <div class="gw-desc" style="text-align:left">
        <div class="gw-instruction"><span class="gw-num">1</span> Click the button below to open Google AI Studio</div>
        <div class="gw-instruction"><span class="gw-num">2</span> Sign in with your Google account</div>
        <div class="gw-instruction"><span class="gw-num">3</span> Click <strong>Create API Key</strong></div>
        <div class="gw-instruction"><span class="gw-num">4</span> Copy the key</div>
      </div>
      <a class="gw-link-btn" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        OPEN GOOGLE AI STUDIO
      </a>
    `;
    actions.innerHTML = `
      <button class="btn-secondary gw-btn-back" id="gwBack">BACK</button>
      <button class="btn-mic gw-btn-next" id="gwNext"><span>NEXT</span></button>
    `;
    this._el.querySelector('#gwBack').onclick = () => this._goTo(1);
    this._el.querySelector('#gwNext').onclick = () => this._goTo(3);
  }

  // ── Step 3: Paste Key ──
  _step3(body, actions) {
    const existing = this.client.getApiKey('google') || '';
    body.innerHTML = `
      <div class="gw-title">Paste Your API Key</div>
      <div class="gw-key-row">
        <input class="ai-settings-input" id="gwApiKey" type="password" value="${existing}" placeholder="AIza..." style="flex:1">
        <button class="ai-settings-eye" id="gwEye" title="Show/hide key">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
      <label class="ai-settings-checkbox-row">
        <input type="checkbox" id="gwRemember" checked>
        <span>Remember key in browser</span>
      </label>
      <div class="gw-status" id="gwStatus"></div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary gw-btn-back" id="gwBack">BACK</button>
      <button class="btn-mic gw-btn-next" id="gwTest"><span>TEST &amp; CONTINUE</span></button>
    `;

    const keyInput = this._el.querySelector('#gwApiKey');
    this._el.querySelector('#gwEye').onclick = () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    };
    this._el.querySelector('#gwBack').onclick = () => this._goTo(2);
    this._el.querySelector('#gwTest').onclick = () => this._testKey();
  }

  async _testKey() {
    const keyInput = this._el.querySelector('#gwApiKey');
    const remember = this._el.querySelector('#gwRemember');
    const key = keyInput?.value.trim();
    if (!key) { this._showStatus('Please enter an API key', 'var(--danger)'); return; }

    this._showStatus('Testing connection...', 'var(--muted)');

    const prevProvider = this.client.provider;
    this.client.setApiKey('google', key, remember?.checked ?? true);
    this.client.setProvider('google');

    const result = await this.client.checkConnection();

    const err = (result.error || '').toLowerCase();
    const isRateLimit = err.includes('quota') || err.includes('rate') || err.includes('429');

    if (result.ok || isRateLimit) {
      // Rate-limited means the key IS valid — just temporarily throttled
      const msg = isRateLimit ? 'Key valid! (rate-limited — will work shortly)' : 'Connected!';
      this._showStatus(msg, 'var(--success)');
      setTimeout(() => this._goTo(4), 800);
    } else {
      this.client.setProvider(prevProvider);
      // Truncate verbose API errors to something readable
      const short = (result.error || 'Connection failed').split('.')[0].slice(0, 120);
      this._showStatus(short, 'var(--danger)');
    }
  }

  // ── Step 4: Success ──
  _step4(body, actions) {
    const models = this.client._providerModels?.google || [
      { name: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { name: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { name: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { name: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    ];
    const selected = this.client.getSelectedModel('google');
    const opts = models.map(m =>
      `<option value="${m.name}"${m.name === selected ? ' selected' : ''}>${m.label || m.name}</option>`
    ).join('');

    body.innerHTML = `
      <div class="gw-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div class="gw-title">You're All Set!</div>
      <div class="gw-desc">
        Gemini is now your cloud AI provider. Your dictation will be
        cleaned up by Google's AI.
      </div>
      <label class="ai-settings-label" style="margin-top:8px">Model</label>
      <select class="ai-settings-input" id="gwModel">${opts}</select>
    `;
    actions.innerHTML = `
      <span></span>
      <button class="btn-mic gw-btn-next" id="gwFinish"><span>FINISH</span></button>
    `;
    this._el.querySelector('#gwFinish').onclick = () => this._finish();
  }

  _finish() {
    const modelSelect = this._el.querySelector('#gwModel');
    if (modelSelect) {
      this.client.setSelectedModel('google', modelSelect.value);
    }
    this.client.setProvider('google');
    this.close();
    if (this.onComplete) this.onComplete('google');
  }

  _showStatus(text, color) {
    const el = this._el.querySelector('#gwStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  _injectStyles() {
    if (document.getElementById('gemini-wizard-styles')) return;
    const style = document.createElement('style');
    style.id = 'gemini-wizard-styles';
    style.textContent = `
      .gw-body {
        padding: 28px 24px 16px;
        text-align: center;
        min-height: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .gw-icon { margin-bottom: 16px; }
      .gw-title {
        font-family: var(--display);
        font-size: 1.25rem;
        color: var(--text);
        margin-bottom: 12px;
      }
      .gw-desc {
        font-family: var(--body);
        font-size: 0.82rem;
        color: var(--muted);
        line-height: 1.7;
        max-width: 360px;
      }
      .gw-desc strong { color: var(--ai-glow); }
      .gw-dots {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .gw-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--border);
        transition: all 0.3s;
      }
      .gw-dot.active {
        background: var(--ai-glow);
        box-shadow: 0 0 8px var(--ai-glow);
      }
      .gw-dot.done { background: var(--success); }
      .gw-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 20px;
        border-top: 1px solid var(--border);
      }
      .gw-btn-next { padding: 8px 24px !important; font-size: 0.75rem !important; }
      .gw-btn-back { padding: 6px 16px; font-size: 0.7rem; }
      .gw-instruction {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        font-size: 0.82rem;
        color: var(--text);
      }
      .gw-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px; height: 24px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--ai-glow) 15%, var(--surface));
        color: var(--ai-glow);
        font-family: var(--mono);
        font-size: 0.7rem;
        font-weight: 700;
        flex-shrink: 0;
      }
      .gw-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 20px;
        padding: 10px 20px;
        background: color-mix(in srgb, var(--ai-glow) 10%, var(--surface));
        border: 1px solid var(--ai-glow);
        border-radius: 6px;
        color: var(--ai-glow);
        font-family: var(--mono);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-decoration: none;
        transition: all 0.2s;
      }
      .gw-link-btn:hover {
        background: color-mix(in srgb, var(--ai-glow) 20%, var(--surface));
        box-shadow: 0 0 16px color-mix(in srgb, var(--ai-glow) 20%, transparent);
      }
      .gw-key-row {
        display: flex;
        gap: 6px;
        align-items: center;
        width: 100%;
        max-width: 360px;
      }
      .gw-status {
        margin-top: 16px;
        font-family: var(--mono);
        font-size: 0.72rem;
        min-height: 1.2em;
      }
    `;
    document.head.appendChild(style);
  }
}
