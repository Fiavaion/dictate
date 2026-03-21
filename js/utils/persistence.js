/**
 * Session Persistence — auto-save/restore via localStorage
 */

const SESSION_KEY = 'fiavaion-dictate-session';
const SETTINGS_KEY = 'fiavaion-dictate-settings';

export function saveSession(state) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      rawTranscript: state.rawTranscript || '',
      refinedTranscript: state.refinedTranscript || '',
      structuredPrompt: state.structuredPrompt || '',
      corrections: state.corrections || [],
      template: state.template || 'freeform',
      profile: state.profile || 'default',
      lang: state.lang || 'en-US',
      savedAt: Date.now(),
    }));
  } catch { /* storage full — degrade gracefully */ }
}

export function loadSession() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!data) return null;
    // Only restore sessions less than 24 hours old
    if (Date.now() - data.savedAt > 86400000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* ignore */ }
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}

// ══════════════════════════════════════════
// Saved Sessions — persistent session history
// ══════════════════════════════════════════
const SESSIONS_INDEX_KEY = 'fiavaion-sessions-index';
const SESSION_PREFIX = 'fiavaion-session-';
const MAX_SESSIONS = 30;

export function generateSessionId() {
  return `ses_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
}

export function loadSessionsIndex() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_INDEX_KEY) || '[]'); }
  catch { return []; }
}

function _saveSessionsIndex(index) {
  try { localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(index)); }
  catch { /* storage full */ }
}

function _generateTitle(rawTranscript) {
  const cleaned = rawTranscript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled session';
  return cleaned.length > 30 ? cleaned.slice(0, 30) + '\u2026' : cleaned;
}

export function saveSessionToList(id, data) {
  const index = loadSessionsIndex();
  const now = Date.now();
  const rawText = (data.rawTranscript || '').trim();
  const wordCount = rawText ? rawText.split(/\s+/).length : 0;
  if (wordCount === 0) return id;

  if (!id) id = generateSessionId();

  const existingIdx = index.findIndex(s => s.id === id);
  const meta = {
    id,
    title: _generateTitle(data.rawTranscript),
    createdAt: existingIdx >= 0 ? index[existingIdx].createdAt : now,
    updatedAt: now,
    wordCount,
    project: data.project || '',
    template: data.template || 'freeform',
    lang: data.lang || 'en-US',
  };

  if (existingIdx >= 0) index.splice(existingIdx, 1);
  index.unshift(meta);

  while (index.length > MAX_SESSIONS) {
    const removed = index.pop();
    localStorage.removeItem(SESSION_PREFIX + removed.id);
  }

  _saveSessionsIndex(index);

  try {
    localStorage.setItem(SESSION_PREFIX + id, JSON.stringify({
      id,
      rawTranscript: data.rawTranscript || '',
      refinedTranscript: data.refinedTranscript || '',
      structuredPrompt: data.structuredPrompt || '',
      corrections: data.corrections || [],
      template: data.template || 'freeform',
      lang: data.lang || 'en-US',
      project: data.project || '',
      savedAt: now,
    }));
  } catch { /* storage full */ }

  return id;
}

export function loadSavedSession(id) {
  try { return JSON.parse(localStorage.getItem(SESSION_PREFIX + id) || 'null'); }
  catch { return null; }
}

export function deleteSessionFromList(id) {
  localStorage.removeItem(SESSION_PREFIX + id);
  const index = loadSessionsIndex();
  _saveSessionsIndex(index.filter(s => s.id !== id));
}

export function renameSession(id, newTitle) {
  const index = loadSessionsIndex();
  const entry = index.find(s => s.id === id);
  if (entry) {
    entry.title = newTitle;
    _saveSessionsIndex(index);
  }
}

export function exportSessions() {
  const index = loadSessionsIndex();
  const sessions = index.map(meta => {
    const data = loadSavedSession(meta.id);
    return { meta, data };
  }).filter(s => s.data);
  return JSON.stringify({ version: 1, exportedAt: Date.now(), sessions }, null, 2);
}

export function importSessions(json) {
  const imported = JSON.parse(json);
  if (!imported.sessions || !Array.isArray(imported.sessions)) throw new Error('Invalid format');
  const index = loadSessionsIndex();
  const existingIds = new Set(index.map(s => s.id));
  let added = 0;
  for (const { meta, data } of imported.sessions) {
    if (existingIds.has(meta.id)) continue;
    index.push(meta);
    try { localStorage.setItem(SESSION_PREFIX + meta.id, JSON.stringify(data)); }
    catch { break; }
    added++;
  }
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  while (index.length > MAX_SESSIONS) {
    const removed = index.pop();
    localStorage.removeItem(SESSION_PREFIX + removed.id);
  }
  _saveSessionsIndex(index);
  return added;
}
