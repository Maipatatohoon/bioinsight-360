#!/usr/bin/env bash
# Start BioInsight 360 locally: backend (local R runtime) + frontend.
# No Colab, no tunnel, no worker.
set -euo pipefail

ENV_PREFIX="${ENV_PREFIX:-$HOME/micromamba/envs/bioinsight}"
BACKEND_DIR="${BACKEND_DIR:-$HOME/bioinsight-backend}"
FRONTEND_DIR="${FRONTEND_DIR:-$HOME/bioinsight-360/frontend}"
LOG_DIR="${LOG_DIR:-/tmp/opencode}"
PORT="${PORT:-8000}"

[ -x "$ENV_PREFIX/bin/Rscript" ] || {
  echo "R environment missing at $ENV_PREFIX"
  echo "Run: bash $(dirname "$0")/setup-local-r.sh"
  exit 1
}
[ -f "$BACKEND_DIR/app/main.py" ] || { echo "Backend not found at $BACKEND_DIR"; exit 1; }

mkdir -p "$LOG_DIR" "$BACKEND_DIR/data"
pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1

cd "$BACKEND_DIR"
PATH="$ENV_PREFIX/bin:$PATH" \
BIOINSIGHT_RUNTIME=local \
BIOINSIGHT_WORKER_TOKEN="${WORKER_TOKEN:-dev-token-123}" \
BIOINSIGHT_DB_PATH="$BACKEND_DIR/data/jobs.db" \
BIOINSIGHT_ALLOWED_ORIGINS="*" \
BIOINSIGHT_ENV=development \
nohup "$ENV_PREFIX/bin/python" -m uvicorn app.main:app \
  --host 0.0.0.0 --port "$PORT" > "$LOG_DIR/local-backend.log" 2>&1 &
echo "backend pid $!  (log: $LOG_DIR/local-backend.log)"

for i in $(seq 1 20); do
  sleep 1
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "backend healthy: $(curl -fsS "http://localhost:$PORT/health")"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "backend did not start; last log lines:"
    tail -30 "$LOG_DIR/local-backend.log"
    exit 1
  fi
done

if ! curl -fsS -o /dev/null http://localhost:3000/ 2>/dev/null; then
  cd "$FRONTEND_DIR"
  nohup npm run dev > "$LOG_DIR/bioinsight-dev.log" 2>&1 &
  echo "frontend starting (log: $LOG_DIR/bioinsight-dev.log)"
  sleep 6
fi

echo
echo "Open in Firefox:"
echo "  http://localhost:3000/?backend=http://localhost:$PORT"
