/**
 * FiavaionDictate — Main App Controller
 * Orchestrates STT, AI correction, prompt structuring, and UI.
 */

import { WebSpeechEngine } from './stt/web-speech-engine.js';
import { AutoPunctuation } from './stt/auto-punctuation.js';
import { VocabularyManager } from './stt/vocabulary-manager.js';
import { CommandParser } from './stt/command-parser.js';
import { OllamaClient } from './ai/ollama-client.js';
import { CorrectionPipeline } from './ai/correction-pipeline.js';
import { PromptStructurer } from './ai/prompt-structurer.js';
import { getAllTemplates } from './ai/prompt-templates.js';
import { copyToClipboard } from './utils/clipboard.js';
import { saveSession, loadSession, clearSession, saveSettings, loadSettings } from './utils/persistence.js';
import { fetchProjects, sortByModified, sortByName, saveProjectSettings, loadProjectSettings } from './utils/projects.js';

// ══════════════════════════════════════════
// State
// ══════════════════════════════════════════
const state = {
  isRecording: false,
  rawTranscript: '',
  interimTranscript: '',
  sessionStart: null,
  sessionTimer: null,
  lastConfidence: 0,
  aiPanelOpen: true,
  diffViewOn: false,
  structuredPrompt: '',
  copyMenuOpen: false,
  autoSaveTimer: null,
};

// ══════════════════════════════════════════
// Projects
// ══════════════════════════════════════════
let allProjects = [];
let projectSortMode = 'modified'; // 'modified' | 'alpha'

async function loadProjectSelector() {
  allProjects = await fetchProjects();
  renderProjectSelector();
  // Restore last-used project selection
  const settings = loadSettings();
  if (settings.activeProject && $('projectSelect')) {
    $('projectSelect').value = settings.activeProject;
  }
}

function renderProjectSelector() {
  const select = $('projectSelect');
  if (!select) return;
  const sorted = projectSortMode === 'modified'
    ? sortByModified(allProjects)
    : sortByName(allProjects);
  select.innerHTML = '<option value="">— Project —</option>';
  for (const p of sorted) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
}

function onProjectSelected(name) {
  if (!name) return;
  const project = allProjects.find(p => p.name === name);
  if (!project) return;

  const saved = loadProjectSettings(name);

  // Apply project name to context
  const projectInput = $('projectContext');
  if (projectInput) {
    projectInput.value = name;
    promptStructurer.projectContext = name;
  }

  // Apply stack — saved overrides auto-detected
  const stackInput = $('stackContext');
  if (stackInput) {
    stackInput.value = saved.stack || project.stack || '';
    promptStructurer.stackContext = stackInput.value;
  }

  // Apply saved model if available
  if (saved.correctionModel && $('modelSelect')) {
    correctionPipeline.setModel(saved.correctionModel);
    $('modelSelect').value = saved.correctionModel;
  }

  // Apply saved template if available
  if (saved.template) {
    promptStructurer.setTemplate(saved.template);
    renderTemplateSelector();
  }

  // Persist active project to global settings
  const s = loadSettings();
  s.activeProject = name;
  s.projectContext = name;
  s.stackContext = stackInput?.value || '';
  saveSettings(s);

  flashCmd('PROJECT: ' + name.toUpperCase());
}

// ══════════════════════════════════════════
// DOM References
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);

// ══════════════════════════════════════════
// Modules
// ══════════════════════════════════════════
const vocab = new VocabularyManager();
const autoPunct = new AutoPunctuation('auto');
const commandParser = new CommandParser();
const ollamaClient = new OllamaClient();

const sttEngine = new WebSpeechEngine({
  lang: 'en-US',
  maxAlternatives: 1,
  onInterim: (text) => {
    state.interimTranscript = text;
    renderTranscript();
  },
  onFinal: (text, confidence, alts) => {
    state.lastConfidence = confidence;
    updateConfidence(confidence);
    state.interimTranscript = '';

    // Try command first
    if (commandParser.process(text)) {
      renderTranscript();
      updateStats();
      return;
    }

    // Auto-punctuation
    const punctuated = autoPunct.join(state.rawTranscript, text);
    commandParser.pushUndo();
    state.rawTranscript = punctuated;

    // Feed to AI correction pipeline
    correctionPipeline.onNewText(autoPunct.process(text));

    renderTranscript();
    updateStats();
  },
  onStart: () => setStatus('active', 'LISTENING'),
  onStop: () => {
    if (!state.isRecording) setStatus('idle', 'READY');
  },
  onError: (err) => {
    if (err === 'not-allowed') stopRecording();
    setStatus('error', 'ERROR: ' + err.toUpperCase());
  },
});

const correctionPipeline = new CorrectionPipeline(ollamaClient, {
  model: 'gemma3:4b',
  debounceMs: 600,
  onCorrectionStart: () => {
    setAIStatus('thinking');
    $('paneDivider')?.classList.add('ai-active');
  },
  onCorrectionToken: (text) => {
    renderRefined(text);
  },
  onCorrectionDone: (fullText, diffs) => {
    setAIStatus('connected');
    $('paneDivider')?.classList.remove('ai-active');
    renderRefined(fullText);
    renderCorrections(diffs);
    autoSave();
  },
  onError: (err) => {
    console.warn('Correction error:', err);
    setAIStatus('connected');
  },
});

const promptStructurer = new PromptStructurer(ollamaClient, {
  model: 'mistral:7b-instruct',
  onStructureStart: () => {
    setAIStatus('thinking');
    $('structuredOutput').textContent = '';
  },
  onStructureToken: (text) => {
    $('structuredOutput').textContent = text;
    const el = $('structuredOutput');
    el.scrollTop = el.scrollHeight;
  },
  onStructureDone: (text) => {
    state.structuredPrompt = text;
    setAIStatus('connected');
    autoSave();
  },
  onError: (err) => {
    console.warn('Structure error:', err);
    $('structuredOutput').textContent = 'Error: ' + err;
    setAIStatus('connected');
  },
});

// ══════════════════════════════════════════
// Wire up command parser
// ══════════════════════════════════════════
commandParser.getTranscript = () => state.rawTranscript;
commandParser.setTranscript = (t) => { state.rawTranscript = t; };
commandParser.onFlash = (msg, count) => {
  flashCmd(msg);
  $('cmdCount').textContent = count;
};
commandParser.onTranscriptChange = () => {
  renderTranscript();
  updateStats();
};
commandParser.onStopRecording = () => stopRecording();
commandParser.onStartRecording = () => startRecording();
commandParser.onScrollTop = () => { $('rawScroll').scrollTop = 0; };
commandParser.onScrollBottom = () => { const s = $('rawScroll'); s.scrollTop = s.scrollHeight; };
commandParser.onCopyRaw = () => copyRaw();
commandParser.onCopyRefined = () => copyRefined();
commandParser.onCopyStructured = () => copyStructured();
commandParser.onCopyToClaude = () => copyToClaude();
commandParser.onAICorrect = () => correctionPipeline.forceCorrect();
commandParser.onAIStructure = () => doStructure();
commandParser.onAISetTemplate = (name) => {
  if (promptStructurer.setTemplate(name)) renderTemplateSelector();
};
commandParser.onAIShowDiff = () => toggleDiffView();
commandParser.onAIReadBack = () => readBack();
commandParser.onToggleAIPanel = () => toggleAIPanel();
commandParser.onAIIgnoreLast = () => {
  // Remove last correction segment, use raw instead
  if (correctionPipeline.correctedSegments.length > 0) {
    correctionPipeline.correctedSegments.pop();
    const lastRaw = correctionPipeline.rawSegments[correctionPipeline.rawSegments.length - 1] || '';
    correctionPipeline.correctedSegments.push(lastRaw);
    renderRefined(correctionPipeline.correctedText);
  }
};
commandParser.onAIAcceptAll = () => {
  state.rawTranscript = correctionPipeline.correctedText || state.rawTranscript;
  renderTranscript();
};

// ══════════════════════════════════════════
// VU Meter
// ══════════════════════════════════════════
const vuBars = [];
function initVU() {
  const meter = $('vuMeter');
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('div');
    b.className = 'vu-bar';
    b.style.height = '3px';
    meter.appendChild(b);
    vuBars.push(b);
  }
}

// ══════════════════════════════════════════
// Audio / Canvas
// ══════════════════════════════════════════
let audioCtx = null, analyser = null;
const canvas = $('waveCanvas');
const ctx2d = canvas.getContext('2d');
let waveData = new Float32Array(256);

function resizeCanvas() { canvas.width = innerWidth; canvas.height = innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawWave() {
  requestAnimationFrame(drawWave);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (!analyser) return;
  analyser.getFloatTimeDomainData(waveData);
  ctx2d.beginPath();

  // Shift color when AI is processing
  const isAI = correctionPipeline.isActive || promptStructurer.isActive;
  const accentColor = isAI
    ? getComputedStyle(document.body).getPropertyValue('--ai-glow').trim() || '#7b6ef6'
    : getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#b8ff57';
  ctx2d.strokeStyle = accentColor;
  ctx2d.lineWidth = 1.5;

  const sw = canvas.width / waveData.length;
  waveData.forEach((v, i) => {
    const y = (v * 0.5 + 0.5) * canvas.height;
    i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * sw, y);
  });
  ctx2d.stroke();

  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const step = Math.floor(freq.length / 18);
  vuBars.forEach((b, i) => {
    const val = freq[i * step] / 255;
    b.style.height = Math.max(3, val * 28) + 'px';
    if (state.isRecording) {
      const hue = isAI ? 250 + val * 30 : 74 + val * 40;
      b.style.background = `hsl(${hue}, 100%, ${45 + val * 20}%)`;
    } else {
      b.style.background = 'var(--border)';
    }
  });
}

async function startAudio() {
  try {
    const stream = await WebSpeechEngine.getMicStream();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
  } catch (e) { console.warn('Audio:', e); }
}

// ══════════════════════════════════════════
// Recording
// ══════════════════════════════════════════
async function startRecording() {
  if (!WebSpeechEngine.isSupported) { showNotSupported(); return; }
  if (state.isRecording) return;

  if (!audioCtx) await startAudio();

  const prof = PROFILES[state.currentProfile];
  sttEngine.setLang($('langSelect').value);
  sttEngine.setMaxAlternatives(prof.maxAlts);
  sttEngine.start(vocab.allHints);

  state.isRecording = true;
  $('btnMic').classList.add('recording');
  $('btnLabel').textContent = 'STOP';

  if (!state.sessionStart) {
    state.sessionStart = Date.now();
    state.sessionTimer = setInterval(updateSessionTime, 1000);
  }
}

function stopRecording() {
  state.isRecording = false;
  sttEngine.stop();
  $('btnMic').classList.remove('recording');
  $('btnLabel').textContent = 'START';
  clearInterval(state.sessionTimer);
  state.sessionTimer = null;
  state.interimTranscript = '';
  setStatus('idle', 'READY');
  renderTranscript();
  vuBars.forEach(b => { b.style.height = '3px'; b.style.background = 'var(--border)'; });
}

function toggleRecording() {
  state.isRecording ? stopRecording() : startRecording();
}

function clearAll() {
  stopRecording();
  state.rawTranscript = '';
  state.interimTranscript = '';
  state.structuredPrompt = '';
  state.sessionStart = null;
  state.lastConfidence = 0;
  commandParser.reset();
  correctionPipeline.reset();
  $('cmdCount').textContent = '0';
  $('sessionTime').textContent = '0:00';
  updateStats();
  updateConfidence(0);
  renderTranscript();
  renderRefined('');
  renderCorrections([]);
  $('structuredOutput').textContent = '';
  clearSession();

  const el = $('rawContent');
  el.innerHTML = '';
  const ph = document.createElement('span');
  ph.className = 'placeholder';
  ph.id = 'placeholder';
  ph.textContent = 'Press SPACE or click START to begin dictating\u2026';
  el.appendChild(ph);
}

// ══════════════════════════════════════════
// Rendering
// ══════════════════════════════════════════
function escapeHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTranscript() {
  const el = $('rawContent');
  const ph = $('placeholder');

  if (!state.rawTranscript && !state.interimTranscript) {
    el.innerHTML = '';
    if (!ph) {
      const newPh = document.createElement('span');
      newPh.className = 'placeholder';
      newPh.id = 'placeholder';
      newPh.textContent = 'Press SPACE or click START to begin dictating\u2026';
      el.appendChild(newPh);
    } else {
      el.appendChild(ph);
    }
    return;
  }
  if (ph) ph.remove();

  const paragraphs = state.rawTranscript.split('\n\n');
  let html = paragraphs.map(p =>
    `<span class="final-text">${p.split('\n').map(escapeHtml).join('<br>')}</span>`
  ).join('<br><br>');

  if (state.interimTranscript) {
    html += ` <span class="interim-text">${escapeHtml(state.interimTranscript)}</span>`;
  }
  el.innerHTML = html;
  const scroll = $('rawScroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function renderRefined(text) {
  const el = $('refinedContent');
  if (!text) {
    el.innerHTML = '<span class="placeholder">AI-corrected text will appear here\u2026</span>';
    return;
  }
  const paragraphs = text.split('\n\n');
  el.innerHTML = paragraphs.map(p =>
    `<span class="final-text">${p.split('\n').map(escapeHtml).join('<br>')}</span>`
  ).join('<br><br>');
  const scroll = $('refinedScroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function renderCorrections(diffs) {
  const list = $('correctionList');
  if (!diffs || diffs.length === 0) {
    // Keep existing corrections
    if (list.children.length === 0) {
      list.innerHTML = '<div class="correction-empty">No corrections yet</div>';
    }
    return;
  }

  // Append new corrections
  const empty = list.querySelector('.correction-empty');
  if (empty) empty.remove();

  for (const d of diffs) {
    if (!d.original && !d.corrected) continue;
    const item = document.createElement('div');
    item.className = 'correction-item';
    if (d.original) {
      item.innerHTML = `<span class="original">${escapeHtml(d.original)}</span> \u2192 <span class="corrected">${escapeHtml(d.corrected)}</span>`;
    } else {
      item.innerHTML = `<span class="corrected">+ ${escapeHtml(d.corrected)}</span>`;
    }
    list.appendChild(item);
  }

  // Keep only last 20 corrections visible
  while (list.children.length > 20) {
    list.removeChild(list.firstChild);
  }
}

// ══════════════════════════════════════════
// Status & Stats
// ══════════════════════════════════════════
function setStatus(type, text) {
  const pill = $('statusPill');
  pill.className = 'status-pill';
  if (type !== 'idle') pill.classList.add(type);
  $('statusText').textContent = text;
}

function setAIStatus(status) {
  const el = $('aiStatusBadge');
  if (!el) return;
  el.className = 'ai-status';
  if (status === 'connected') {
    el.classList.add('connected');
    el.querySelector('.ai-label').textContent = correctionPipeline.model.toUpperCase();
  } else if (status === 'thinking') {
    el.classList.add('connected', 'thinking');
    el.querySelector('.ai-label').textContent = 'THINKING';
  } else {
    el.querySelector('.ai-label').textContent = 'OFFLINE';
  }
}

function updateStats() {
  const t = state.rawTranscript.trim();
  $('wordCount').textContent = t ? t.split(/\s+/).length : 0;
  $('charCount').textContent = t.length;
}

function updateSessionTime() {
  if (!state.sessionStart) return;
  const s = Math.floor((Date.now() - state.sessionStart) / 1000);
  $('sessionTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateConfidence(val) {
  const pct = Math.round(val * 100);
  $('confidenceBar').style.width = pct + '%';
  $('confidenceVal').textContent = pct ? pct + '%' : '\u2014';
}

// ══════════════════════════════════════════
// Toast
// ══════════════════════════════════════════
let toastTimer = null;
function flashCmd(msg) {
  const t = $('cmdToast');
  t.textContent = '\u2318 ' + msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ══════════════════════════════════════════
// AI Panel
// ══════════════════════════════════════════
function toggleAIPanel() {
  state.aiPanelOpen = !state.aiPanelOpen;
  $('app').classList.toggle('ai-panel-open', state.aiPanelOpen);
  $('btnAI')?.classList.toggle('active', state.aiPanelOpen);
}

function toggleDiffView() {
  state.diffViewOn = !state.diffViewOn;
  // Simple diff: show raw in refined pane with strikethrough for changed words
  if (state.diffViewOn) {
    flashCmd('DIFF ON');
  } else {
    flashCmd('DIFF OFF');
    renderRefined(correctionPipeline.correctedText);
  }
}

async function doStructure() {
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO STRUCTURE'); return; }
  await promptStructurer.structure(text);
}

function readBack() {
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO READ'); return; }
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

// ══════════════════════════════════════════
// Template Selector
// ══════════════════════════════════════════
function renderTemplateSelector() {
  const container = $('templateSelector');
  if (!container) return;
  const all = getAllTemplates();
  container.innerHTML = '';
  for (const [key, tmpl] of Object.entries(all)) {
    const btn = document.createElement('button');
    btn.className = 'template-btn' + (key === promptStructurer.currentTemplate ? ' active' : '');
    btn.textContent = tmpl.label;
    btn.title = tmpl.description;
    btn.onclick = () => {
      promptStructurer.setTemplate(key);
      renderTemplateSelector();
      _saveCurrentProjectSettings();
    };
    container.appendChild(btn);
  }
}

// ══════════════════════════════════════════
// Model Selector
// ══════════════════════════════════════════
function renderModelSelector() {
  const select = $('modelSelect');
  if (!select) return;
  select.innerHTML = '';
  if (!ollamaClient.models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No models';
    select.appendChild(opt);
    return;
  }
  for (const m of ollamaClient.models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = `${m.name} (${m.size})`;
    select.appendChild(opt);
  }
  select.value = correctionPipeline.model;

  select.onchange = () => {
    correctionPipeline.setModel(select.value);
    const settings = loadSettings();
    settings.correctionModel = select.value;
    saveSettings(settings);
    _saveCurrentProjectSettings();
  };
}

// ══════════════════════════════════════════
// Copy
// ══════════════════════════════════════════
async function copyRaw(silent) {
  const ok = await copyToClipboard(state.rawTranscript.trim());
  if (ok && !silent) showCopied('RAW COPIED');
}

async function copyRefined() {
  const text = correctionPipeline.correctedText || state.rawTranscript.trim();
  const ok = await copyToClipboard(text);
  if (ok) showCopied('REFINED COPIED');
}

async function copyStructured() {
  if (!state.structuredPrompt) { flashCmd('NO STRUCTURED PROMPT'); return; }
  const ok = await copyToClipboard(state.structuredPrompt);
  if (ok) showCopied('STRUCTURED COPIED');
}

async function copyToClaude() {
  const text = correctionPipeline.correctedText || state.rawTranscript.trim();
  if (!text) { flashCmd('NOTHING TO COPY'); return; }
  const ok = await copyToClipboard(text);
  if (ok) {
    showCopied('READY — PASTE IN VS CODE');
    // Show a persistent hint toast for 4s
    const toast = $('cmdToast');
    toast.textContent = '📋 Switch to VS Code → Ctrl+V';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  }
}

function showCopied(label) {
  const btn = $('btnCopy');
  btn.classList.add('copied');
  btn.textContent = label || 'COPIED!';
  setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'COPY'; }, 1800);
}

function toggleCopyMenu() {
  state.copyMenuOpen = !state.copyMenuOpen;
  $('copyDropdown').classList.toggle('show', state.copyMenuOpen);
}


function toggleCmdPanel() {
  $('cmdPanel').classList.toggle('open');
}

// ══════════════════════════════════════════
// Persistence
// ══════════════════════════════════════════
function autoSave() {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => {
    saveSession({
      rawTranscript: state.rawTranscript,
      refinedTranscript: correctionPipeline.correctedText,
      structuredPrompt: state.structuredPrompt,
      corrections: correctionPipeline.corrections.slice(-50),
      template: promptStructurer.currentTemplate,
      lang: $('langSelect').value,
    });
  }, 2000);
}

function restoreSession() {
  const session = loadSession();
  if (!session || !session.rawTranscript) return false;
  state.rawTranscript = session.rawTranscript;
  state.structuredPrompt = session.structuredPrompt || '';

  // Restore language
  if (session.lang) $('langSelect').value = session.lang;

  // Restore template
  if (session.template) promptStructurer.setTemplate(session.template);

  // Render
  renderTranscript();
  if (session.refinedTranscript) renderRefined(session.refinedTranscript);
  if (session.structuredPrompt) $('structuredOutput').textContent = session.structuredPrompt;
  updateStats();
  renderTemplateSelector();

  return true;
}

// ══════════════════════════════════════════
// Keyboard
// ══════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

  if (e.code === 'Space')  { e.preventDefault(); toggleRecording(); }
  if (e.code === 'Escape') {
    if (state.isRecording) stopRecording();
    $('cmdPanel').classList.remove('open');
    $('copyDropdown')?.classList.remove('show');
    state.copyMenuOpen = false;
  }

  // Ctrl+Shift combos
  if (e.ctrlKey && e.shiftKey) {
    if (e.code === 'KeyA') { e.preventDefault(); toggleAIPanel(); }
    if (e.code === 'KeyS') { e.preventDefault(); doStructure(); }
    if (e.code === 'KeyD') { e.preventDefault(); toggleDiffView(); }
    if (e.code === 'KeyC') { e.preventDefault(); copyRefined(); }
    if (e.code === 'KeyR') { e.preventDefault(); copyRaw(); }
    if (e.code === 'KeyV') { e.preventDefault(); copyToClaude(); }
    if (e.code === 'KeyT') { e.preventDefault(); cycleTemplate(); }
    return;
  }

  if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) copyRefined();
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commandParser.doUndo(); renderTranscript(); updateStats(); }
});

function cycleTemplate() {
  const keys = Object.keys(getAllTemplates());
  const currentIdx = keys.indexOf(promptStructurer.currentTemplate);
  const next = keys[(currentIdx + 1) % keys.length];
  promptStructurer.setTemplate(next);
  renderTemplateSelector();
  flashCmd('TEMPLATE: ' + getAllTemplates()[next].label.toUpperCase());
}

// Close copy menu on outside click
document.addEventListener('click', e => {
  if (state.copyMenuOpen && !e.target.closest('.copy-group')) {
    state.copyMenuOpen = false;
    $('copyDropdown')?.classList.remove('show');
  }
});

// ══════════════════════════════════════════
// Not Supported
// ══════════════════════════════════════════
function showNotSupported() {
  $('app').innerHTML = `<div style="grid-row:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--danger);text-align:center">
    <h2 style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em">NOT SUPPORTED</h2>
    <p style="color:var(--muted);font-size:.85rem;max-width:400px;line-height:1.7">Web Speech API unavailable.<br>Please use <strong>Chrome</strong> or <strong>Edge</strong>.</p>
  </div>`;
}

// ══════════════════════════════════════════
// Language change
// ══════════════════════════════════════════
$('langSelect').addEventListener('change', () => {
  sttEngine.setLang($('langSelect').value);
  if (state.isRecording) { stopRecording(); setTimeout(startRecording, 200); }
});

// ══════════════════════════════════════════
// Init
// ══════════════════════════════════════════
function _saveCurrentProjectSettings() {
  const s = loadSettings();
  const name = s.activeProject;
  if (!name) return;
  saveProjectSettings(name, {
    stack: $('stackContext')?.value || '',
    correctionModel: correctionPipeline.model,
    template: promptStructurer.currentTemplate,
  });
}

function init() {
  // Check browser support
  if (!WebSpeechEngine.isSupported) {
    setTimeout(showNotSupported, 100);
    return;
  }

  // Init VU meter
  initVU();
  drawWave();

  // Load settings
  const settings = loadSettings();
  if (settings.correctionModel) correctionPipeline.setModel(settings.correctionModel);
  if (settings.structureModel) promptStructurer.setModel(settings.structureModel);
  if (settings.aiEnabled === false) correctionPipeline.setEnabled(false);

  // Restore session
  const restored = restoreSession();
  if (restored) flashCmd('SESSION RESTORED');

  // Render template selector
  renderTemplateSelector();

  // Start AI panel open by default
  $('app').classList.add('ai-panel-open');

  // Connect to Ollama
  ollamaClient.startMonitoring(10000, (connected, models) => {
    if (connected) {
      setAIStatus('connected');
      renderModelSelector();
      // Warmup the correction model
      ollamaClient.warmup(correctionPipeline.model);
    } else {
      setAIStatus('offline');
    }
  });

  // Auto-correct toggle
  const aiToggle = $('aiToggle');
  if (aiToggle) {
    aiToggle.checked = correctionPipeline.enabled;
    aiToggle.onchange = () => {
      correctionPipeline.setEnabled(aiToggle.checked);
      const s = loadSettings();
      s.aiEnabled = aiToggle.checked;
      saveSettings(s);
    };
  }

  // Context inputs — save to global settings + per-project settings
  const projectInput = $('projectContext');
  if (projectInput) {
    projectInput.value = settings.projectContext || '';
    projectInput.onchange = () => {
      promptStructurer.projectContext = projectInput.value;
      const s = loadSettings();
      s.projectContext = projectInput.value;
      saveSettings(s);
      _saveCurrentProjectSettings();
    };
  }
  const stackInput = $('stackContext');
  if (stackInput) {
    stackInput.value = settings.stackContext || '';
    stackInput.onchange = () => {
      promptStructurer.stackContext = stackInput.value;
      const s = loadSettings();
      s.stackContext = stackInput.value;
      saveSettings(s);
      _saveCurrentProjectSettings();
    };
  }

  // Project selector
  const projectSelect = $('projectSelect');
  if (projectSelect) {
    projectSelect.onchange = () => onProjectSelected(projectSelect.value);
  }
  const btnSort = $('btnSortProjects');
  if (btnSort) {
    btnSort.onclick = () => {
      projectSortMode = projectSortMode === 'modified' ? 'alpha' : 'modified';
      btnSort.innerHTML = projectSortMode === 'modified' ? '&#9201;' : 'AZ';
      btnSort.title = projectSortMode === 'modified' ? 'Sort: Recent first' : 'Sort: A–Z';
      renderProjectSelector();
      // Re-select current project after re-render
      const s = loadSettings();
      if (s.activeProject && projectSelect) projectSelect.value = s.activeProject;
    };
  }

  // Load project list (async — non-blocking)
  loadProjectSelector();
}

// ══════════════════════════════════════════
// Expose to HTML onclick handlers
// ══════════════════════════════════════════
window.toggleRecording = toggleRecording;
window.clearAll = clearAll;
window.toggleCmdPanel = toggleCmdPanel;
window.toggleAIPanel = toggleAIPanel;
window.copyRaw = copyRaw;
window.copyRefined = copyRefined;
window.copyStructured = copyStructured;
window.copyToClaude = copyToClaude;
window.toggleCopyMenu = toggleCopyMenu;
window.doStructure = doStructure;

// Boot
init();
