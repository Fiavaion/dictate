/**
 * Voice Command Parser — expanded from 59 to ~80 commands
 * Includes original dictation commands + new AI and developer commands.
 */

export class CommandParser {
  constructor() {
    this.commandCount = 0;
    this.undoStack = [];
    this.maxUndo = 50;

    // Callbacks — set by the app controller
    this.onFlash = null;           // (msg) => void — show toast
    this.onTranscriptChange = null; // (transcript) => void
    this.getTranscript = null;     // () => string
    this.setTranscript = null;     // (text) => void

    // AI callbacks
    this.onAICorrect = null;       // () => void
    this.onAIStructure = null;     // () => void
    this.onAISetTemplate = null;   // (name) => void
    this.onAIIgnoreLast = null;    // () => void
    this.onAIAcceptAll = null;     // () => void
    this.onAIShowDiff = null;      // () => void
    this.onAIReadBack = null;      // () => void

    // Navigation/control callbacks
    this.onScrollTop = null;
    this.onScrollBottom = null;
    this.onCopyRaw = null;
    this.onCopyRefined = null;
    this.onCopyStructured = null;
    this.onCopyToClaude = null;
    this.onStopRecording = null;
    this.onStartRecording = null;
    this.onShowAlternatives = null;
    this.onToggleAIPanel = null;
    this.onNewSession = null;

    // New module callbacks
    this.onMacroStart = null;        // (name) => void
    this.onMacroStop = null;         // () => void
    this.onMacroPlay = null;         // (name) => void
    this.onMacroList = null;         // () => void
    this.onMacroDelete = null;       // (name) => void
    this.onShowConfidence = null;    // () => void
    this.onHideConfidence = null;    // () => void
    this.onAcceptSuggestion = null;  // () => void
    this.onDismissSuggestion = null; // () => void
    this.onDiagram = null;           // (type) => void
    this.onFormatAll = null;         // () => void
    this.onFormatFor = null;         // (target) => void
    this.onShowAnalytics = null;     // () => void
    this.onSearchSessions = null;    // (query) => void
    this.onShowTimeline = null;      // () => void
    this.onHideTimeline = null;      // () => void
    this.onBuildCommand = null;      // () => void
    this.onAITransformSelection = null; // (instruction) => void — AI edit on selected text
  }

  pushUndo() {
    const text = this.getTranscript?.() || '';
    this.undoStack.push(text);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  doUndo() {
    if (!this.undoStack.length) {
      this._flash('NOTHING TO UNDO');
      return;
    }
    const prev = this.undoStack.pop();
    this.setTranscript?.(prev);
    this._flash('UNDONE');
  }

  _flash(msg) {
    this.commandCount++;
    this.onFlash?.(msg, this.commandCount);
  }

  _updateTranscript(newText) {
    this.setTranscript?.(newText);
    this.onTranscriptChange?.(newText);
  }

  /**
   * Process a voice utterance. Returns true if it was a command.
   */
  process(raw) {
    const t = raw.trim().toLowerCase();
    const transcript = this.getTranscript?.() || '';

    // ── Punctuation ──
    const PUNCT = {
      'period': '.', 'full stop': '.', 'comma': ',', 'question mark': '?',
      'exclamation mark': '!', 'exclamation point': '!', 'colon': ':', 'semicolon': ';',
      'open quote': '\u201C', 'close quote': '\u201D',
      'dash': '\u2014', 'em dash': '\u2014', 'hyphen': '-', 'ellipsis': '\u2026',
      'backtick': '`', 'hash': '#', 'at sign': '@', 'ampersand': '&',
      'asterisk': '*', 'pipe': '|', 'forward slash': '/', 'backslash': '\\',
      'equals': '=', 'open paren': '(', 'close paren': ')',
      'open bracket': '[', 'close bracket': ']',
      'open brace': '{', 'close brace': '}',
      'angle left': '<', 'angle right': '>',
    };
    if (PUNCT[t] !== undefined) {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd() + PUNCT[t] + ' ');
      this._flash('PUNCT: ' + PUNCT[t]);
      return true;
    }

    if (t === 'new paragraph') { this.pushUndo(); this._updateTranscript(transcript + '\n\n'); this._flash('NEW PARAGRAPH'); return true; }
    if (t === 'new line')      { this.pushUndo(); this._updateTranscript(transcript + '\n');   this._flash('NEW LINE');      return true; }

    // ── Deletion ──
    if (t === 'delete last word') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd().replace(/\S+\s*$/, ''));
      this._flash('DELETED WORD'); return true;
    }
    if (t === 'delete last sentence') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd().replace(/[^.!?\n]*[.!?\n]?\s*$/, ''));
      this._flash('DELETED SENTENCE'); return true;
    }
    if (t === 'delete all') {
      this.pushUndo();
      this._updateTranscript('');
      this._flash('CLEARED'); return true;
    }

    // ── Undo ──
    if (t === 'undo') { this.doUndo(); return true; }

    // ── Replace ──
    const rm = t.match(/^replace (.+) with (.+)$/);
    if (rm) {
      this.pushUndo();
      const before = transcript;
      // Escape search term so voice input is treated as literal text, not regex
      const safe = rm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let replaced;
      try { replaced = transcript.replace(new RegExp(safe, 'gi'), rm[2]); }
      catch { replaced = transcript; }
      this._updateTranscript(replaced);
      this._flash(before !== replaced ? `"${rm[1]}" \u2192 "${rm[2]}"` : 'NO MATCH');
      return true;
    }

    // ── Formatting ──
    if (t === 'bold that') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd().replace(/(\S+)(\s*)$/, '**$1**$2'));
      this._flash('BOLD'); return true;
    }
    if (t === 'italic that') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd().replace(/(\S+)(\s*)$/, '_$1_$2'));
      this._flash('ITALIC'); return true;
    }
    if (t === 'underline that') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd().replace(/(\S+)(\s*)$/, '__$1__$2'));
      this._flash('UNDERLINE'); return true;
    }
    const hm = t.match(/^heading (one|two|three|four|five|six)$/);
    if (hm) {
      this.pushUndo();
      const n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[hm[1]];
      this._updateTranscript('#'.repeat(n) + ' ' + transcript.trimStart());
      this._flash('H' + n); return true;
    }

    // ── Developer formatting ──
    if (t === 'insert code block' || t === 'code block') {
      this.pushUndo();
      this._updateTranscript(transcript + '\n```\n');
      this._flash('CODE BLOCK'); return true;
    }
    if (t === 'end code block' || t === 'close code block') {
      this.pushUndo();
      this._updateTranscript(transcript + '\n```\n');
      this._flash('END CODE BLOCK'); return true;
    }
    if (t === 'insert list' || t === 'start list') {
      this.pushUndo();
      this._updateTranscript(transcript + '\n- ');
      this._flash('LIST STARTED'); return true;
    }
    if (t === 'list item' || t === 'next item') {
      this.pushUndo();
      this._updateTranscript(transcript.trimEnd() + '\n- ');
      this._flash('LIST ITEM'); return true;
    }
    if (t === 'end list') {
      this.pushUndo();
      this._updateTranscript(transcript + '\n');
      this._flash('LIST ENDED'); return true;
    }

    // ── Navigation ──
    if (t === 'go to beginning') { this.onScrollTop?.(); this._flash('\u2B06 BEGINNING'); return true; }
    if (t === 'go to end')       { this.onScrollBottom?.(); this._flash('\u2B07 END'); return true; }
    if (t === 'select all')      { this.onCopyRaw?.(true); this._flash('ALL COPIED'); return true; }

    // ── Control ──
    if (t === 'stop listening')    { this.onStopRecording?.();  this._flash('STOPPED');  return true; }
    if (t === 'start listening')   { this.onStartRecording?.(); return true; }
    if (t === 'show alternatives') { this.onShowAlternatives?.(); return true; }

    // ── AI Commands ──
    if (t === 'ai correct this' || t === 'correct this') {
      this.onAICorrect?.(); this._flash('AI CORRECTING'); return true;
    }
    if (t === 'ai structure this' || t === 'structure this') {
      this.onAIStructure?.(); this._flash('AI STRUCTURING'); return true;
    }
    if (t === 'ai show diff' || t === 'show diff') {
      this.onAIShowDiff?.(); this._flash('DIFF VIEW'); return true;
    }
    if (t === 'ai read back' || t === 'read back') {
      this.onAIReadBack?.(); this._flash('READING BACK'); return true;
    }
    if (t === 'ai ignore last' || t === 'ignore last correction') {
      this.onAIIgnoreLast?.(); this._flash('CORRECTION IGNORED'); return true;
    }
    if (t === 'ai accept all' || t === 'accept all corrections') {
      this.onAIAcceptAll?.(); this._flash('ALL ACCEPTED'); return true;
    }
    if (t === 'toggle ai panel' || t === 'ai panel') {
      this.onToggleAIPanel?.(); this._flash('AI PANEL'); return true;
    }
    if (t === 'new session') {
      this.onNewSession?.(); this._flash('NEW SESSION'); return true;
    }

    // ── Selection Transform Commands ──
    // These act on the currently selected text in the raw dictation pane.
    // Say "simplify that" after selecting text with your mouse.
    {
      const TRANSFORMS = {
        'simplify that':       'Simplify this text — make it clearer and easier to understand',
        'fix that':            'Fix the grammar and spelling in this text',
        'correct that':        'Fix the grammar and spelling in this text',
        'expand that':         'Expand and elaborate on this text with more detail',
        'elaborate on that':   'Expand and elaborate on this text with more detail',
        'shorten that':        'Shorten this text while keeping the key meaning',
        'condense that':       'Shorten this text while keeping the key meaning',
        'formalize that':      'Rewrite this text in a formal, professional tone',
        'make it formal':      'Rewrite this text in a formal, professional tone',
        'make it casual':      'Rewrite this text in a friendly, casual tone',
        'casual that':         'Rewrite this text in a friendly, casual tone',
        'rewrite that':        'Rewrite this text to improve clarity and flow',
        'improve that':        'Rewrite this text to improve clarity and flow',
        'translate to english': 'Translate this text to English',
      };
      const instruction = TRANSFORMS[t];
      if (instruction) {
        this.onAITransformSelection?.(instruction);
        return true;
      }
    }

    // Template selection
    const tm = t.match(/^(?:ai )?use (\w+) template$/);
    if (tm) {
      this.onAISetTemplate?.(tm[1]); this._flash('TEMPLATE: ' + tm[1].toUpperCase()); return true;
    }

    // ── Copy commands ──
    if (t === 'copy refined')    { this.onCopyRefined?.();    this._flash('REFINED COPIED');    return true; }
    if (t === 'copy structured') { this.onCopyStructured?.(); this._flash('STRUCTURED COPIED'); return true; }
    if (t === 'copy raw')        { this.onCopyRaw?.();        this._flash('RAW COPIED');        return true; }
    if (t === 'copy to claude' || t === 'send to claude' || t === 'copy refined to claude') {
      this.onCopyToClaude?.(); this._flash('READY — PASTE IN VS CODE'); return true;
    }

    // ── Macro Commands ──
    const macroStart = t.match(/^start macro (.+)$/);
    if (macroStart) {
      this.onMacroStart?.(macroStart[1]); return true;
    }
    if (t === 'stop macro') {
      this.onMacroStop?.(); this._flash('MACRO STOPPED'); return true;
    }
    const macroPlay = t.match(/^play macro (.+)$/);
    if (macroPlay) {
      this.onMacroPlay?.(macroPlay[1]); return true;
    }
    if (t === 'list macros') {
      this.onMacroList?.(); return true;
    }
    const macroDelete = t.match(/^delete macro (.+)$/);
    if (macroDelete) {
      this.onMacroDelete?.(macroDelete[1]); return true;
    }

    // ── Confidence Heatmap ──
    if (t === 'show confidence') {
      this.onShowConfidence?.(); return true;
    }
    if (t === 'hide confidence') {
      this.onHideConfidence?.(); return true;
    }

    // ── Ghost Text (Suggestions) ──
    if (t === 'accept suggestion') {
      this.onAcceptSuggestion?.(); return true;
    }
    if (t === 'dismiss suggestion') {
      this.onDismissSuggestion?.(); return true;
    }

    // ── Diagram Generation ──
    if (t === 'diagram this') {
      this.onDiagram?.('auto'); this._flash('GENERATING DIAGRAM'); return true;
    }
    if (t === 'flowchart this') {
      this.onDiagram?.('flowchart'); this._flash('GENERATING FLOWCHART'); return true;
    }
    if (t === 'sequence diagram this') {
      this.onDiagram?.('sequence'); this._flash('GENERATING SEQUENCE DIAGRAM'); return true;
    }

    // ── Multi-Format Output ──
    if (t === 'format all') {
      this.onFormatAll?.(); this._flash('FORMATTING ALL'); return true;
    }
    const formatFor = t.match(/^format for (.+)$/);
    if (formatFor) {
      this.onFormatFor?.(formatFor[1]); return true;
    }

    // ── Analytics ──
    if (t === 'show analytics' || t === 'show stats') {
      this.onShowAnalytics?.(); this._flash('ANALYTICS'); return true;
    }

    // ── Session Search ──
    const searchSessions = t.match(/^search sessions (.+)$/);
    if (searchSessions) {
      this.onSearchSessions?.(searchSessions[1]); this._flash('SEARCHING'); return true;
    }

    // ── Timeline ──
    if (t === 'show timeline') {
      this.onShowTimeline?.(); return true;
    }
    if (t === 'hide timeline') {
      this.onHideTimeline?.(); return true;
    }

    // ── Command Builder ──
    if (t === 'build command') {
      this.onBuildCommand?.(); this._flash('COMMAND BUILDER'); return true;
    }

    return false;
  }

  reset() {
    this.commandCount = 0;
    this.undoStack = [];
  }
}
