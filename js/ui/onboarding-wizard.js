/**
 * OnboardingWizard — first-run setup for new users.
 * Guides through: system check → local AI (Ollama) → cloud AI explanation
 * → cloud provider choice → API key → done.
 *
 * Wraps GeminiWizard for Gemini-specific key setup; handles Anthropic/OpenAI inline.
 * Triggered automatically on first launch and via a persistent header button.
 */

const OLLAMA_URL = 'http://localhost:11434';
const RECOMMENDED_MODELS = [
  { name: 'gemma3:4b',          label: 'Gemma 3 4B',         size: '3 GB',  speed: 'Fast — recommended',   default: true },
  { name: 'llama3.2:3b',        label: 'Llama 3.2 3B',       size: '2 GB',  speed: 'Lightest option' },
  { name: 'mistral:7b-instruct', label: 'Mistral 7B Instruct', size: '5 GB', speed: 'Better writing quality' },
];
const CLOUD_PROVIDERS = [
  {
    key: 'google',
    name: 'Gemini',
    by: 'Google',
    badge: 'FREE TIER',
    badgeColor: 'var(--success)',
    desc: 'Free tier available — no credit card needed',
    detail: '10 req/min · 250 req/day on free plan',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    recommended: true,
  },
  {
    key: 'anthropic',
    name: 'Claude',
    by: 'Anthropic',
    badge: 'PAY-PER-USE',
    badgeColor: 'var(--accent2)',
    desc: 'Best quality — Haiku is very affordable',
    detail: 'Haiku ~$0.001 per 1k tokens',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    key: 'openai',
    name: 'GPT-4o',
    by: 'OpenAI',
    badge: 'PAY-PER-USE',
    badgeColor: 'var(--accent2)',
    desc: 'Most widely used — GPT-4o Mini is fast & cheap',
    detail: '4o-mini ~$0.0015 per 1k tokens',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
  },
];

export class OnboardingWizard {
  constructor(aiClient, geminiWizard) {
    this.client = aiClient;
    this._geminiWizard = geminiWizard;
    this._el = null;
    this._step = 1;
    this._pulling = false;
    // State accumulated across steps
    this._state = {
      serverAvailable: false,
      ollamaAvailable: false,
      ollamaModels: [],
      selectedLocalModel: 'gemma3:4b',
      selectedProvider: null,  // 'google' | 'anthropic' | 'openai' | null
      cloudConfigured: false,
    };
    this.onComplete = null;
  }

  get _isGitHubPages() {
    return window.location.hostname === 'fiavaion.github.io';
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
    overlay.id = 'onboardingWizardModal';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="folder-modal ow-modal" role="dialog" aria-modal="true" aria-labelledby="owTitle">
        <div class="folder-modal-header">
          <span class="folder-modal-title" id="owTitle" style="color:var(--accent)">SETUP WIZARD</span>
          <div class="ow-dots" id="owDots"></div>
          <button class="folder-modal-close" id="owClose" aria-label="Close">&times;</button>
        </div>
        <div class="ow-body" id="owBody"></div>
        <div class="ow-actions" id="owActions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._el = overlay;
    this._el.querySelector('#owClose').onclick = () => this.close();
    this._injectStyles();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  _renderStep() {
    this._renderDots();
    const body = this._el.querySelector('#owBody');
    const actions = this._el.querySelector('#owActions');
    body.innerHTML = '';
    actions.innerHTML = '';
    switch (this._step) {
      case 1: this._step1(body, actions); break;
      case 2: this._step2(body, actions); break;
      case 3: this._step3(body, actions); break;
      case 4: this._step4(body, actions); break;
      case 5: this._step5(body, actions); break;
      case 6: this._step6(body, actions); break;
      case 7: this._step7(body, actions); break;
    }
  }

  _renderDots() {
    const total = this._isGitHubPages ? 5 : 7;
    const dots = this._el.querySelector('#owDots');
    dots.innerHTML = Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      const actual = this._isGitHubPages ? [1, 4, 5, 6, 7][i] : n;
      const cls = actual === this._step ? 'active' : actual < this._step ? 'done' : '';
      return `<span class="ow-dot ${cls}"></span>`;
    }).join('');
  }

  _goTo(n) {
    this._step = n;
    this._renderStep();
  }

  // ── Step 1: Welcome ──────────────────────────────────────────────────────────

  _step1(body, actions) {
    body.innerHTML = `
      <div class="ow-hero">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="8" y1="22" x2="16" y2="22"/>
        </svg>
      </div>
      <div class="ow-title">Welcome to FiavaionDictate</div>
      <div class="ow-desc">
        Browser-based voice dictation with AI correction.<br>
        This wizard will get you fully set up in a few minutes —
        no technical knowledge required.
      </div>
      <div class="ow-checklist">
        <div class="ow-check-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Set up local AI — free, private, works offline</span>
        </div>
        <div class="ow-check-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Optional cloud AI for faster, smarter results</span>
        </div>
        <div class="ow-check-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Ready to dictate immediately after</span>
        </div>
      </div>
    `;
    actions.innerHTML = `
      <span></span>
      <button class="btn-mic ow-btn-next" id="owNext"><span>GET STARTED →</span></button>
    `;
    this._el.querySelector('#owNext').onclick = () =>
      this._goTo(this._isGitHubPages ? 4 : 2);
  }

  // ── Step 2: System Check ─────────────────────────────────────────────────────

  _step2(body, actions) {
    body.innerHTML = `
      <div class="ow-title">Checking Your System</div>
      <div class="ow-desc" style="margin-bottom:20px">Checking what's installed on your machine…</div>
      <div class="ow-checklist ow-system-list" id="owSysChecks">
        <div class="ow-sys-row" id="owCheckServer">
          <span class="ow-spin"></span>
          <span>FiavaionDictate server</span>
          <span class="ow-sys-result"></span>
        </div>
        <div class="ow-sys-row" id="owCheckOllama">
          <span class="ow-spin"></span>
          <span>Ollama (local AI)</span>
          <span class="ow-sys-result"></span>
        </div>
      </div>
    `;
    actions.innerHTML = `
      <span></span>
      <button class="btn-mic ow-btn-next" id="owNext" disabled><span>NEXT →</span></button>
    `;
    const next = this._el.querySelector('#owNext');
    next.onclick = () => this._goTo(3);

    this._runSystemCheck().then(() => {
      next.disabled = false;
    });
  }

  async _runSystemCheck() {
    const setRow = (id, ok, text) => {
      const row = this._el?.querySelector(`#${id}`);
      if (!row) return;
      const spin = row.querySelector('.ow-spin');
      const result = row.querySelector('.ow-sys-result');
      if (spin) {
        spin.outerHTML = ok
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      }
      if (result) result.textContent = text;
    };

    // Check server
    try {
      const r = await fetch('/api/projects', { signal: AbortSignal.timeout(3000) });
      this._state.serverAvailable = r.ok;
      setRow('owCheckServer', r.ok, r.ok ? 'Running' : 'Not responding');
    } catch {
      this._state.serverAvailable = false;
      setRow('owCheckServer', false, 'Not running');
    }

    // Check Ollama
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        this._state.ollamaModels = (data.models || []).map(m => m.name);
        this._state.ollamaAvailable = true;
        const count = this._state.ollamaModels.length;
        setRow('owCheckOllama', true, count > 0 ? `${count} model${count > 1 ? 's' : ''} ready` : 'Installed, no models');
      } else {
        throw new Error('bad status');
      }
    } catch {
      this._state.ollamaAvailable = false;
      this._state.ollamaModels = [];
      setRow('owCheckOllama', false, 'Not found');
    }
  }

  // ── Step 3: Local AI Setup ───────────────────────────────────────────────────

  _step3(body, actions) {
    if (this._state.ollamaAvailable && this._state.ollamaModels.length > 0) {
      this._step3_hasModels(body, actions);
    } else if (this._state.ollamaAvailable) {
      this._step3_noModels(body, actions);
    } else {
      this._step3_noOllama(body, actions);
    }
  }

  _step3_hasModels(body, actions) {
    const opts = this._state.ollamaModels.map(name => {
      const rec = RECOMMENDED_MODELS.find(m => name.startsWith(m.name.split(':')[0]));
      return `<option value="${name}"${rec?.default ? ' selected' : ''}>${name}${rec ? ` — ${rec.speed}` : ''}</option>`;
    }).join('');

    body.innerHTML = `
      <div class="ow-icon-success">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div class="ow-title">Local AI Ready</div>
      <div class="ow-desc">Ollama is installed and you have ${this._state.ollamaModels.length} model${this._state.ollamaModels.length > 1 ? 's' : ''} available. Choose which one to use for dictation correction:</div>
      <div class="ow-field">
        <label class="ow-label">Active model</label>
        <select class="ai-settings-input" id="owModelSelect" style="width:100%">${opts}</select>
      </div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <button class="btn-mic ow-btn-next" id="owNext"><span>USE THIS MODEL →</span></button>
    `;
    this._el.querySelector('#owBack').onclick = () => this._goTo(2);
    this._el.querySelector('#owNext').onclick = () => {
      const sel = this._el.querySelector('#owModelSelect');
      if (sel) this._state.selectedLocalModel = sel.value;
      this.client.setSelectedModel('ollama', this._state.selectedLocalModel);
      this._goTo(4);
    };
  }

  _step3_noModels(body, actions) {
    const opts = RECOMMENDED_MODELS.map(m =>
      `<option value="${m.name}"${m.default ? ' selected' : ''}>${m.label} (${m.size}) — ${m.speed}</option>`
    ).join('');

    body.innerHTML = `
      <div class="ow-title">Download a Model</div>
      <div class="ow-desc">Ollama is installed but no AI models are downloaded yet. Choose one to download:</div>
      <div class="ow-field">
        <label class="ow-label">Choose model</label>
        <select class="ai-settings-input" id="owModelSelect" style="width:100%">${opts}</select>
      </div>
      <div class="ow-pull-area" id="owPullArea" style="display:none">
        <div class="ow-progress-bar"><div class="ow-progress-fill" id="owProgressFill"></div></div>
        <div class="ow-pull-status" id="owPullStatus">Starting download…</div>
      </div>
      <div class="ow-status" id="owStatus"></div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <button class="btn-mic ow-btn-next" id="owPullBtn"><span>DOWNLOAD MODEL</span></button>
    `;
    this._el.querySelector('#owBack').onclick = () => this._goTo(2);
    this._el.querySelector('#owPullBtn').onclick = () => this._startPull();
  }

  _step3_noOllama(body, actions) {
    body.innerHTML = `
      <div class="ow-title">Install Ollama</div>
      <div class="ow-desc">
        <strong>Ollama</strong> is free, open-source software that runs AI on your computer.
        Nothing is sent to the internet — your dictation stays completely private.
      </div>
      <div class="ow-checklist" style="margin:16px 0">
        <div class="ow-check-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ai-glow)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Free forever — no subscription</span></div>
        <div class="ow-check-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ai-glow)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Works offline — no internet required</span></div>
        <div class="ow-check-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ai-glow)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Private — nothing leaves your machine</span></div>
        <div class="ow-check-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ai-glow)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Requires ~3 GB disk space for a model</span></div>
      </div>
      <a class="ow-link-btn" href="https://ollama.ai" target="_blank" rel="noopener" id="owOllamaLink">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        DOWNLOAD OLLAMA (FREE)
      </a>
      <div class="ow-install-hint" id="owInstallHint" style="display:none">
        After installing, click <strong>Check Again</strong> below to continue.
      </div>
      <div class="ow-status" id="owStatus" style="margin-top:12px"></div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <div style="display:flex;gap:8px">
        <button class="btn-mic ow-btn-next" id="owCheckAgain"><span>CHECK AGAIN</span></button>
        <button class="btn-secondary" id="owSkipLocal" style="opacity:0.6">SKIP →</button>
      </div>
    `;
    this._el.querySelector('#owOllamaLink').onclick = () => {
      this._el.querySelector('#owInstallHint').style.display = 'block';
    };
    this._el.querySelector('#owBack').onclick = () => this._goTo(2);
    this._el.querySelector('#owSkipLocal').onclick = () => this._goTo(4);
    this._el.querySelector('#owCheckAgain').onclick = async () => {
      this._showStatus('owStatus', 'Checking for Ollama…', 'var(--muted)');
      try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (r.ok) {
          const data = await r.json();
          this._state.ollamaAvailable = true;
          this._state.ollamaModels = (data.models || []).map(m => m.name);
          this._showStatus('owStatus', 'Ollama found! Loading…', 'var(--success)');
          setTimeout(() => this._goTo(3), 600);
        } else throw new Error();
      } catch {
        this._showStatus('owStatus', 'Still not detected — make sure Ollama is running after install', 'var(--danger)');
      }
    };
  }

  async _startPull() {
    if (this._pulling) return;
    const sel = this._el?.querySelector('#owModelSelect');
    const model = sel?.value || 'gemma3:4b';
    this._state.selectedLocalModel = model;

    const pullArea = this._el?.querySelector('#owPullArea');
    const pullBtn = this._el?.querySelector('#owPullBtn');
    const backBtn = this._el?.querySelector('#owBack');
    if (pullArea) pullArea.style.display = 'block';
    if (pullBtn) { pullBtn.disabled = true; pullBtn.querySelector('span').textContent = 'DOWNLOADING…'; }
    if (backBtn) backBtn.disabled = true;
    if (sel) sel.disabled = true;
    this._pulling = true;

    const success = await this._pullModel(model, (pct, statusText) => {
      const fill = this._el?.querySelector('#owProgressFill');
      const status = this._el?.querySelector('#owPullStatus');
      if (fill) fill.style.width = pct + '%';
      if (status) status.textContent = statusText;
    });

    this._pulling = false;
    if (success) {
      this._state.ollamaModels = [model];
      this.client.setSelectedModel('ollama', model);
      const status = this._el?.querySelector('#owPullStatus');
      if (status) { status.textContent = 'Download complete!'; status.style.color = 'var(--success)'; }
      setTimeout(() => this._goTo(4), 800);
    } else {
      if (pullBtn) { pullBtn.disabled = false; pullBtn.querySelector('span').textContent = 'RETRY'; }
      if (backBtn) backBtn.disabled = false;
      this._showStatus('owStatus', 'Download failed — check your internet connection and try again', 'var(--danger)');
    }
  }

  async _pullModel(name, onProgress) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });
      if (!res.ok) return false;

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.total && d.completed) {
              const pct = Math.round((d.completed / d.total) * 100);
              const mb = Math.round(d.completed / 1024 / 1024);
              const total = Math.round(d.total / 1024 / 1024);
              onProgress(pct, `Downloading… ${mb} / ${total} MB (${pct}%)`);
            } else if (d.status) {
              onProgress(d.status === 'success' ? 100 : 0, d.status);
            }
            if (d.status === 'success') return true;
          } catch { /* skip malformed lines */ }
        }
      }
      return true;
    } catch { return false; }
  }

  // ── Step 4: Cloud AI Explanation ─────────────────────────────────────────────

  _step4(body, actions) {
    const localConfigured = this._state.ollamaAvailable || this._state.ollamaModels.length > 0;
    const githubNote = this._isGitHubPages
      ? `<div class="ow-info-box">💡 Local AI requires the desktop app. <a href="https://github.com/Fiavaion/dictate" target="_blank" rel="noopener" style="color:var(--accent)">Download here</a> to run it on your machine.</div>`
      : '';

    body.innerHTML = `
      <div class="ow-title">Cloud AI — Optional Upgrade</div>
      <div class="ow-desc" style="margin-bottom:16px">
        ${localConfigured ? 'Your local AI is ready. You can also add a cloud AI for better results.' : 'You can use cloud AI without local setup.'}
      </div>
      ${githubNote}
      <div class="ow-compare">
        <div class="ow-compare-col">
          <div class="ow-compare-head" style="color:var(--success)">LOCAL AI</div>
          <div class="ow-compare-item good">Free forever</div>
          <div class="ow-compare-item good">Completely private</div>
          <div class="ow-compare-item good">Works offline</div>
          <div class="ow-compare-item good">No accounts needed</div>
          <div class="ow-compare-item bad">Slower responses</div>
          <div class="ow-compare-item bad">Needs ~3 GB disk</div>
        </div>
        <div class="ow-compare-divider"></div>
        <div class="ow-compare-col">
          <div class="ow-compare-head" style="color:var(--ai-glow)">CLOUD AI</div>
          <div class="ow-compare-item good">Faster &amp; smarter</div>
          <div class="ow-compare-item good">No GPU required</div>
          <div class="ow-compare-item good">Always up to date</div>
          <div class="ow-compare-item good">Free tier available</div>
          <div class="ow-compare-item bad">Requires internet</div>
          <div class="ow-compare-item bad">May cost money</div>
        </div>
      </div>
    `;
    const backStep = this._isGitHubPages ? 1 : 3;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-secondary" id="owSkipCloud" style="font-size:0.68rem">NO THANKS, LOCAL IS FINE</button>
        <button class="btn-mic ow-btn-next" id="owNext"><span>SET UP CLOUD AI →</span></button>
      </div>
    `;
    this._el.querySelector('#owBack').onclick = () => this._goTo(backStep);
    this._el.querySelector('#owSkipCloud').onclick = () => {
      this._state.selectedProvider = null;
      this._goTo(7);
    };
    this._el.querySelector('#owNext').onclick = () => this._goTo(5);
  }

  // ── Step 5: Cloud Provider Choice ────────────────────────────────────────────

  _step5(body, actions) {
    const cards = CLOUD_PROVIDERS.map(p => `
      <div class="ow-provider-card${p.recommended ? ' ow-provider-recommended' : ''}" data-provider="${p.key}" id="owCard-${p.key}">
        <div class="ow-provider-badge" style="background:color-mix(in srgb,${p.badgeColor} 15%,var(--surface));color:${p.badgeColor}">${p.badge}</div>
        <div class="ow-provider-name">${p.name}</div>
        <div class="ow-provider-by">by ${p.by}</div>
        <div class="ow-provider-desc">${p.desc}</div>
        <div class="ow-provider-detail">${p.detail}</div>
      </div>
    `).join('');

    body.innerHTML = `
      <div class="ow-title">Choose a Cloud Provider</div>
      <div class="ow-desc" style="margin-bottom:16px">Gemini has a generous free tier — great for most users.</div>
      <div class="ow-provider-grid">${cards}</div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <button class="btn-mic ow-btn-next" id="owNext" disabled><span>CONTINUE →</span></button>
    `;

    // Pre-select Gemini
    this._state.selectedProvider = 'google';
    this._el.querySelector('#owCard-google')?.classList.add('selected');

    const next = this._el.querySelector('#owNext');
    next.disabled = false;

    this._el.querySelectorAll('.ow-provider-card').forEach(card => {
      card.onclick = () => {
        this._el.querySelectorAll('.ow-provider-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._state.selectedProvider = card.dataset.provider;
        next.disabled = false;
      };
    });

    this._el.querySelector('#owBack').onclick = () => this._goTo(4);
    next.onclick = () => this._goTo(6);
  }

  // ── Step 6: API Key Setup ─────────────────────────────────────────────────────

  _step6(body, actions) {
    const p = CLOUD_PROVIDERS.find(c => c.key === this._state.selectedProvider);
    if (!p) { this._goTo(7); return; }

    const existing = this.client.getApiKey(p.key) || '';
    body.innerHTML = `
      <div class="ow-title">Connect ${p.name}</div>
      <div class="ow-desc" style="text-align:left;margin-bottom:16px">
        <div class="ow-instruction"><span class="gw-num">1</span> Click the button below to open ${p.by}'s API key page</div>
        <div class="ow-instruction"><span class="gw-num">2</span> ${p.key === 'google' ? 'Sign in and click <strong>Create API Key</strong>' : 'Create a new API key'}</div>
        <div class="ow-instruction"><span class="gw-num">3</span> Copy and paste the key below</div>
      </div>
      <a class="ow-link-btn" href="${p.keyUrl}" target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        OPEN ${p.by.toUpperCase()} API KEYS
      </a>
      <div class="ow-field" style="margin-top:16px">
        <div class="gw-key-row">
          <input class="ai-settings-input" id="owApiKey" type="password" value="${existing}" placeholder="${p.keyPlaceholder}" style="flex:1">
          <button class="ai-settings-eye" id="owEye" title="Show/hide key">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <label class="ai-settings-checkbox-row" style="margin-top:8px">
          <input type="checkbox" id="owRemember" checked>
          <span>Remember key in browser</span>
        </label>
      </div>
      <div class="ow-status" id="owStatus"></div>
    `;
    actions.innerHTML = `
      <button class="btn-secondary ow-btn-back" id="owBack">← BACK</button>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" id="owSkipKey" style="opacity:0.6;font-size:0.68rem">SKIP FOR NOW</button>
        <button class="btn-mic ow-btn-next" id="owTestBtn"><span>TEST &amp; CONTINUE →</span></button>
      </div>
    `;

    const keyInput = this._el.querySelector('#owApiKey');
    this._el.querySelector('#owEye').onclick = () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    };
    this._el.querySelector('#owBack').onclick = () => this._goTo(5);
    this._el.querySelector('#owSkipKey').onclick = () => {
      this._state.selectedProvider = null;
      this._goTo(7);
    };
    this._el.querySelector('#owTestBtn').onclick = () => this._testCloudKey();
  }

  async _testCloudKey() {
    const p = CLOUD_PROVIDERS.find(c => c.key === this._state.selectedProvider);
    if (!p) return;
    const keyInput = this._el?.querySelector('#owApiKey');
    const remember = this._el?.querySelector('#owRemember');
    const key = keyInput?.value.trim();
    if (!key) { this._showStatus('owStatus', 'Please enter an API key', 'var(--danger)'); return; }

    const btn = this._el?.querySelector('#owTestBtn');
    if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'TESTING…'; }
    this._showStatus('owStatus', 'Testing connection…', 'var(--muted)');

    const prev = this.client.provider;
    this.client.setApiKey(p.key, key, remember?.checked ?? true);
    this.client.setProvider(p.key);

    const result = await this.client.checkConnection();
    const errLower = (result.error || '').toLowerCase();
    const isRateLimit = errLower.includes('quota') || errLower.includes('rate') || errLower.includes('429');

    if (result.ok || isRateLimit) {
      const msg = isRateLimit ? 'Key valid! (rate-limited — will work shortly)' : 'Connected!';
      this._showStatus('owStatus', msg, 'var(--success)');
      this._state.cloudConfigured = true;
      setTimeout(() => this._goTo(7), 800);
    } else {
      this.client.setProvider(prev);
      const short = (result.error || 'Connection failed').split('.')[0].slice(0, 120);
      this._showStatus('owStatus', short, 'var(--danger)');
      if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'TEST & CONTINUE →'; }
    }
  }

  // ── Step 7: Complete ──────────────────────────────────────────────────────────

  _step7(body, actions) {
    const localModel = this._state.selectedLocalModel || this.client.getSelectedModel('ollama') || 'not configured';
    const cloudProvider = this._state.cloudConfigured ? CLOUD_PROVIDERS.find(p => p.key === this._state.selectedProvider) : null;

    const localLine = this._state.ollamaAvailable || this._state.ollamaModels.length > 0
      ? `<div class="ow-summary-row good"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Local AI: <strong>${localModel}</strong></span></div>`
      : `<div class="ow-summary-row muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Local AI: not configured — install Ollama later to enable</span></div>`;

    const cloudLine = cloudProvider
      ? `<div class="ow-summary-row good"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Cloud AI: <strong>${cloudProvider.name}</strong> (${cloudProvider.by})</span></div>`
      : `<div class="ow-summary-row muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Cloud AI: not configured — add anytime from the <strong>⚙</strong> button</span></div>`;

    body.innerHTML = `
      <div class="ow-icon-success">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div class="ow-title">You're All Set!</div>
      <div class="ow-desc" style="margin-bottom:20px">Here's what's configured:</div>
      <div class="ow-summary">
        ${localLine}
        ${cloudLine}
      </div>
      <div class="ow-desc" style="margin-top:16px;font-size:0.75rem">
        Click the mic button and start talking. Your dictation will be automatically cleaned up by AI.
      </div>
    `;
    actions.innerHTML = `
      <span></span>
      <button class="btn-mic ow-btn-next" id="owFinish"><span>START DICTATING →</span></button>
    `;
    this._el.querySelector('#owFinish').onclick = () => this._finish();
  }

  _finish() {
    this.close();
    if (this.onComplete) this.onComplete({
      localModel: this._state.selectedLocalModel,
      cloudProvider: this._state.cloudConfigured ? this._state.selectedProvider : null,
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  _showStatus(id, text, color) {
    const el = this._el?.querySelector(`#${id}`);
    if (!el) return;
    el.textContent = text;
    el.style.color = color || 'var(--muted)';
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('onboarding-wizard-styles')) return;
    const style = document.createElement('style');
    style.id = 'onboarding-wizard-styles';
    style.textContent = `
      .ow-modal { max-width: 500px; width: 100%; display: flex; flex-direction: column; }
      .ow-body {
        padding: 24px 24px 12px;
        min-height: 260px;
        display: flex; flex-direction: column; align-items: center;
        overflow-y: auto; max-height: 60vh;
      }
      .ow-actions {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 20px; border-top: 1px solid var(--border);
        flex-shrink: 0;
      }
      .ow-title {
        font-family: var(--display); font-size: 1.2rem;
        color: var(--text); margin-bottom: 10px; text-align: center;
      }
      .ow-desc {
        font-family: var(--body); font-size: 0.82rem;
        color: var(--muted); line-height: 1.7; text-align: center; max-width: 420px;
      }
      .ow-desc strong { color: var(--text); }
      .ow-hero { margin-bottom: 16px; }
      .ow-icon-success { margin-bottom: 12px; }
      .ow-dots { display: flex; gap: 6px; align-items: center; }
      .ow-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--border); transition: all 0.3s;
      }
      .ow-dot.active { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
      .ow-dot.done { background: var(--success); }
      .ow-btn-next { padding: 8px 20px !important; font-size: 0.73rem !important; }
      .ow-btn-back { padding: 6px 14px; font-size: 0.7rem; }
      .ow-checklist {
        display: flex; flex-direction: column; gap: 8px;
        align-items: flex-start; margin-top: 12px; width: 100%; max-width: 360px;
      }
      .ow-check-item {
        display: flex; align-items: center; gap: 8px;
        font-family: var(--body); font-size: 0.8rem; color: var(--text);
      }
      .ow-system-list { width: 100%; max-width: 380px; gap: 10px; }
      .ow-sys-row {
        display: flex; align-items: center; gap: 10px;
        font-family: var(--body); font-size: 0.82rem; color: var(--text);
        background: var(--surface); border-radius: 6px; padding: 10px 14px;
        width: 100%;
      }
      .ow-sys-result { margin-left: auto; color: var(--muted); font-size: 0.75rem; }
      @keyframes ow-spin { to { transform: rotate(360deg); } }
      .ow-spin {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid var(--border); border-top-color: var(--accent);
        border-radius: 50%; animation: ow-spin 0.7s linear infinite; flex-shrink: 0;
      }
      .ow-field { width: 100%; max-width: 380px; margin-top: 12px; }
      .ow-label { font-family: var(--mono); font-size: 0.68rem; color: var(--muted); display: block; margin-bottom: 4px; letter-spacing: 0.06em; }
      .ow-status {
        font-family: var(--mono); font-size: 0.72rem; min-height: 1.2em;
        margin-top: 10px; text-align: center;
      }
      .ow-pull-area { width: 100%; max-width: 380px; margin-top: 14px; }
      .ow-progress-bar {
        height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden;
      }
      .ow-progress-fill {
        height: 100%; width: 0; background: var(--accent);
        border-radius: 3px; transition: width 0.3s;
      }
      .ow-pull-status {
        font-family: var(--mono); font-size: 0.7rem;
        color: var(--muted); margin-top: 6px; text-align: center;
      }
      .ow-link-btn {
        display: inline-flex; align-items: center; gap: 8px; margin-top: 16px;
        padding: 10px 20px;
        background: color-mix(in srgb, var(--accent) 10%, var(--surface));
        border: 1px solid var(--accent); border-radius: 6px;
        color: var(--accent); font-family: var(--mono); font-size: 0.72rem;
        letter-spacing: 0.08em; text-decoration: none; transition: all 0.2s;
      }
      .ow-link-btn:hover {
        background: color-mix(in srgb, var(--accent) 20%, var(--surface));
        box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 20%, transparent);
      }
      .ow-install-hint {
        margin-top: 14px;
        padding: 10px 14px;
        background: color-mix(in srgb, var(--success) 10%, var(--surface));
        border: 1px solid var(--success);
        border-radius: 6px;
        font-family: var(--body);
        font-size: 0.8rem;
        color: var(--text);
        text-align: center;
        max-width: 340px;
      }
      .ow-install-hint strong { color: var(--success); }
      .ow-info-box {
        background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
        border-radius: 6px; padding: 10px 14px;
        font-family: var(--body); font-size: 0.78rem; color: var(--muted);
        width: 100%; max-width: 420px; margin-bottom: 12px; line-height: 1.5;
      }
      .ow-compare {
        display: flex; gap: 0; width: 100%; max-width: 420px;
        background: var(--surface); border-radius: 8px; overflow: hidden;
        border: 1px solid var(--border);
      }
      .ow-compare-col { flex: 1; padding: 14px 12px; }
      .ow-compare-head {
        font-family: var(--mono); font-size: 0.68rem; font-weight: 700;
        letter-spacing: 0.1em; margin-bottom: 10px;
      }
      .ow-compare-divider { width: 1px; background: var(--border); }
      .ow-compare-item {
        font-family: var(--body); font-size: 0.75rem; padding: 3px 0;
        display: flex; align-items: center; gap: 5px; line-height: 1.4;
      }
      .ow-compare-item.good { color: var(--text); }
      .ow-compare-item.good::before { content: '✓'; color: var(--success); font-size: 0.7rem; }
      .ow-compare-item.bad { color: var(--muted); }
      .ow-compare-item.bad::before { content: '✗'; color: var(--danger); font-size: 0.7rem; }
      .ow-provider-grid {
        display: flex; gap: 10px; width: 100%; max-width: 440px;
      }
      .ow-provider-card {
        flex: 1; padding: 14px 10px; background: var(--surface);
        border: 2px solid var(--border); border-radius: 8px;
        cursor: pointer; transition: all 0.2s; text-align: center;
        position: relative;
      }
      .ow-provider-card:hover { border-color: var(--muted); }
      .ow-provider-card.selected {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 15%, transparent);
      }
      .ow-provider-recommended::after {
        content: '★ RECOMMENDED';
        position: absolute; top: -9px; left: 50%; transform: translateX(-50%);
        background: var(--accent); color: var(--bg);
        font-family: var(--mono); font-size: 0.55rem; font-weight: 700;
        padding: 2px 7px; border-radius: 20px; white-space: nowrap;
      }
      .ow-provider-badge {
        font-family: var(--mono); font-size: 0.58rem; font-weight: 700;
        padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px;
      }
      .ow-provider-name {
        font-family: var(--display); font-size: 0.95rem; color: var(--text);
        margin-bottom: 2px;
      }
      .ow-provider-by {
        font-family: var(--body); font-size: 0.68rem; color: var(--muted); margin-bottom: 8px;
      }
      .ow-provider-desc {
        font-family: var(--body); font-size: 0.72rem; color: var(--text); line-height: 1.4;
        margin-bottom: 6px;
      }
      .ow-provider-detail {
        font-family: var(--mono); font-size: 0.65rem; color: var(--muted);
      }
      .ow-summary {
        display: flex; flex-direction: column; gap: 8px;
        width: 100%; max-width: 380px;
      }
      .ow-summary-row {
        display: flex; align-items: flex-start; gap: 8px;
        font-family: var(--body); font-size: 0.82rem;
        background: var(--surface); border-radius: 6px; padding: 10px 14px;
      }
      .ow-summary-row.good { color: var(--text); border-left: 3px solid var(--success); }
      .ow-summary-row.muted { color: var(--muted); border-left: 3px solid var(--border); }
      .ow-summary-row strong { color: var(--text); }
      .gw-key-row { display: flex; gap: 6px; align-items: center; width: 100%; }
      .ow-instruction {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 0; font-size: 0.8rem; color: var(--text);
        font-family: var(--body); width: 100%;
      }
      .ow-instruction strong { color: var(--ai-glow); }
    `;
    document.head.appendChild(style);
  }
}
