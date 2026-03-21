/**
 * Prompt Templates for FiavaionDictate
 * Writing mode presets that control tone, style, and output format.
 */

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
  notes: {
    label: 'Notes',
    description: 'Meeting notes, minutes, and summaries',
    instruction: `Transform this dictated text into organized notes. Extract and group:
- Key discussion points or topics
- Decisions made
- Action items (with owners if mentioned)
- Important dates, numbers, or deadlines

Use bullet points and short, scannable phrases rather than full sentences. Group related items under topic headers if the dictation covers multiple subjects.`,
    systemPrompt: `You are a note-taking assistant. Transform spoken dictation into clean, organized notes. Extract key points, action items, decisions, and important details. Use bullet points and concise phrasing. Group related items logically.`,
    examples: [
      {
        input: `so in today's meeting we talked about the website redesign John said he'll have the mockups ready by Friday and then we discussed the budget which is looking tight so Maria is going to look into cheaper hosting options also we decided to push the launch to March 15th instead of March 1st`,
        output: `## Website Redesign
- John will have mockups ready by Friday
- Launch pushed to March 15th (was March 1st)

## Budget
- Budget is tight
- Maria investigating cheaper hosting options

## Action Items
- John: mockups by Friday
- Maria: research hosting alternatives`,
      },
    ],
    constraints: 'Return structured notes only. Use bullet points and short headers. No prose paragraphs, no preamble, no explanation.',
    parameters: {
      temperature: 0.2,
      maxTokens: 1200,
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

/** Load custom templates from localStorage */
export function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

/** Save a custom template */
export function saveCustomTemplate(key, template) {
  const custom = loadCustomTemplates();
  custom[key] = template;
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
}

/** Get all templates (built-in + custom) */
export function getAllTemplates() {
  return { ...TEMPLATES, ...loadCustomTemplates() };
}
