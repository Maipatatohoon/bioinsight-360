#!/usr/bin/env bash
# Stop the local BioInsight 360 backend and frontend started by start-local.sh.
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "bioinsight-360/frontend/node_modules/.bin/next" 2>/dev/null || true
echo "stopped backend (and this repo's frontend, if running)"
