#!/bin/bash
# Double-click on macOS, or run "bash start-mac.command" on Linux.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed on this computer."
  echo "  Download the LTS version from https://nodejs.org, install it, then run this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi

[ -f .env ] || cp .env.example .env
[ -d node_modules/express ] || { echo "Installing dependencies..."; npm install; }

OPEN_BROWSER=1 node server/server.js
