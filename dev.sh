#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down..."
    [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && wait "$FRONTEND_PID" 2>/dev/null
    echo "Done."
    exit 0
}

trap cleanup INT TERM

timestamp() {
    date +"%Y%m%d_%H%M%S"
}

# Log rotator for backend: watches for uvicorn reload marker and switches log files.
# Tees every line to both the terminal (prefixed) and the current log file.
backend_log_rotator() {
    local logfile="$LOG_DIR/backend_$(timestamp).log"
    echo "[backend] logging to $logfile"
    while IFS= read -r line; do
        if [[ "$line" == *"WatchFiles detected changes"* ]]; then
            logfile="$LOG_DIR/backend_$(timestamp).log"
            echo "[backend] log rotated → $logfile"
        fi
        echo "[backend] $line"
        echo "$line" >> "$logfile"
    done
}

# Frontend log handler: writes all output to a single log file per invocation.
frontend_log_handler() {
    local logfile="$LOG_DIR/frontend_$(timestamp).log"
    echo "[frontend] logging to $logfile"
    while IFS= read -r line; do
        echo "[frontend] $line"
        echo "$line" >> "$logfile"
    done
}

# Start backend
source "$PROJECT_DIR/venv/bin/activate"
uvicorn server:app --reload --port 8000 2>&1 | backend_log_rotator &
BACKEND_PID=$!

# Start frontend
(cd "$PROJECT_DIR/frontend" && npm run dev 2>&1) | frontend_log_handler &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID | Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both services."

wait
