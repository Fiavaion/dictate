# Lessons Ledger

_Capture insights inline as `// LESSON-{ARCH|BUG|PERF|API|UI|TEST|BUILD}-NNN: summary`_
_Then run `/lessons` to fold them here. Capture as they happen, never retrospectively._

---

#### LESSON-BUILD-001: ELECTRON_RUN_AS_NODE silently breaks the app
**Problem:** Electron app launches, no window appears, no error shown  
**Root cause:** VS Code sets `ELECTRON_RUN_AS_NODE=1` in its integrated terminal. This
makes the Electron binary behave as plain Node.js, completely skipping browser process
initialization. The main process code runs but never creates a BrowserWindow.  
**Fix:** Before launching Electron from VS Code terminal: `$env:ELECTRON_RUN_AS_NODE = $null`  
**Prevention:** This env var check should be the first thing checked when Electron window
doesn't appear. End users are not affected (their terminals don't have this set).  
**Location:** electron/main.js   **Impact:** high (app unusable without this)

---

#### LESSON-API-001: session.defaultSession.setWindowOpenHandler does not exist
**Problem:** Electron app throws `setWindowOpenHandler is not a function` at startup  
**Root cause:** `setWindowOpenHandler` is a method on `webContents`, not on `session`.
Calling it on `session.defaultSession` throws.  
**Fix:** Use `mainWindow.webContents.setWindowOpenHandler(...)` after creating the window  
**Prevention:** When adding Electron window handlers, always check which object the method
belongs to in the Electron docs.  
**Location:** electron/main.js   **Impact:** high (prevented app launch)

---

#### LESSON-API-002: Gemini API returns HTTP 405 on GitHub Pages
**Problem:** "Connect Gemini" wizard shows HTTP 405 error  
**Root cause:** GitHub Pages proxied the API call through the server (which doesn't exist
in Pages mode). The Gemini API must be called directly from the browser.  
**Fix:** In GitHub Pages mode, ai-client.js calls the Gemini REST API directly  
**Prevention:** Always verify which code path runs in GitHub Pages mode vs server mode.
The server proxy pattern breaks in static hosting.  
**Location:** js/ai/ai-client.js   **Impact:** medium (blocked cloud AI on Pages)
