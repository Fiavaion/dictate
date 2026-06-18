# ADR-002: Web Speech API for dictation (Chrome/Electron only)
**Status:** accepted
**Date:** 2026-06-18

## Context
The core feature is speech-to-text. Options were the browser-native Web Speech API,
a cloud STT service (Google/Azure/Deepgram), or a bundled local model (Whisper/Vosk).
Cloud STT adds cost, latency, an API-key requirement, and a privacy surface before the
user reaches the success metric. A bundled local model adds a large download and a build
step the project explicitly avoids. The Web Speech API ships free in Chromium browsers
and streams interim results with no setup.

## Decision
Use the browser-native Web Speech API (`SpeechRecognition`) for dictation, wrapped in
`js/stt/web-speech-engine.js`. This commits the app to Chromium-family browsers (Chrome,
Edge) and Electron, where the engine is available.

## Consequences
- **Enables:** zero-cost, zero-setup, low-latency streaming dictation with interim results
  feeding speak-as-you-type; no API key needed to start talking; supports the 30-second gate.
- **Rules out:** Firefox and Safari support (no/partial Web Speech support) — the app is
  not cross-browser by design. Recognition quality and language coverage are whatever the
  browser vendor provides; we cannot tune the acoustic model.
- Chrome's implementation routes audio to a Google service, so dictation is not fully
  offline even though we store no audio ourselves; the privacy-offline path is the AI
  layer (Ollama), not STT. Documented so it isn't mistaken for a private pipeline.
