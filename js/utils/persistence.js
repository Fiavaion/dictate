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
