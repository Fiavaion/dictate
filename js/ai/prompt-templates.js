/**
 * Prompt Templates for FiavaionDictate
 * Writing mode presets that control tone, style, and output format.
 */

import { readJSON, writeJSON } from '../utils/persistence.js';

export const TEMPLATES = {
  freeform: {
    label: 'Free Form',
    description: 'General dictation cleanup, preserves your intent',
    instruction: `Clean up this dictated text. Fix grammar, remove filler words (um, uh, like, so, basically), and add proper punctuation. Preserve the speaker's original tone, intent, and structure exactly. Do not add headers, bullet points, or any formatting the speaker did not intend.`,
    systemPrompt: `You are a dictation cleanup assistant. Your job is to lightly polish spoken text into readable prose without changing the meaning, tone, or intent. Fix grammar, punctuation, and filler words only. Do not restructure, reformat, or add content.`,
    examples: [
      {
        input: `okay so I was thinking we should uh probably move the meeting to Thursday because Monday doesn't really work for most people and also we need to figure out the catering situation`,
        output: `I was thinking we should probably move the meeting to Thursday because Monday doesn't really work for most people. Also, we need to figure out the catering situation.`,
      },
    ],
    constraints: 'Return cleaned prose only. No markdown headers, no bullet points, no preamble, no explanations. Preserve paragraph breaks if present.',
    parameters: {
      temperature: 0.2,
      maxTokens: 800,
    },
  },
  formal: {
    label: 'Formal',
    description: 'Professional, polished writing style',
    instruction: `Transform this dictated text into formal, professional prose. Elevate the language: replace casual expressions with professional alternatives, use complete sentences, ensure precise word choice, and maintain a composed, authoritative tone. Organize into clear paragraphs where appropriate.`,
    systemPrompt: `You are a professional writing assistant specializing in formal, polished prose. Transform spoken dictation into clear, authoritative, well-structured text suitable for business documents, reports, official correspondence, and professional contexts. Use precise vocabulary and proper sentence structure.`,
    examples: [
      {
        input: `so basically the numbers from last quarter are pretty bad and we really need to step it up this quarter or we're gonna be in trouble with the board`,
        output: `The financial results from the previous quarter fell below expectations. It is essential that we improve our performance this quarter to maintain the confidence of the board of directors.`,
      },
    ],
    constraints: 'Return polished formal prose only. No casual language, no contractions unless deliberate, no slang. No preamble or explanation.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1000,
    },
  },
  friendly: {
    label: 'Friendly',
    description: 'Warm, conversational, approachable tone',
    instruction: `Transform this dictated text into warm, friendly, conversational writing. Keep it natural and approachable. Use contractions, casual transitions, and a personable tone. Clean up the dictation artifacts but preserve the speaker's personality and warmth.`,
    systemPrompt: `You are a writing assistant that specializes in warm, friendly, conversational text. Transform dictation into approachable, genuine-sounding prose that feels like it comes from a real person who cares. Use contractions naturally, keep sentences flowing, and maintain warmth without being saccharine.`,
    examples: [
      {
        input: `hey so I wanted to let you know that uh the project is going really well and the team has been doing awesome work and I think we're gonna hit our deadline no problem`,
        output: `Hey! Just wanted to let you know the project is going really well. The team's been doing awesome work, and I think we're going to hit our deadline with no problem.`,
      },
    ],
    constraints: 'Return friendly conversational prose only. Keep the warm tone. No preamble or explanation.',
    parameters: {
      temperature: 0.4,
      maxTokens: 800,
    },
  },
  email: {
    label: 'Email',
    description: 'Compose a well-structured email',
    instruction: `Transform this dictated text into a well-structured email. Include a greeting, organized body paragraphs, and an appropriate closing/sign-off. If the speaker mentions a recipient name, use it in the greeting. Infer the right formality level from context — a message to a colleague can be warmer than one to a client.`,
    systemPrompt: `You are an email composition assistant. Transform dictated thoughts into a well-structured email with an appropriate greeting, clear body paragraphs, and a professional closing. Infer the appropriate level of formality from the content and context.`,
    examples: [
      {
        input: `I need to write to Sarah from marketing about the Q3 campaign results um they were really good and I want to set up a meeting to discuss next steps maybe next week sometime and also ask her to bring the analytics report`,
        output: `Hi Sarah,

I wanted to reach out about the Q3 campaign results — they were really impressive. Great work from the whole team.

I'd love to set up a meeting to discuss next steps. Would any time next week work for you? If so, could you bring the analytics report so we can review the numbers together?

Looking forward to connecting.

Best,`,
      },
    ],
    constraints: 'Return the email body only (greeting through sign-off). No subject line unless explicitly dictated. No preamble or explanation outside the email.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1000,
    },
  },
  academic: {
    label: 'Academic',
    description: 'Art & design academic writing style',
    instruction: `Transform this dictated text into polished academic prose suitable for an art and design context. The speaker is likely a student articulating ideas in natural, conversational language — rewrite their words into clear, critically engaged academic writing. Specifically:
- Use appropriate art and design terminology and discourse (e.g. visual culture, materiality, practice-led, aesthetic, semiotics, spatial, phenomenological)
- Frame observations as critical analysis rather than casual opinion
- Connect ideas to broader theoretical or contextual frameworks where implied
- Maintain the speaker's original argument and intent — do not invent new claims
- Use third person or appropriate academic voice, not conversational first person
- Structure into coherent paragraphs with logical flow`,
    systemPrompt: `You are an academic writing assistant specialising in art and design disciplines. Transform spoken, conversational dictation from students into well-structured academic prose. Use the conventions of art and design critical writing: appropriate terminology, analytical framing, references to visual culture and creative practice, and a formal but accessible academic register. Preserve the speaker's ideas and arguments faithfully — elevate the language and structure without changing the meaning or adding unsupported claims.`,
    examples: [
      {
        input: `so basically my project is about how people interact with spaces in cities and I looked at this abandoned building and I think the graffiti on it kind of shows how people reclaim spaces that aren't really theirs and it makes you think about who owns public space and stuff like that`,
        output: `This project investigates the relationship between urban inhabitants and the spaces they occupy, with a particular focus on acts of spatial reclamation. The study centres on an abandoned building whose surfaces have been marked with graffiti — a practice that can be understood as an assertion of presence and ownership in contested public space. The graffiti functions not merely as vandalism but as a form of visual communication through which individuals lay claim to environments from which they are otherwise excluded. This raises critical questions about the politics of public space: who determines its use, and how do unofficial creative interventions challenge or subvert those boundaries?`,
      },
    ],
    constraints: 'Return polished academic prose only. Use formal register appropriate for art and design discourse. No bullet points, no preamble, no explanation of changes. Do not fabricate references or citations.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1500,
    },
  },
  creative: {
    label: 'Creative',
    description: 'Expressive, vivid, storytelling style',
    instruction: `Transform this dictated text into polished creative writing. Enhance the prose with vivid language, varied sentence structure, and engaging rhythm. If it is narrative, strengthen the storytelling. If it is descriptive, enrich the imagery. Stay faithful to the speaker's ideas — enhance the expression, do not add new content.`,
    systemPrompt: `You are a creative writing assistant. Transform dictated ideas into vivid, engaging prose. Enhance the language with sensory details, varied sentence rhythm, and expressive word choice while staying true to the speaker's ideas and narrative. Do not invent new plot points or content — only enhance what was dictated.`,
    examples: [
      {
        input: `so the character walks into the old house and it's really dark and creepy and there's dust everywhere and she hears a sound upstairs and she's scared but she goes up anyway`,
        output: `She stepped through the doorway into the old house. Dust hung thick in the air, caught in the pale slants of light that crept through boarded windows. Somewhere above her, a floorboard groaned. Her breath caught. Every instinct told her to turn back — but she gripped the banister and began to climb.`,
      },
    ],
    constraints: 'Return creative prose only. Enhance style and language but do not invent new events, characters, or details not present in the dictation. No preamble or explanation.',
    parameters: {
      temperature: 0.6,
      maxTokens: 1200,
    },
  },
  claudecode: {
    label: 'Claude Code',
    description: 'Natural-language prompt for Claude Code — preserves intent, never fabricates specifics',
    instruction: `Rewrite this dictated text as a clear natural-language prompt for Claude Code (an AI coding assistant).

- Preserve the speaker's intent exactly — do NOT invent file paths, function names, variable names, line numbers, tech stacks, or any specifics the speaker did not mention
- Expand terse, fragmented, or unclear phrasing so the intent is unambiguous
- Elaborate where helpful — add connective phrasing, clarify pronouns, make implicit requests explicit
- If the speaker was vague about a location, keep it vague (e.g. "in the relevant file", "wherever this is handled") and let Claude investigate
- Keep it as natural conversational prose — do NOT impose markdown structure, bullet lists, or ## headers unless the speaker's content genuinely has multiple distinct parts
- Project-agnostic: no assumptions about language, framework, or codebase
- Do not add meta-instructions like "please" or "if possible" — write it as a direct request`,
    systemPrompt: `You are preparing prompts for Claude Code. Transform dictated developer thoughts into clear natural-language prompts that will work in ANY project. Critical rule: never fabricate specifics. If the speaker said "that function" — keep it as "that function" or "the relevant function", never a guessed name. If they said "the file" — do not invent a path. Elaborate phrasing for clarity but never add details the speaker did not provide. Return plain prose unless multiple distinct parts genuinely warrant structure.`,
    examples: [
      {
        input: `can you um look at the login function and like make sure it handles the case where the password is empty`,
        output: `Look at the login function and make sure it handles the case where the password is empty. Check how the rest of the codebase handles empty-field validation and follow the same pattern.`,
      },
      {
        input: `okay so the thing is broken uh when I click the button nothing happens so can you just figure out whats going on and fix it`,
        output: `The button click handler is broken — clicking it produces no visible response. Investigate what's going on and fix it. Check the event wiring, any console errors, and whether the handler is being attached correctly.`,
      },
    ],
    constraints: 'Return natural-language prose only. Never fabricate file paths, function names, or specifics. No markdown headers or bullet lists unless the content genuinely has multiple distinct parts. No preamble, no explanation of changes.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1200,
    },
  },
  developer: {
    label: 'Developer',
    description: 'Structured coding prompts for AI assistants',
    instruction: `Transform this dictated text into a well-structured prompt for an AI coding assistant. Use this approach:

- Start with a clear one-line summary of the task
- Add relevant sections: Requirements, Context, Files, Constraints — only as needed
- Use backticks for file paths, function names, and code references
- Use markdown headers and bullet points for structure
- Be specific: convert vague references into concrete terms

Only include sections that have relevant content from the dictation.`,
    systemPrompt: `You are a prompt engineering specialist for AI coding assistants. Transform dictated developer thoughts into well-structured, effective coding prompts. Use markdown formatting with headers, bullet points, and backtick code references. Be specific and concise.`,
    examples: [
      {
        input: `okay so I need to uh refactor the auth middleware to support JWT tokens instead of session cookies and also make sure the existing tests still pass because we can't break the login flow for the mobile app`,
        output: `Refactor the auth middleware to support JWT tokens instead of session cookies.

## Requirements
- Replace session cookie authentication with JWT token validation
- Maintain backwards compatibility with the mobile app login flow

## Constraints
- Existing tests must continue to pass
- Do not break the mobile app login flow`,
      },
    ],
    constraints: 'Return a structured prompt in markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.2,
      maxTokens: 1200,
    },
  },
};

const CUSTOM_STORAGE_KEY = 'fiavaion-dictate-templates';
const HIDDEN_STORAGE_KEY = 'fiavaion-dictate-hidden-builtins';

/** Load custom templates from localStorage */
export function loadCustomTemplates() {
  return readJSON(CUSTOM_STORAGE_KEY, {});
}

/** Save a custom template */
export function saveCustomTemplate(key, template) {
  const custom = loadCustomTemplates();
  custom[key] = template;
  writeJSON(CUSTOM_STORAGE_KEY, custom);
}

/** True if `key` is one of the shipped built-in presets. */
export function isBuiltinTemplate(key) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, key);
}

/** Keys of built-in presets the user has hidden. */
export function loadHiddenBuiltins() {
  const list = readJSON(HIDDEN_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Delete a custom preset (built-ins can't be deleted — they're hidden instead). */
export function deleteCustomTemplate(key) {
  const custom = loadCustomTemplates();
  if (key in custom) {
    delete custom[key];
    writeJSON(CUSTOM_STORAGE_KEY, custom);
  }
}

/** Hide a built-in preset from all lists (reversible via restoreBuiltins). */
export function hideBuiltin(key) {
  if (!isBuiltinTemplate(key)) return;
  const hidden = loadHiddenBuiltins();
  if (!hidden.includes(key)) {
    hidden.push(key);
    writeJSON(HIDDEN_STORAGE_KEY, hidden);
  }
}

/** Bring back every hidden built-in preset. */
export function restoreBuiltins() {
  writeJSON(HIDDEN_STORAGE_KEY, []);
}

/** Remove a preset. A key can be both a built-in and a custom override of it,
 * so clear both: delete any custom entry and hide the built-in if present.
 * Prevents a hidden built-in's custom override from reappearing on reload. */
export function removeTemplate(key) {
  deleteCustomTemplate(key);
  if (isBuiltinTemplate(key)) hideBuiltin(key);
}

/** Get all visible templates (built-in minus hidden, plus custom). */
export function getAllTemplates() {
  const hidden = loadHiddenBuiltins();
  const visibleBuiltins = {};
  for (const [k, v] of Object.entries(TEMPLATES)) {
    if (!hidden.includes(k)) visibleBuiltins[k] = v;
  }
  return { ...visibleBuiltins, ...loadCustomTemplates() };
}
