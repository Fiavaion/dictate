#!/bin/bash
# FiavaionDictate launcher for macOS
# Double-click this file to start the app

# Change to the folder this script lives in
cd "$(dirname "$0")"

# Check for Python 3
if ! command -v python3 &>/dev/null; then
    osascript -e 'display dialog "Python 3 is not installed.\n\nPlease install it from python.org or via Homebrew:\n  brew install python\n\nThen double-click start.command again." with title "FiavaionDictate" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

echo "Starting FiavaionDictate..."

# Open browser after a short delay to let the server start
(sleep 1.5 && open "http://localhost:8080") &

# Start the server (stays open in Terminal)
python3 server.py
