/**
 * Session Search — full-text + AI semantic search across saved sessions
 *
 * Provides two search modes:
 *   1. Text search — fast, local substring matching across all session content
 *   2. Semantic search — uses the AI client to interpret query intent and
 *      match against session summaries
 *
 * Usage:
 *   import { SessionSearch } from './session-search.js';
 *   const search = new SessionSearch(aiClient);
 *   const results = search.textSearch('deployment');
 *   const aiResults = await search.semanticSearch('that conversation about fixing the login bug');
 */

import { loadSessionsIndex, loadSavedSession } from './persistence.js';

/**
 * @typedef {Object} SearchMatch
 * @property {string} context    — text snippet surrounding the match
 * @property {number} matchStart — offset of match within the context string
 * @property {number} matchEnd   — end offset of match within the context string
 */

/**
 * @typedef {Object} SearchResult
 * @property {Object} meta    — session metadata from the sessions index
 * @property {Object} session — full session data
 * @property {SearchMatch[]} matches — array of match locations with context
 */

export class SessionSearch {
  /**
   * @param {import('../ai/ai-client.js').AIClient} aiClient — the unified AI client instance
   */
  constructor(aiClient) {
    this.client = aiClient;
  }

  /**
   * Full-text search across all saved sessions.
   * Searches raw transcript, refined transcript, structured prompt, and title.
   * @param {string} query — the search string
   * @returns {SearchResult[]} — matching sessions with highlighted context
   */
  textSearch(query) {
    if (!query?.trim()) return [];

    const index = loadSessionsIndex();
    const results = [];
    const queryLower = query.toLowerCase();

    for (const meta of index) {
      const session = loadSavedSession(meta.id);
      if (!session) continue;

      // Build searchable text from all session fields
      const searchable = [
        session.rawTranscript || '',
        session.refinedTranscript || '',
        session.structuredPrompt || '',
        meta.title || '',
      ].join('\n---\n');

      const matches = this._findMatches(searchable, queryLower);
      if (matches.length > 0) {
        results.push({
          meta,
          session,
          matches,
        });
      }
    }

    // Sort by number of matches (most relevant first)
    results.sort((a, b) => b.matches.length - a.matches.length);

    return results;
  }

  /**
   * AI-powered semantic search — interprets query intent to find relevant sessions.
   * Requires a connected AI provider.
   * @param {string} query — natural language query
   * @param {AbortSignal} [signal] — optional abort signal
   * @returns {Promise<SearchResult[]>} — matching sessions
   */
  async semanticSearch(query, signal) {
    if (!query?.trim() || !this.client.connected) return [];

    const index = loadSessionsIndex();
    if (index.length === 0) return [];

    // Build compact summaries for the AI to evaluate
    const summaries = [];
    for (const meta of index) {
      const session = loadSavedSession(meta.id);
      if (!session) continue;

      const rawPreview = (session.rawTranscript || '').slice(0, 250).trim();
      const refinedPreview = (session.refinedTranscript || '').slice(0, 150).trim();
      const preview = refinedPreview || rawPreview;

      if (!preview) continue;

      summaries.push({
        id: meta.id,
        title: meta.title || 'Untitled',
        project: meta.project || '',
        date: meta.createdAt ? new Date(meta.createdAt).toLocaleDateString() : '',
        preview,
      });
    }

    if (summaries.length === 0) return [];

    // Build the prompt for the AI
    const sessionList = summaries.map((s, i) => {
      const projectTag = s.project ? ` [project: ${s.project}]` : '';
      return `[${i}] "${s.title}"${projectTag} (${s.date}): ${s.preview}`;
    }).join('\n\n');

    const prompt = `Given these dictation session summaries, identify which ones are relevant to the query: "${query}"

Sessions:
${sessionList}

Return ONLY a JSON array of indices of matching sessions, e.g. [0, 3, 5]. If none match, return [].`;

    const systemPrompt =
      'You are a search assistant. Analyze dictation session summaries and find ones matching the query. '
      + 'Consider semantic meaning, not just keyword matches. '
      + 'Return only a JSON array of matching indices, nothing else.';

    try {
      const model = this.client.getSelectedModel();
      const response = await this.client.generateFull(
        model,
        prompt,
        systemPrompt,
        { maxTokens: 100, temperature: 0 },
        signal,
      );

      // Extract JSON array from response
      const match = response.match(/\[[\d,\s]*\]/);
      if (!match) return [];

      const indices = JSON.parse(match[0]);

      return indices
        .filter(i => typeof i === 'number' && i >= 0 && i < summaries.length)
        .map(i => {
          const summary = summaries[i];
          const meta = index.find(m => m.id === summary.id);
          const session = loadSavedSession(summary.id);
          if (!meta || !session) return null;

          return {
            meta,
            session,
            matches: [{
              context: summary.preview,
              matchStart: 0,
              matchEnd: 0,
            }],
          };
        })
        .filter(Boolean);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('Semantic search failed:', err.message);
      return [];
    }
  }

  /**
   * Combined search — runs text search first, then (optionally) enriches
   * with semantic results for queries that look like natural language.
   * @param {string} query
   * @param {Object} options
   * @param {boolean} [options.includeAI=false] — whether to also run semantic search
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<SearchResult[]>}
   */
  async combinedSearch(query, { includeAI = false, signal } = {}) {
    const textResults = this.textSearch(query);

    if (!includeAI || !this.client.connected) return textResults;

    try {
      const aiResults = await this.semanticSearch(query, signal);

      // Merge, deduplicating by session ID
      const seenIds = new Set(textResults.map(r => r.meta.id));
      const merged = [...textResults];

      for (const result of aiResults) {
        if (!seenIds.has(result.meta.id)) {
          merged.push(result);
          seenIds.add(result.meta.id);
        }
      }

      return merged;
    } catch {
      // Fall back to text results on AI failure
      return textResults;
    }
  }

  // ── Private helpers ──────────────────────────────

  /**
   * Find all substring matches with surrounding context.
   * @param {string} text
   * @param {string} queryLower — lowercase query
   * @returns {SearchMatch[]}
   */
  _findMatches(text, queryLower) {
    const matches = [];
    const textLower = text.toLowerCase();
    let idx = textLower.indexOf(queryLower);

    while (idx !== -1) {
      const contextPad = 50;
      const contextStart = Math.max(0, idx - contextPad);
      const contextEnd = Math.min(text.length, idx + queryLower.length + contextPad);

      // Build context with ellipsis indicators
      let context = text.slice(contextStart, contextEnd).replace(/\n/g, ' ');
      if (contextStart > 0) context = '\u2026' + context;
      if (contextEnd < text.length) context = context + '\u2026';

      const ellipsisOffset = contextStart > 0 ? 1 : 0;
      matches.push({
        context,
        matchStart: idx - contextStart + ellipsisOffset,
        matchEnd: idx - contextStart + queryLower.length + ellipsisOffset,
      });

      // Find next occurrence
      idx = textLower.indexOf(queryLower, idx + 1);

      // Cap at 5 matches per session to keep results manageable
      if (matches.length >= 5) break;
    }

    return matches;
  }
}
