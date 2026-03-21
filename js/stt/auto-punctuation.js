/**
 * Auto-Punctuation — adapted from BugHive
 * Converts spoken punctuation words to symbols, adds developer-specific mappings.
 */

const PUNCT_MAP = [
  [/\b(full stop|period)\b/gi, '. '],
  [/\bcomma\b/gi, ', '],
  [/\bquestion mark\b/gi, '? '],
  [/\bexclamation (mark|point)\b/gi, '! '],
  [/\bcolon\b/gi, ': '],
  [/\bsemicolon\b/gi, '; '],
  [/\bnew line\b/gi, '\n'],
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bopen (bracket|paren)\b/gi, '('],
  [/\bclose (bracket|paren)\b/gi, ')'],
  [/\bopen quote\b/gi, '\u201C'],
  [/\bclose quote\b/gi, '\u201D'],
  [/\b(dash|em dash)\b/gi, ' \u2014 '],
  [/\bhyphen\b/gi, '-'],
  [/\bellipsis\b/gi, '\u2026 '],
  // Developer-specific
  [/\bbacktick\b/gi, '`'],
  [/\btriple backtick\b/gi, '```'],
  [/\bhash(tag)?\b/gi, '#'],
  [/\bat sign\b/gi, '@'],
  [/\bforward slash\b/gi, '/'],
  [/\bbackslash\b/gi, '\\'],
  [/\bpipe\b/gi, '|'],
  [/\bampersand\b/gi, '&'],
  [/\basterisk\b/gi, '*'],
  [/\bequals sign\b/gi, '='],
  [/\bopen (curly|brace)\b/gi, '{'],
  [/\bclose (curly|brace)\b/gi, '}'],
  [/\bopen square\b/gi, '['],
  [/\bclose square\b/gi, ']'],
  [/\bangle left\b/gi, '<'],
  [/\bangle right\b/gi, '>'],
];

const SENTENCE_END = /[.!?]\s+$/;

export class AutoPunctuation {
  constructor(mode = 'auto') {
    this.mode = mode; // 'auto' | 'assisted' | 'off'
  }

  process(text) {
    if (this.mode === 'off') return text;
    let result = text;
    for (const [pattern, symbol] of PUNCT_MAP) {
      result = result.replace(pattern, symbol);
    }
    if (this.mode === 'auto') {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    return result;
  }

  join(existing, newText) {
    const processed = this.process(newText);
    if (!existing) return processed;

    const trimmed = existing.trimEnd();
    const needsCapital = SENTENCE_END.test(trimmed + ' ');

    let joiner = ' ';
    if (existing.endsWith('\n')) joiner = '';
    if (existing.endsWith(' ')) joiner = '';

    const joined = trimmed + joiner + processed;

    if (needsCapital && this.mode === 'auto') {
      const idx = trimmed.length + joiner.length;
      if (idx < joined.length) {
        return joined.slice(0, idx) + joined[idx].toUpperCase() + joined.slice(idx + 1);
      }
    }
    return joined;
  }

  setMode(mode) { this.mode = mode; }
}
