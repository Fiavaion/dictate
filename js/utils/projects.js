/**
 * FiavaionDictate — Projects module
 * Fetches local project list from server.py and manages per-project settings.
 */

const PROJECT_SETTINGS_PREFIX = 'fiavaion-project-';

/**
 * Fetch all projects from the local API server.
 * Returns [] if server is unavailable.
 */
export async function fetchProjects() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Sort projects by last modified time, most recent first.
 */
export function sortByModified(projects) {
  return [...projects].sort((a, b) => b.modified - a.modified);
}

/**
 * Sort projects alphabetically by name (case-insensitive).
 */
export function sortByName(projects) {
  return [...projects].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

/**
 * Save per-project settings to localStorage.
 * @param {string} name - project folder name
 * @param {object} settings - { stack, correctionModel, template }
 */
export function saveProjectSettings(name, settings) {
  try {
    const key = PROJECT_SETTINGS_PREFIX + name;
    const existing = loadProjectSettings(name);
    localStorage.setItem(key, JSON.stringify({ ...existing, ...settings }));
  } catch { /* storage full */ }
}

/**
 * Load per-project settings from localStorage.
 * @param {string} name - project folder name
 * @returns {object} settings or {}
 */
export function loadProjectSettings(name) {
  try {
    return JSON.parse(localStorage.getItem(PROJECT_SETTINGS_PREFIX + name) || '{}');
  } catch {
    return {};
  }
}
