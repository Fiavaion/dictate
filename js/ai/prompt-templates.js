/**
 * Prompt Templates for Claude Code
 * Pre-built structures for common Claude Code prompts.
 */

export const TEMPLATES = {
  freeform: {
    label: 'Free Form',
    description: 'Minimal cleanup, preserve intent',
    instruction: `Clean up this dictated text into a clear, well-formatted prompt for Claude Code. Preserve the original intent exactly. Fix grammar and formatting but do not add structure or sections. Keep it conversational but professional.`,
    systemPrompt: `You are a dictation cleanup assistant for a developer. Your job is to lightly polish spoken text into readable prose without changing the meaning or adding structure. Fix grammar, punctuation, and filler words only.`,
    examples: [
      {
        input: `okay so I need to uh refactor the auth middleware to support JWT tokens instead of session cookies and also make sure the existing tests still pass because we can't break the login flow for the mobile app`,
        output: `Refactor the auth middleware to support JWT tokens instead of session cookies. Make sure the existing tests still pass — we can't break the login flow for the mobile app.`,
      },
    ],
    constraints: 'Return cleaned prose only. No markdown headers, no bullet points, no preamble, no explanations.',
    parameters: {
      temperature: 0.2,
      maxTokens: 800,
    },
  },
  bugfix: {
    label: 'Bug Fix',
    description: 'Describe a bug to fix',
    instruction: `Transform this dictated text into a well-structured bug fix prompt for Claude Code. Use this format:

## Bug
[One-sentence summary of the bug]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens, including any error messages mentioned]

## Steps to Reproduce
[Numbered steps if mentioned, or context about when it occurs]

## Relevant Files
[Any file paths, function names, or components mentioned]

Keep it concise. Only include sections that have relevant content from the dictation.`,
    examples: [
      {
        input: `so there's this bug where when I click the submit button on the login form it just uh hangs and nothing happens I checked the console and there's a type error saying cannot read property then of undefined in the auth service file around line 45 I think it's because the fetch call isn't returning a promise properly`,
        output: `## Bug
Login form submit button hangs with no response.

## Expected Behavior
Clicking submit should process the login request and navigate to the dashboard.

## Actual Behavior
The button hangs with no response. Console shows: \`TypeError: Cannot read property 'then' of undefined\`

## Steps to Reproduce
1. Navigate to login form
2. Enter credentials and click Submit
3. Observe hang and console error

## Relevant Files
- \`auth-service\` (~line 45) — fetch call not returning a promise properly`,
      },
    ],
    constraints: 'Return markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.2,
      maxTokens: 1000,
    },
  },
  feature: {
    label: 'New Feature',
    description: 'Add new functionality',
    instruction: `Transform this dictated text into a well-structured feature request prompt for Claude Code. Use this format:

## Feature
[Clear one-sentence description of what to build]

## Requirements
[Bullet points of specific requirements mentioned]

## Acceptance Criteria
[What "done" looks like — testable conditions]

## Files to Modify
[Any file paths, components, or areas of code mentioned]

Keep it concise. Only include sections that have relevant content from the dictation.`,
    examples: [
      {
        input: `I want to add a dark mode toggle to the settings page it should uh save the preference to local storage and apply it on page load we're using Tailwind so it should toggle the dark class on the HTML element and I think the toggle component should go in the settings dot tsx file next to the other preference controls`,
        output: `## Feature
Add a dark mode toggle to the settings page with persistent preference.

## Requirements
- Toggle component in the settings page alongside existing preference controls
- Save dark mode preference to localStorage
- Apply preference automatically on page load
- Toggle the \`dark\` class on the \`<html>\` element (Tailwind dark mode)

## Acceptance Criteria
- Clicking the toggle switches between light and dark themes instantly
- Preference persists across page reloads
- Default to system preference if no saved preference exists

## Files to Modify
- \`settings.tsx\` — add toggle component next to other preference controls`,
      },
    ],
    constraints: 'Return markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.2,
      maxTokens: 1000,
    },
  },
  refactor: {
    label: 'Refactor',
    description: 'Restructure existing code',
    instruction: `Transform this dictated text into a refactoring prompt for Claude Code. Use this format:

## Current State
[What exists now and what's wrong with it]

## Target State
[What the code should look like after refactoring]

## Constraints
[Things to preserve, backwards compatibility, etc.]

## Scope
[Specific files or areas to refactor]

Keep it concise. Only include sections that have relevant content from the dictation.`,
    examples: [
      {
        input: `the user service file is a mess right now it's like 800 lines long and it handles authentication and profile management and notification preferences all in one class I want to split it into three separate modules um auth service profile service and notification service and they should all implement the same base interface so we can inject them the same way but don't break the existing API routes that depend on user service`,
        output: `## Current State
\`user-service\` is ~800 lines handling authentication, profile management, and notification preferences in a single class.

## Target State
Split into three focused modules:
- \`auth-service\` — authentication logic
- \`profile-service\` — profile management
- \`notification-service\` — notification preferences

All three should implement a common base interface for consistent dependency injection.

## Constraints
- Do not break existing API routes that depend on \`user-service\`
- Maintain the same public API surface for consumers

## Scope
- \`user-service\` (source file to decompose)
- API route files that import from \`user-service\``,
      },
    ],
    constraints: 'Return markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1200,
    },
  },
  review: {
    label: 'Code Review',
    description: 'Review code changes',
    instruction: `Transform this dictated text into a code review prompt for Claude Code. Use this format:

## Files to Review
[File paths or areas mentioned]

## Focus Areas
[What to look for — bugs, performance, security, style, etc.]

## Context
[Any background about what changed and why]

Keep it concise. Only include sections that have relevant content from the dictation.`,
    examples: [
      {
        input: `can you review the changes I made to the payment controller and the order model I just added Stripe webhook handling and I'm worried about uh race conditions because the webhook can fire before the redirect comes back also check if I'm properly validating the signature because I kind of just followed the docs without really understanding the crypto part`,
        output: `## Files to Review
- Payment controller (Stripe webhook handler)
- Order model

## Focus Areas
- **Race conditions**: webhook can fire before the redirect callback returns — verify proper ordering/idempotency
- **Security**: validate Stripe webhook signature correctly (crypto verification)
- **General correctness**: overall implementation of webhook handling flow

## Context
Added Stripe webhook handling to the payment flow. Webhook signature validation was implemented following Stripe docs but needs verification.`,
      },
    ],
    constraints: 'Return markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.3,
      maxTokens: 1200,
    },
  },
  test: {
    label: 'Test Generation',
    description: 'Write tests for code',
    instruction: `Transform this dictated text into a test generation prompt for Claude Code. Use this format:

## Component to Test
[What module/function/component needs testing]

## Test Cases
[Specific scenarios to cover — happy path, edge cases, error handling]

## Coverage Goals
[What types of tests — unit, integration, e2e]

## Test Framework
[Any mentioned framework preferences — Jest, Vitest, pytest, etc.]

Keep it concise. Only include sections that have relevant content from the dictation.`,
    examples: [
      {
        input: `I need tests for the shopping cart module especially the add to cart function it should handle adding a new item and also incrementing quantity if the item's already in the cart and uh edge cases like adding zero quantity or negative numbers or items that don't exist in the product catalog we're using Vitest and I want both unit tests and integration tests that hit the API`,
        output: `## Component to Test
Shopping cart module, specifically the \`addToCart\` function.

## Test Cases
- Add a new item to an empty cart
- Add an item that already exists in the cart (should increment quantity)
- Add with zero quantity (should reject or no-op)
- Add with negative quantity (should reject)
- Add an item ID that doesn't exist in the product catalog (should error)

## Coverage Goals
- Unit tests for cart logic (add, increment, validation)
- Integration tests hitting the API endpoints

## Test Framework
Vitest`,
      },
    ],
    constraints: 'Return markdown only. No preamble, no explanations. Only include sections with relevant content.',
    parameters: {
      temperature: 0.2,
      maxTokens: 1000,
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
