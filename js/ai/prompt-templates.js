/**
 * Prompt Templates for Claude Code
 * Pre-built structures for common Claude Code prompts.
 */

export const TEMPLATES = {
  freeform: {
    label: 'Free Form',
    description: 'Minimal cleanup, preserve intent',
    instruction: `Clean up this dictated text into a clear, well-formatted prompt for Claude Code. Preserve the original intent exactly. Fix grammar and formatting but do not add structure or sections. Keep it conversational but professional.`,
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
