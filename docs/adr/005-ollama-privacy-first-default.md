# ADR-005: Ollama as the privacy-first local AI default
**Status:** accepted
**Date:** 2026-06-18

## Context
AI correction is the second half of the core workflow. The app supports multiple providers:
local Ollama and cloud APIs (Gemini, Anthropic), routed through `js/ai/ai-client.js`. A
default had to be chosen. Cloud providers give the best quality out of the box but require
an API key and send the user's dictated text off-device — a privacy cost that also blocks
the 30-second success metric behind a signup-and-key step. Local inference via Ollama keeps
text on-device and needs no key, at the cost of requiring Ollama to be installed and running.

## Decision
Treat Ollama (local) as the privacy-first default AI path, with Gemini and Anthropic as
opt-in cloud providers the user configures with their own key. The provider router in
`js/ai/ai-client.js` and `js/ai/ollama-client.js` selects the backend; cloud keys live
only in localStorage (per ADR-001), never in code.

## Consequences
- **Enables:** a fully on-device correction path (text never leaves the machine) for
  privacy-sensitive users; no API key required to use the app end-to-end when Ollama is up.
- **Rules out:** guaranteed AI correction with zero local setup — if Ollama is not installed
  the user must either install it or switch to a cloud provider and supply a key. The UI
  must therefore make the cloud fallback discoverable so a user without Ollama still reaches
  the success metric.
- Local model quality depends on whatever model the user has pulled; eval baselines
  (`evals/`) are run against Gemini 2.5 Flash for a stable cloud reference, with Ollama
  results being user-configuration-dependent.
