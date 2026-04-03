#!/bin/bash
# FiavaionDictate launcher for macOS — double-click to start

cd "$(dirname "$0")"

# ── Check Python 3 ─────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    osascript -e 'display dialog "Python 3 is required but was not found.\n\nInstall it from python.org, or via Homebrew:\n  brew install python\n\nThen double-click start.command again." with title "FiavaionDictate" buttons {"Open python.org", "Cancel"} default button "Open python.org" with icon stop'
    if [ $? -eq 0 ]; then
        open "https://www.python.org/downloads/"
    fi
    exit 1
fi

echo "Starting FiavaionDictate..."

# ── Start server in background ─────────────────────────────────────────────────
python3 server.py &
SERVER_PID=$!

# ── Poll until server responds (max 20 seconds) ────────────────────────────────
for i in $(seq 1 20); do
    sleep 1
    python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/system/check', timeout=1)" 2>/dev/null && break
done

# ── Open browser ───────────────────────────────────────────────────────────────
open "http://localhost:8080"
echo "FiavaionDictate is running. Close this Terminal window to stop the server."

# Keep server alive
wait $SERVER_PID
