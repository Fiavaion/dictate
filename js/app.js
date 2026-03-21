/**
 * FiavaionDictate — Main App Controller
 * Orchestrates STT, AI correction, prompt structuring, and UI.
 */

import { WebSpeechEngine } from './stt/web-speech-engine.js';
import { AutoPunctuation } from './stt/auto-punctuation.js';
import { VocabularyManager } from './stt/vocabulary-manager.js';
import { CommandParser } from './stt/command-parser.js';
import { AIClient } from './ai/ai-client.js';
import { CorrectionPipeline } from './ai/correction-pipeline.js';
import { PromptStructurer } from './ai/prompt-structurer.js';
import { getAllTemplates } from './ai/prompt-templates.js';
import { APISettingsModal } from './ui/api-settings.js';
import { copyToClipboard } from './utils/clipboard.js';
import { saveSession, loadSession, clearSession, saveSettings, loadSettings,
  loadSessionsIndex, saveSessionToList, loadSavedSession, deleteSessionFromList,
  renameSession, exportSessions, importSessions } from './utils/persistence.js';
import { fetchProjects, sortByModified, sortByName, saveProjectSettings, loadProjectSettings } from './utils/projects.js';

// ── New modules ──
import { PromptBuilder } from './ui/prompt-builder.js';
import { AmbientDetector } from './stt/ambient-detector.js';
import { CorrectionLearner } from './stt/correction-learner.js';
import { AnalyticsDashboard } from './ui/analytics-dashboard.js';
import { ConfidenceHeatmap } from './ui/confidence-heatmap.js';
import { SessionSearch } from './utils/session-search.js';
import { SearchResultsModal } from './ui/search-results.js';
import { MacroRecorder } from './stt/macro-recorder.js';
import { CommandComposer } from './stt/command-composer.js';
import { CommandBuilderModal } from './ui/command-builder.js';
import { SessionTimeline } from './utils/timeline.js';
import { TimelineViewer } from './ui/timeline-viewer.js';
import { GhostPredictor } from './ai/ghost-predictor.js';
import { MultiFormatter } from './ai/multi-formatter.js';
import { FormatCardsModal } from './ui/format-cards.js';
import { DiagramGenerator } from './ai/diagram-generator.js';
import { DiagramRenderer } from './ui/diagram-renderer.js';
import { ContextInjector } from './ai/context-injector.js';

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
  structureView: false,
  serverAvailable: true,
  currentSessionId: null,
  sessionListSaveTimer: null,
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

// ══════════════════════════════════════════
// Projects Folder
// ══════════════════════════════════════════
let currentProjectsRoot = '';
let browserCurrentPath = '';

async function loadProjectsRoot() {
  try {
    const res = await fetch('/api/projects-root');
    if (!res.ok) return;
    const data = await res.json();
    currentProjectsRoot = data.path || '';
  } catch { /* server unavailable */ }
}

async function openFolderBrowser() {
  $('folderModal').style.display = 'flex';
  await browseTo(currentProjectsRoot || null);
}

function closeFolderBrowser() {
  $('folderModal').style.display = 'none';
}

async function browseTo(path) {
  const url = path
    ? '/api/browse?path=' + encodeURIComponent(path)
    : '/api/browse';
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) { flashCmd('ERROR: ' + data.error); return; }
    browserCurrentPath = data.path;
    $('browserPath').textContent = data.path;

    // Render drive buttons
    const drivesEl = $('browserDrives');
    drivesEl.innerHTML = '';
    if (data.drives) {
      for (const d of data.drives) {
        const btn = document.createElement('button');
        btn.className = 'folder-drive-btn';
        btn.textContent = d;
        btn.onclick = () => browseTo(d);
        drivesEl.appendChild(btn);
      }
    }

    // Render folder list
    const listEl = $('browserList');
    listEl.innerHTML = '';

    // Parent directory entry
    if (data.parent) {
      const parentItem = document.createElement('div');
      parentItem.className = 'folder-item folder-item-parent';
      parentItem.innerHTML = '<span class="folder-item-icon">..</span> <span>Parent folder</span>';
      parentItem.onclick = () => browseTo(data.parent);
      listEl.appendChild(parentItem);
    }

    // Subdirectories
    for (const name of data.dirs) {
      const item = document.createElement('div');
      item.className = 'folder-item';
      item.innerHTML = `<span class="folder-item-icon">&#128193;</span> <span>${name}</span>`;
      const sep = browserCurrentPath.includes('/') ? '/' : '\\';
      const childPath = browserCurrentPath.replace(/[\\/]$/, '') + sep + name;
      item.ondblclick = () => browseTo(childPath);
      item.onclick = () => {
        // Single click highlights, updates path display
        listEl.querySelectorAll('.folder-item').forEach(el => el.style.background = '');
        item.style.background = 'color-mix(in srgb, var(--accent2) 20%, var(--panel))';
        $('browserPath').textContent = childPath;
      };
      listEl.appendChild(item);
    }

    if (data.dirs.length === 0 && !data.parent) {
      listEl.innerHTML = '<div class="folder-item" style="color:var(--muted);cursor:default">No subdirectories</div>';
    }
  } catch {
    flashCmd('ERROR: SERVER UNAVAILABLE');
  }
}

async function selectBrowserFolder() {
  const selectedPath = $('browserPath').textContent.trim();
  if (!selectedPath) return;
  try {
    const res = await fetch('/api/projects-root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selectedPath }),
    });
    const data = await res.json();
    if (!res.ok) {
      flashCmd('ERROR: ' + (data.error || 'Invalid path'));
      return;
    }
    currentProjectsRoot = data.path;
    closeFolderBrowser();
    await loadProjectSelector();
    flashCmd('PROJECTS FOLDER: ' + data.path);
  } catch {
    flashCmd('ERROR: SERVER UNAVAILABLE');
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

  // Apply saved model if available — skip if it's from a different provider type
  if (saved.correctionModel && $('modelSelect')) {
    const isCloud = aiClient.providerConfig && !aiClient.providerConfig.local;
    const looksLocal = saved.correctionModel.includes(':');
    if (!(isCloud && looksLocal)) {
      correctionPipeline.setModel(saved.correctionModel);
      $('modelSelect').value = saved.correctionModel;
    }
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

  // Scan project for context injection
  contextInjector.scanProject(name).then(ctx => {
    if (ctx) {
      const contextBlock = contextInjector.getContextBlock();
      if (contextBlock) {
        correctionPipeline.projectContext = contextBlock;
        promptStructurer.projectContext = name;
      }
    }
  });

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
const aiClient = new AIClient();
const apiSettingsModal = new APISettingsModal(aiClient);

// ── New module instances ──
const promptBuilder = new PromptBuilder(aiClient);
const ambientDetector = new AmbientDetector();
const correctionLearner = new CorrectionLearner();
const analyticsDashboard = new AnalyticsDashboard();
const confidenceHeatmap = new ConfidenceHeatmap();
const sessionSearch = new SessionSearch(aiClient);
const searchResultsModal = new SearchResultsModal(sessionSearch);
const macroRecorder = new MacroRecorder();
const commandComposer = new CommandComposer();
const commandBuilderModal = new CommandBuilderModal(commandComposer);
const sessionTimeline = new SessionTimeline();
const timelineViewer = new TimelineViewer(sessionTimeline);
const ghostPredictor = new GhostPredictor(aiClient);
const multiFormatter = new MultiFormatter(aiClient);
const formatCardsModal = new FormatCardsModal(multiFormatter);
const diagramGenerator = new DiagramGenerator(aiClient);
const diagramRenderer = new DiagramRenderer();
const contextInjector = new ContextInjector();

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

    // Confidence heatmap tracking
    confidenceHeatmap.addSegment(text, confidence, alts || []);

    // Timeline recording
    sessionTimeline.record('stt-final', { text, confidence });

    // Check custom commands first (CommandComposer)
    const composerMatch = commandComposer.tryMatch(text);
    if (composerMatch) {
      commandComposer.execute(composerMatch.trigger, {
        rawTranscript: state.rawTranscript,
        template: promptStructurer.currentTemplate,
        project: $('projectContext')?.value || '',
      }, async (step) => {
        if (step.action === 'command') commandParser.process(step.value);
        else if (step.action === 'text') {
          commandParser.pushUndo();
          state.rawTranscript += step.value;
          renderTranscript();
        } else if (step.action === 'template') {
          if (promptStructurer.setTemplate(step.value)) renderTemplateSelector();
        } else if (step.action === 'copy') {
          if (step.value === 'raw') copyRaw();
          else if (step.value === 'refined') copyRefined();
          else if (step.value === 'structured') copyStructured();
        }
      });
      sessionTimeline.record('command', { action: 'custom', arg: composerMatch.trigger });
      if (macroRecorder.isRecording) macroRecorder.recordStep('command', text);
      renderTranscript();
      updateStats();
      return;
    }

    // Try built-in command
    if (commandParser.process(text)) {
      sessionTimeline.record('command', { action: text });
      if (macroRecorder.isRecording) macroRecorder.recordStep('command', text);
      renderTranscript();
      updateStats();
      return;
    }

    // Macro recording — record text step
    if (macroRecorder.isRecording) macroRecorder.recordStep('text', text);

    // Auto-punctuation
    const punctuated = autoPunct.join(state.rawTranscript, text);
    commandParser.pushUndo();
    state.rawTranscript = punctuated;

    // Feed to AI correction pipeline
    correctionPipeline.onNewText(autoPunct.process(text));

    // Ghost predictor — reset pause timer on new activity
    ghostPredictor.onActivity(state.rawTranscript, promptStructurer.currentTemplate, $('projectContext')?.value || '');

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

const correctionPipeline = new CorrectionPipeline(aiClient, {
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
    // Feed diffs to correction learner
    if (diffs && diffs.length > 0) {
      correctionLearner.observeDiffs(diffs);
      sessionTimeline.record('correction', { count: diffs.length, original: diffs[0]?.original, corrected: diffs[0]?.corrected });
    }
  },
  onError: (err) => {
    console.warn('Correction error:', err);
    setAIStatus('connected');
  },
});

const promptStructurer = new PromptStructurer(aiClient, {
  model: 'mistral:7b-instruct',
  onStructureStart: () => {
    setAIStatus('thinking');
    state.structureView = true;
    $('refinedLabel').textContent = 'STRUCTURED PROMPT';
    $('refinedLabel').classList.add('structured');
    $('btnStructure')?.classList.add('active');
    $('refinedContent').innerHTML = '';
  },
  onStructureToken: (text) => {
    renderStructuredInPane(text);
  },
  onStructureDone: (text) => {
    state.structuredPrompt = text;
    setAIStatus('connected');
    renderStructuredInPane(text);
    autoSave();
    sessionTimeline.record('structure', { template: promptStructurer.currentTemplate });
  },
  onError: (err) => {
    console.warn('Structure error:', err);
    $('refinedContent').innerHTML = `<span class="placeholder">Error: ${escapeHtml(err)}</span>`;
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
commandParser.onTranscriptChange = (newText) => {
  renderTranscript();
  updateStats();
  // If transcript was cleared, reset correction pipeline and refined pane
  if (!newText) {
    correctionPipeline.reset();
    renderRefined('');
    renderCorrections([]);
  }
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
commandParser.onNewSession = () => startNewSession();
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
    // Wire ambient detector to the analyser
    ambientDetector.setAnalyser(analyser);
    ambientDetector.start();
  } catch (e) { console.warn('Audio:', e); }
}

// ══════════════════════════════════════════
// Recording
// ══════════════════════════════════════════
async function startRecording() {
  if (!WebSpeechEngine.isSupported) { showNotSupported(); return; }
  if (state.isRecording) return;

  if (!audioCtx) await startAudio();

  sttEngine.setLang($('langSelect').value);
  sttEngine.setMaxAlternatives(1);
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
  saveCurrentSessionToList();

  stopRecording();
  state.rawTranscript = '';
  state.interimTranscript = '';
  state.structuredPrompt = '';
  state.sessionStart = null;
  state.lastConfidence = 0;
  state.currentSessionId = null;
  commandParser.reset();
  correctionPipeline.reset();
  confidenceHeatmap.clear();
  sessionTimeline.clear();
  sessionTimeline.record('clear');
  ghostPredictor.dismiss();
  $('cmdCount').textContent = '0';
  $('sessionTime').textContent = '0:00';
  updateStats();
  updateConfidence(0);
  renderTranscript();
  state.structureView = false;
  $('refinedLabel').textContent = 'AI-CORRECTED OUTPUT';
  $('refinedLabel').classList.remove('structured');
  renderRefined('');
  renderCorrections([]);
  clearSession();

  const el = $('rawContent');
  el.innerHTML = '';
  const ph = document.createElement('span');
  ph.className = 'placeholder';
  ph.id = 'placeholder';
  ph.textContent = 'Press SPACE or click START to begin dictating\u2026';
  el.appendChild(ph);

  const settings = loadSettings();
  settings.currentSessionId = null;
  saveSettings(settings);
  renderSessionSelector();
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
      newPh.textContent = 'Press SPACE or click START to begin dictating, or paste text here\u2026';
      el.appendChild(newPh);
    } else {
      el.appendChild(ph);
    }
    return;
  }
  if (ph) ph.remove();

  // Use confidence heatmap rendering when enabled
  const heatmapHtml = confidenceHeatmap.renderHtml();
  let html;
  if (heatmapHtml) {
    html = heatmapHtml;
    if (state.interimTranscript) {
      html += ` <span class="interim-text">${escapeHtml(state.interimTranscript)}</span>`;
    }
  } else {
    const paragraphs = state.rawTranscript.split('\n\n');
    html = paragraphs.map(p =>
      `<span class="final-text">${p.split('\n').map(escapeHtml).join('<br>')}</span>`
    ).join('<br><br>');
    if (state.interimTranscript) {
      html += ` <span class="interim-text">${escapeHtml(state.interimTranscript)}</span>`;
    }
  }
  el.innerHTML = html;
  // Attach heatmap click handlers when active
  if (heatmapHtml) confidenceHeatmap.attachClickHandlers(el);
  const scroll = $('rawScroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function renderRefined(text) {
  // Switch back from structure view when new corrections arrive
  if (state.structureView) {
    state.structureView = false;
    $('refinedLabel').textContent = 'AI-CORRECTED OUTPUT';
    $('refinedLabel').classList.remove('structured');
  }
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

  // Update count badge
  const countEl = $('correctionCount');
  if (countEl) {
    const count = list.querySelectorAll('.correction-item').length;
    countEl.textContent = count;
    countEl.classList.toggle('has-corrections', count > 0);
  }
  // Auto-expand when corrections arrive
  if (diffs.length > 0) {
    list.classList.remove('corrections-collapsed');
    list.classList.add('corrections-expanded');
  }
}

function toggleCorrections() {
  const list = $('correctionList');
  list.classList.toggle('corrections-collapsed');
  list.classList.toggle('corrections-expanded');
}
window.toggleCorrections = toggleCorrections;

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

function renderStructuredInPane(text) {
  const el = $('refinedContent');
  const paragraphs = text.split('\n');
  el.innerHTML = paragraphs.map(line =>
    `<span class="final-text structured-line">${escapeHtml(line)}</span>`
  ).join('<br>');
  const scroll = $('refinedScroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function exitStructureView() {
  state.structureView = false;
  $('refinedLabel').textContent = 'AI-CORRECTED OUTPUT';
  $('refinedLabel').classList.remove('structured');
  $('btnStructure')?.classList.remove('active');
  // Restore the corrected text
  renderRefined(correctionPipeline.correctedText || '');
}

async function doStructure({ force = false } = {}) {
  // If already in structure view with content, toggle back (unless forced re-gen)
  if (!force && state.structureView && state.structuredPrompt) {
    exitStructureView();
    return;
  }
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO STRUCTURE'); return; }
  await promptStructurer.structure(text);
}

// ── TTS Voice ──
const TTS_DEFAULT_VOICE = 'Google UK English Female';

function getSelectedVoice() {
  if (!('speechSynthesis' in window)) return null;
  const sel = $('voiceSelect');
  const name = sel ? sel.value : (loadSettings().ttsVoice || TTS_DEFAULT_VOICE);
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.name === name) || null;
}

function populateVoiceSelector() {
  const sel = $('voiceSelect');
  if (!sel || !('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return;
  const saved = loadSettings().ttsVoice || '';
  sel.innerHTML = '';
  // Default placeholder option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose voice\u2026';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.hidden = true;
  sel.appendChild(placeholder);
  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + (v.lang ? ` (${v.lang})` : '');
    if (v.name === saved) opt.selected = true;
    sel.appendChild(opt);
  }
  // Auto-select default if nothing saved or saved voice not found
  if (!saved || !voices.find(v => v.name === saved)) {
    const preferred = voices.find(v => v.name === TTS_DEFAULT_VOICE)
      || voices.find(v => v.name.toLowerCase().includes('uk english female'))
      || voices.find(v => v.name.toLowerCase().includes('english') && v.name.toLowerCase().includes('female'));
    if (preferred) {
      sel.value = preferred.name;
      const s = loadSettings();
      s.ttsVoice = preferred.name;
      saveSettings(s);
    }
  }
  sel.onchange = () => {
    const s = loadSettings();
    s.ttsVoice = sel.value;
    saveSettings(s);
  };
}

function initVoiceSelector() {
  if (!('speechSynthesis' in window)) return;
  populateVoiceSelector();
  // Chrome loads voices asynchronously
  speechSynthesis.onvoiceschanged = () => populateVoiceSelector();
}

function readBack() {
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO READ'); return; }
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  }
}

function readPane(pane) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();

  let text = '';
  if (pane === 'raw') {
    text = state.rawTranscript;
  } else {
    text = (state.structureView && state.structuredPrompt)
      ? state.structuredPrompt
      : (correctionPipeline.correctedText || state.rawTranscript);
  }

  if (!text || !text.trim()) { flashCmd('NOTHING TO READ'); return; }
  if (!('speechSynthesis' in window)) { flashCmd('TTS NOT SUPPORTED'); return; }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  const voice = getSelectedVoice();
  if (voice) utterance.voice = voice;
  flashCmd('READING ' + (pane === 'raw' ? 'RAW' : 'REFINED'));
  speechSynthesis.speak(utterance);
  utterance.onend = () => flashCmd('DONE READING');
}
window.readPane = readPane;

// ══════════════════════════════════════════
// Pane copy
// ══════════════════════════════════════════
async function copyPaneContent(pane) {
  let text = '';
  if (pane === 'refined') {
    // If in structure view, copy structured prompt; otherwise copy refined
    if (state.structureView && state.structuredPrompt) {
      text = state.structuredPrompt;
    } else {
      text = correctionPipeline.correctedText || state.rawTranscript.trim();
    }
  }
  if (!text) { flashCmd('NOTHING TO COPY'); return; }
  const ok = await copyToClipboard(text);
  if (ok) flashCmd(state.structureView ? 'STRUCTURED COPIED' : 'REFINED COPIED');
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
      // Auto-structure when switching templates if there's text
      const text = correctionPipeline.correctedText || state.rawTranscript;
      if (text.trim()) doStructure({ force: true });
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
  if (!aiClient.models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No models';
    select.appendChild(opt);
    return;
  }
  for (const m of aiClient.models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.label ? `${m.label} (${m.name})` : m.size ? `${m.name} (${m.size})` : m.name;
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
    // Also persist to sessions list with a longer debounce
    clearTimeout(state.sessionListSaveTimer);
    state.sessionListSaveTimer = setTimeout(() => {
      saveCurrentSessionToList();
      renderSessionSelector();
    }, 8000);
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
  updateStats();
  renderTemplateSelector();

  return true;
}

// ══════════════════════════════════════════
// Saved Sessions
// ══════════════════════════════════════════
let sessionSearchQuery = '';

function isToday(date) {
  const now = new Date();
  return date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
}

function renderSessionSelector() {
  const select = $('sessionSelect');
  if (!select) return;
  const sessions = loadSessionsIndex();

  select.innerHTML = '';

  // "+ New Session" option
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New Session';
  select.appendChild(newOpt);

  // Filter by search query
  const query = sessionSearchQuery.toLowerCase().trim();
  const filtered = query
    ? sessions.filter(s =>
        s.title.toLowerCase().includes(query) ||
        (s.project && s.project.toLowerCase().includes(query)))
    : sessions;

  if (filtered.length > 0) {
    const divider = document.createElement('option');
    divider.disabled = true;
    divider.textContent = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
    select.appendChild(divider);
  }

  for (const s of filtered) {
    const opt = document.createElement('option');
    opt.value = s.id;
    const date = new Date(s.updatedAt);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = isToday(date) ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const projectTag = s.project ? ` [${s.project}]` : '';
    opt.textContent = `${s.title}${projectTag} \u2014 ${dateStr} ${timeStr} (${s.wordCount}w)`;
    if (s.id === state.currentSessionId) opt.selected = true;
    select.appendChild(opt);
  }

  if (!state.currentSessionId) select.value = '__new__';
}

function saveCurrentSessionToList() {
  const raw = state.rawTranscript.trim();
  if (!raw) return;
  const settings = loadSettings();
  const data = {
    rawTranscript: state.rawTranscript,
    refinedTranscript: correctionPipeline.correctedText || '',
    structuredPrompt: state.structuredPrompt,
    corrections: correctionPipeline.corrections.slice(-50),
    template: promptStructurer.currentTemplate,
    lang: $('langSelect').value,
    project: settings.activeProject || '',
  };
  state.currentSessionId = saveSessionToList(state.currentSessionId, data);
  settings.currentSessionId = state.currentSessionId;
  saveSettings(settings);
}

function onSessionSelected(value) {
  if (value === '__new__') { startNewSession(); return; }

  saveCurrentSessionToList();

  const session = loadSavedSession(value);
  if (!session) {
    flashCmd('SESSION NOT FOUND');
    renderSessionSelector();
    return;
  }

  if (state.isRecording) stopRecording();

  state.currentSessionId = value;
  state.rawTranscript = session.rawTranscript || '';
  state.structuredPrompt = session.structuredPrompt || '';
  state.interimTranscript = '';
  state.sessionStart = null;

  if (session.lang) $('langSelect').value = session.lang;
  if (session.template) promptStructurer.setTemplate(session.template);

  correctionPipeline.reset();
  if (session.refinedTranscript) {
    correctionPipeline.correctedSegments = [session.refinedTranscript];
  }

  renderTranscript();
  renderRefined(session.refinedTranscript || '');
  if (session.structuredPrompt && state.structureView) {
    $('refinedContent').innerHTML = escapeHtml(session.structuredPrompt).replace(/\n/g, '<br>');
  }
  renderCorrections([]);
  updateStats();
  renderTemplateSelector();
  renderSessionSelector();

  const settings = loadSettings();
  settings.currentSessionId = value;
  saveSettings(settings);

  flashCmd('SESSION LOADED');
}

function startNewSession() {
  saveCurrentSessionToList();

  if (state.isRecording) stopRecording();
  state.rawTranscript = '';
  state.interimTranscript = '';
  state.structuredPrompt = '';
  state.sessionStart = null;
  state.lastConfidence = 0;
  state.currentSessionId = null;
  commandParser.reset();
  correctionPipeline.reset();
  $('cmdCount').textContent = '0';
  $('sessionTime').textContent = '0:00';
  updateStats();
  updateConfidence(0);
  renderTranscript();
  state.structureView = false;
  $('refinedLabel').textContent = 'AI-CORRECTED OUTPUT';
  $('refinedLabel').classList.remove('structured');
  renderRefined('');
  renderCorrections([]);
  clearSession();

  const el = $('rawContent');
  el.innerHTML = '';
  const ph = document.createElement('span');
  ph.className = 'placeholder';
  ph.id = 'placeholder';
  ph.textContent = 'Press SPACE or click START to begin dictating\u2026';
  el.appendChild(ph);

  const settings = loadSettings();
  settings.currentSessionId = null;
  saveSettings(settings);

  renderSessionSelector();
  flashCmd('NEW SESSION');
}

function onDeleteSession() {
  if (!state.currentSessionId) {
    flashCmd('NO SESSION TO DELETE');
    return;
  }
  deleteSessionFromList(state.currentSessionId);
  state.currentSessionId = null;
  const settings = loadSettings();
  settings.currentSessionId = null;
  saveSettings(settings);
  renderSessionSelector();
  flashCmd('SESSION DELETED');
}

function onRenameSession() {
  if (!state.currentSessionId) {
    flashCmd('NO SESSION TO RENAME');
    return;
  }
  const index = loadSessionsIndex();
  const entry = index.find(s => s.id === state.currentSessionId);
  const current = entry ? entry.title : '';
  const newTitle = prompt('Rename session:', current);
  if (newTitle && newTitle.trim()) {
    renameSession(state.currentSessionId, newTitle.trim());
    renderSessionSelector();
    flashCmd('SESSION RENAMED');
  }
}

function onExportSessions() {
  const json = exportSessions();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sessions-export-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flashCmd('SESSIONS EXPORTED');
}

function onImportSessions() {
  $('importFileInput').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const added = importSessions(reader.result);
      renderSessionSelector();
      flashCmd(`IMPORTED ${added} SESSION${added !== 1 ? 'S' : ''}`);
    } catch {
      flashCmd('IMPORT FAILED');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ══════════════════════════════════════════
// Keyboard
// ══════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

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
// Paste / manual edit in raw pane
// ══════════════════════════════════════════
(() => {
  const raw = $('rawContent');
  if (!raw) return;

  raw.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;

    // Append to existing transcript (or replace if empty)
    const separator = state.rawTranscript ? '\n\n' : '';
    state.rawTranscript += separator + text;

    // Feed to correction pipeline
    correctionPipeline.onNewText(text);

    renderTranscript();
    updateStats();
    flashCmd('PASTED');
  });

  raw.addEventListener('input', () => {
    // Sync manual edits back to state (only when not mid-dictation)
    if (state.isRecording) return;
    const text = raw.innerText.replace(/\n{3,}/g, '\n\n').trim();
    state.rawTranscript = text;
    updateStats();
  });
})();

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
// Server mode detection
// ══════════════════════════════════════════
async function detectServerMode() {
  try {
    const res = await fetch('/api/projects-root');
    if (res.ok) {
      state.serverAvailable = true;
      return;
    }
  } catch { /* server not running */ }
  state.serverAvailable = false;
  // Hide project selector and folder button — they need the server
  const wrap = $('projectSelectorWrap');
  if (wrap) wrap.style.display = 'none';
  // Show a setup hint in header
  const hint = document.createElement('button');
  hint.className = 'btn-secondary server-hint';
  hint.innerHTML = 'LOCAL SERVER';
  hint.title = 'Run server.py for project management & folder browsing';
  hint.onclick = showServerSetup;
  $('app')?.querySelector('header .header-row-2')?.prepend(hint);
}

function showServerSetup() {
  const modal = document.createElement('div');
  modal.className = 'folder-modal-overlay';
  modal.id = 'serverModal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="folder-modal" style="width:480px">
      <div class="folder-modal-header">
        <span class="folder-modal-title">LOCAL SERVER SETUP</span>
        <button class="folder-modal-close" onclick="document.getElementById('serverModal').remove()">&times;</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
        <p style="font-family:var(--body);font-size:0.82rem;color:var(--text);line-height:1.6">
          The local server enables <strong style="color:var(--accent2)">project management</strong>,
          <strong style="color:var(--accent2)">folder browsing</strong>, and
          <strong style="color:var(--accent2)">AI correction via Ollama</strong>.
          Dictation works without it.
        </p>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:14px;font-family:var(--mono);font-size:0.75rem;line-height:1.8;color:var(--accent)">
          <div style="color:var(--dim);margin-bottom:6px"># 1. Install Python 3.8+</div>
          <div style="color:var(--dim);margin-bottom:6px"># 2. Clone the repo</div>
          <div>git clone https://github.com/Fiavaion/dictate.git</div>
          <div>cd dictate</div>
          <div style="margin-top:8px">python server.py</div>
          <div style="color:var(--dim);margin-top:8px"># Then open http://localhost:8080</div>
        </div>
        <p style="font-family:var(--body);font-size:0.72rem;color:var(--muted);line-height:1.5">
          For AI features, also install <a href="https://ollama.com" target="_blank" style="color:var(--ai-glow)">Ollama</a> and pull a model:<br>
          <code style="color:var(--accent);font-family:var(--mono);font-size:0.7rem">ollama pull gemma3:4b</code>
        </p>
      </div>
      <div class="folder-modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('serverModal').remove()">CLOSE</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
window.showServerSetup = showServerSetup;

// ══════════════════════════════════════════
// New Module Callbacks & Functions
// ══════════════════════════════════════════

// ── Prompt Builder ──
promptBuilder.onSave = (key, template) => {
  renderTemplateSelector();
  flashCmd('TEMPLATE SAVED: ' + (template.label || key).toUpperCase());
};

function openPromptBuilder(templateKey = null) {
  // Default to the currently active template so the user sees real data
  const key = templateKey || promptStructurer.currentTemplate || 'freeform';
  promptBuilder.open(key);
}

// ── Ambient Detector ──
ambientDetector.onStateChange = (newState, oldState) => {
  const pill = $('statusPill');
  if (newState === 'typing' && state.isRecording) {
    pill?.classList.add('typing-detected');
  } else {
    pill?.classList.remove('typing-detected');
  }
};

// ── Correction Learner ──
correctionLearner.onPromotion = (misheard, correct) => {
  flashCmd(`LEARNED: "${misheard}" \u2192 "${correct}"`);
};

// ── Analytics Dashboard ──
function showAnalytics() {
  const sessionsIndex = loadSessionsIndex();
  const learnerStats = correctionLearner.getStats();
  analyticsDashboard.open(sessionsIndex, learnerStats);
}

// ── Confidence Heatmap ──
confidenceHeatmap.onWordOverride = (segIdx, newWord) => {
  renderTranscript();
};

// ── Session Search ──
searchResultsModal.onSessionSelect = (sessionId) => {
  onSessionSelected(sessionId);
};

function showSearchResults(query = '') {
  searchResultsModal.open(query);
}

// ── Macro Recorder ──
macroRecorder.onRecordStart = (name) => flashCmd('RECORDING MACRO: ' + name.toUpperCase());
macroRecorder.onRecordStop = (name, macro) => flashCmd(`MACRO SAVED: ${name.toUpperCase()} (${macro.steps.length} steps)`);
macroRecorder.onPlayStart = (name) => flashCmd('PLAYING MACRO: ' + name.toUpperCase());
macroRecorder.onPlayDone = (name) => flashCmd('MACRO DONE: ' + name.toUpperCase());

async function executeMacroStep(step) {
  if (step.type === 'command') {
    commandParser.process(step.value);
  } else if (step.type === 'text') {
    commandParser.pushUndo();
    state.rawTranscript = autoPunct.join(state.rawTranscript, step.value);
    correctionPipeline.onNewText(autoPunct.process(step.value));
    renderTranscript();
    updateStats();
  }
}

// ── Command Builder ──
commandBuilderModal.onSave = (trigger, command) => {
  flashCmd('COMMAND SAVED: ' + trigger.toUpperCase());
};

function openCommandBuilder(trigger = null) {
  commandBuilderModal.open(trigger);
}

// ── Timeline ──
sessionTimeline.record('session-start');

function toggleTimeline() {
  timelineViewer.toggle();
  timelineViewer.update();
}

timelineViewer.onScrub = (timestamp) => {
  const text = sessionTimeline.getTextAtTime(timestamp);
  $('rawContent').innerHTML = `<span class="final-text">${escapeHtml(text)}</span>`;
};

// ── Ghost Predictor ──
ghostPredictor.onPrediction = (prediction) => {
  const el = $('rawContent');
  if (!el) return;
  // Show ghost text as faded continuation
  let ghostEl = document.getElementById('ghostText');
  if (!ghostEl) {
    ghostEl = document.createElement('span');
    ghostEl.id = 'ghostText';
    ghostEl.className = 'ghost-text';
    el.appendChild(ghostEl);
  }
  ghostEl.textContent = ' ' + prediction;
};

ghostPredictor.onClear = () => {
  const ghostEl = document.getElementById('ghostText');
  if (ghostEl) ghostEl.remove();
};

function acceptGhostText() {
  const text = ghostPredictor.accept();
  if (text) {
    commandParser.pushUndo();
    state.rawTranscript += ' ' + text;
    correctionPipeline.onNewText(text);
    renderTranscript();
    updateStats();
    sessionTimeline.record('ghost-accept', { text });
    flashCmd('SUGGESTION ACCEPTED');
  }
}

function dismissGhostText() {
  ghostPredictor.dismiss();
  sessionTimeline.record('ghost-dismiss');
  flashCmd('SUGGESTION DISMISSED');
}

// ── Multi Formatter / Format Cards ──
function openFormatCards() {
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO FORMAT'); return; }
  const model = $('modelSelect')?.value || aiClient.getSelectedModel();
  const context = {
    project: $('projectContext')?.value || '',
    stack: $('stackContext')?.value || '',
  };
  formatCardsModal.open(text, model, context);
}

// ── Diagram Generator ──
async function generateDiagram(type = 'auto') {
  const text = correctionPipeline.correctedText || state.rawTranscript;
  if (!text.trim()) { flashCmd('NOTHING TO DIAGRAM'); return; }
  const model = $('modelSelect')?.value || aiClient.getSelectedModel();
  flashCmd('GENERATING DIAGRAM');
  const diagram = await diagramGenerator.generate(text, model, type);
  if (diagram) {
    // Render in the refined pane
    state.structureView = true;
    $('refinedLabel').textContent = diagram.label.toUpperCase();
    $('refinedLabel').classList.add('structured');
    $('refinedContent').innerHTML = '<div id="diagramContainer"></div>';
    await diagramRenderer.render(diagram.mermaid, 'diagramContainer');
    flashCmd('DIAGRAM GENERATED');
  } else {
    flashCmd('DIAGRAM FAILED');
  }
}

// ── Context Injector ──
// Wired in onProjectSelected below

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

  // Load settings — use stored model only if it belongs to the current provider
  const settings = loadSettings();
  const currentDefault = aiClient.getSelectedModel();
  if (settings.correctionModel) {
    // If we're on a cloud provider, don't load an Ollama model name (and vice versa)
    const isCloud = aiClient.providerConfig && !aiClient.providerConfig.local;
    const looksLocal = settings.correctionModel.includes(':');
    if (isCloud && looksLocal) {
      correctionPipeline.setModel(currentDefault);
    } else {
      correctionPipeline.setModel(settings.correctionModel);
    }
  }
  if (settings.structureModel) {
    const isCloud = aiClient.providerConfig && !aiClient.providerConfig.local;
    const looksLocal = settings.structureModel.includes(':');
    if (isCloud && looksLocal) {
      promptStructurer.setModel(currentDefault);
    } else {
      promptStructurer.setModel(settings.structureModel);
    }
  }
  if (settings.aiEnabled === false) correctionPipeline.setEnabled(false);

  // Restore session ID from settings
  state.currentSessionId = settings.currentSessionId || null;

  // Restore session
  const restored = restoreSession();
  if (restored) flashCmd('SESSION RESTORED');

  // Render template selector
  renderTemplateSelector();

  // Init TTS voice selector
  initVoiceSelector();

  // Start AI panel closed by default
  state.aiPanelOpen = false;

  // Connect to Ollama
  aiClient.startMonitoring(10000, (connected, models) => {
    if (connected) {
      setAIStatus('connected');
      renderModelSelector();
      aiClient.warmup(correctionPipeline.model);
    } else {
      setAIStatus('offline');
    }
  });

  // AI Settings modal
  apiSettingsModal.render();
  apiSettingsModal.onSave = (provider) => {
    const isCloud = provider !== 'ollama';
    const switchEl = $('aiModeSwitch');
    if (switchEl) {
      switchEl.querySelectorAll('.ai-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === (isCloud ? 'cloud' : 'local'));
      });
    }
    // Sync both pipelines to the new provider's model
    const model = aiClient.getSelectedModel(provider);
    correctionPipeline.setModel(model);
    promptStructurer.setModel(model);
    _refreshAIConnection();
  };
  const btnAISettings = $('btnAISettings');
  if (btnAISettings) {
    btnAISettings.onclick = () => apiSettingsModal.open();
  }

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

  // Folder browser modal
  $('btnSetFolder').onclick = openFolderBrowser;
  $('btnCloseBrowser').onclick = closeFolderBrowser;
  $('btnBrowserCancel').onclick = closeFolderBrowser;
  $('btnBrowserSelect').onclick = selectBrowserFolder;
  $('folderModal').onclick = (e) => { if (e.target === $('folderModal')) closeFolderBrowser(); };

  // Session selector
  renderSessionSelector();
  const sessionSelect = $('sessionSelect');
  if (sessionSelect) {
    sessionSelect.onchange = () => onSessionSelected(sessionSelect.value);
    sessionSelect.ondblclick = () => onRenameSession();
  }
  $('btnDeleteSession')?.addEventListener('click', onDeleteSession);
  $('btnExportSessions')?.addEventListener('click', onExportSessions);
  $('btnImportSessions')?.addEventListener('click', onImportSessions);
  $('importFileInput')?.addEventListener('change', handleImportFile);

  // Session search filter
  const sessionSearchInput = $('sessionSearch');
  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('input', () => {
      sessionSearchQuery = sessionSearchInput.value;
      renderSessionSelector();
    });
  }

  // Save session on tab close
  window.addEventListener('beforeunload', () => saveCurrentSessionToList());

  // Load projects root path and project list (async — non-blocking)
  loadProjectsRoot();
  loadProjectSelector();

  // Detect if running without local server (e.g. GitHub Pages)
  detectServerMode();

  // ── New module init ──
  // Timeline viewer — render into timeline container
  timelineViewer.render('timelineContainer');

  // Wire new command parser callbacks for new modules
  commandParser.onMacroStart = (name) => {
    if (macroRecorder.startRecording(name)) flashCmd('RECORDING MACRO: ' + name.toUpperCase());
    else flashCmd('MACRO RECORDING FAILED');
  };
  commandParser.onMacroStop = () => {
    const macro = macroRecorder.stopRecording();
    if (macro) flashCmd('MACRO SAVED');
    else flashCmd('NO RECORDING');
  };
  commandParser.onMacroPlay = (name) => {
    macroRecorder.playMacro(name, executeMacroStep);
  };
  commandParser.onMacroList = () => {
    const list = macroRecorder.listMacros();
    if (list.length === 0) { flashCmd('NO MACROS'); return; }
    flashCmd('MACROS: ' + list.map(m => m.name).join(', '));
  };
  commandParser.onMacroDelete = (name) => {
    if (macroRecorder.deleteMacro(name)) flashCmd('MACRO DELETED: ' + name.toUpperCase());
    else flashCmd('MACRO NOT FOUND');
  };
  commandParser.onShowConfidence = () => {
    confidenceHeatmap.enabled = true;
    renderTranscript();
    flashCmd('CONFIDENCE ON');
  };
  commandParser.onHideConfidence = () => {
    confidenceHeatmap.enabled = false;
    renderTranscript();
    flashCmd('CONFIDENCE OFF');
  };
  commandParser.onAcceptSuggestion = () => acceptGhostText();
  commandParser.onDismissSuggestion = () => dismissGhostText();
  commandParser.onDiagram = (type) => generateDiagram(type);
  commandParser.onFormatAll = () => openFormatCards();
  commandParser.onFormatFor = (target) => {
    const text = correctionPipeline.correctedText || state.rawTranscript;
    if (!text.trim()) { flashCmd('NOTHING TO FORMAT'); return; }
    const model = $('modelSelect')?.value || aiClient.getSelectedModel();
    const context = { project: $('projectContext')?.value || '', stack: $('stackContext')?.value || '' };
    multiFormatter.formatSingle(text, model, target, context).then(result => {
      if (result && result.output) {
        state.structureView = true;
        $('refinedLabel').textContent = result.label.toUpperCase();
        $('refinedLabel').classList.add('structured');
        renderStructuredInPane(result.output);
        flashCmd('FORMATTED: ' + result.label.toUpperCase());
      }
    });
  };
  commandParser.onShowAnalytics = () => showAnalytics();
  commandParser.onSearchSessions = (query) => showSearchResults(query);
  commandParser.onShowTimeline = () => { timelineViewer.open(); flashCmd('TIMELINE OPEN'); };
  commandParser.onHideTimeline = () => { timelineViewer.close(); flashCmd('TIMELINE CLOSED'); };
  commandParser.onBuildCommand = () => openCommandBuilder();
}

// ══════════════════════════════════════════
// AI Mode Switch (Local / Cloud)
// ══════════════════════════════════════════
function setAIMode(mode) {
  const switchEl = $('aiModeSwitch');
  if (!switchEl) return;

  if (mode === 'cloud') {
    // Find the first cloud provider with an API key
    const cloudProviders = aiClient.allProviders.filter(p => !p.local);
    const available = cloudProviders.find(p => aiClient.getApiKey(p.key));
    if (!available) {
      flashCmd('NO API KEY — OPEN SETTINGS TO ADD ONE');
      apiSettingsModal.open();
      // Keep toggle on local until a key is saved
      switchEl.querySelectorAll('.ai-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === 'local');
      });
      return;
    }
    aiClient.setProvider(available.key);
    // Switch both pipelines to cloud provider's default/selected model
    const cloudModel = aiClient.getSelectedModel(available.key);
    correctionPipeline.setModel(cloudModel);
    promptStructurer.setModel(cloudModel);
    flashCmd(`CLOUD: ${available.label.toUpperCase()}`);
  } else {
    aiClient.setProvider('ollama');
    // Restore local model from settings or use default
    const settings = loadSettings();
    const localModel = settings.correctionModel || aiClient.getDefaultModel('ollama');
    const structModel = settings.structureModel || aiClient.getDefaultModel('ollama');
    // Only set local model if it looks like an Ollama model (not a cloud model ID)
    const ollamaModels = aiClient.models.map(m => m.name);
    if (ollamaModels.includes(localModel)) {
      correctionPipeline.setModel(localModel);
    } else {
      correctionPipeline.setModel(aiClient.getDefaultModel('ollama'));
    }
    if (ollamaModels.includes(structModel)) {
      promptStructurer.setModel(structModel);
    } else {
      promptStructurer.setModel(aiClient.getDefaultModel('ollama'));
    }
    flashCmd('LOCAL: OLLAMA');
  }

  // Update button states
  switchEl.querySelectorAll('.ai-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Refresh model selector and re-check connection
  _refreshAIConnection();
}

async function _refreshAIConnection() {
  renderModelSelector();
  aiClient.stopMonitoring();

  // Do an immediate connection check so the user sees feedback fast
  const result = await aiClient.checkConnection();
  if (result.ok) {
    setAIStatus('connected');
    renderModelSelector();
  } else {
    setAIStatus('offline');
    if (result.error) flashCmd(result.error.toUpperCase());
  }

  // Continue periodic monitoring
  aiClient.startMonitoring(15000, (connected, models) => {
    if (connected) {
      setAIStatus('connected');
      renderModelSelector();
    } else {
      setAIStatus('offline');
    }
  });
}

function initAIModeSwitch() {
  const currentProvider = aiClient.provider;
  const isCloud = currentProvider !== 'ollama';
  const switchEl = $('aiModeSwitch');
  if (!switchEl) return;
  switchEl.querySelectorAll('.ai-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === (isCloud ? 'cloud' : 'local'));
  });
}

// ══════════════════════════════════════════
// Typography Controls (per-pane)
// ══════════════════════════════════════════
const TYPO_TARGETS = {
  raw: () => $('rawContent'),
  refined: () => $('refinedContent'),
};

const TYPO_DEFAULTS = { fontSize: 16, letterSpacing: 1, lineHeight: 175 };

function toggleTypoControls(pane) {
  const suffix = pane === 'raw' ? 'Raw' : 'Refined';
  const panel = $(`typoControls${suffix}`);
  if (!panel) return;
  panel.classList.toggle('open');
  const header = panel.previousElementSibling;
  if (header) {
    const btn = header.querySelector('.typo-toggle');
    if (btn) btn.classList.toggle('active', panel.classList.contains('open'));
  }
}

function updateTypo(slider) {
  const { pane, prop } = slider.dataset;
  const el = TYPO_TARGETS[pane]();
  if (!el) return;
  const v = Number(slider.value);
  const suffix = pane === 'raw' ? 'Raw' : 'Refined';

  if (prop === 'fontSize') {
    el.style.fontSize = `${v}px`;
    $(`typoVal${suffix}Size`).textContent = v;
  } else if (prop === 'letterSpacing') {
    const em = v / 1000;
    el.style.letterSpacing = `${em}em`;
    $(`typoVal${suffix}Tracking`).textContent = em.toFixed(2);
  } else if (prop === 'lineHeight') {
    const lh = v / 100;
    el.style.lineHeight = lh;
    $(`typoVal${suffix}Leading`).textContent = lh.toFixed(2);
  }
  saveTypoSettings();
}

function saveTypoSettings() {
  const data = {};
  for (const pane of ['raw', 'refined']) {
    const suffix = pane === 'raw' ? 'Raw' : 'Refined';
    const panel = $(`typoControls${suffix}`);
    const sliders = panel.querySelectorAll('input[type="range"]');
    data[pane] = {};
    sliders.forEach(s => { data[pane][s.dataset.prop] = Number(s.value); });
  }
  localStorage.setItem('dictate_typo', JSON.stringify(data));
}

function loadTypoSettings() {
  const raw = localStorage.getItem('dictate_typo');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    for (const pane of ['raw', 'refined']) {
      if (!data[pane]) continue;
      const suffix = pane === 'raw' ? 'Raw' : 'Refined';
      const panel = $(`typoControls${suffix}`);
      for (const [prop, val] of Object.entries(data[pane])) {
        const slider = panel.querySelector(`input[data-prop="${prop}"]`);
        if (slider) {
          slider.value = val;
          updateTypo(slider);
        }
      }
    }
  } catch { /* ignore corrupt data */ }
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
window.exitStructureView = exitStructureView;
window.copyPaneContent = copyPaneContent;
window.startNewSession = startNewSession;
window.onDeleteSession = onDeleteSession;
window.onRenameSession = onRenameSession;
window.onExportSessions = onExportSessions;
window.onImportSessions = onImportSessions;
window.openAISettings = () => apiSettingsModal.open();
window.openPromptBuilder = openPromptBuilder;
window.showAnalytics = showAnalytics;
window.showSearchResults = showSearchResults;
window.openCommandBuilder = openCommandBuilder;
window.toggleTimeline = toggleTimeline;
window.openFormatCards = openFormatCards;
window.generateDiagram = generateDiagram;
window.acceptGhostText = acceptGhostText;
window.dismissGhostText = dismissGhostText;
window.toggleTypoControls = toggleTypoControls;
window.updateTypo = updateTypo;
window.setAIMode = setAIMode;

// Boot
init();
initAIModeSwitch();
loadTypoSettings();
