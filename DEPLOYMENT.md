# Deploying & Connecting BioInsight 360

This describes how the pieces fit together and how to get the deployed frontend talking to a
working backend.

## Components

| Piece | Where | What |
|-------|-------|------|
| Frontend (Next.js) | Vercel | Client-side 6-pipeline consensus + dashboard; calls the backend for real DESeq2/edgeR/limma. |
| Backend (FastAPI) | Docker / cloud host / Colab | Job queue, validation, QC; serves results. |
| Worker (headless) | Google Colab (or any box with R) | Polls the backend, runs the R engines, uploads results. |

The frontend reads its backend location from **`NEXT_PUBLIC_BACKEND_URL`** (build-time), and
talks only to these routes (already implemented in `frontend/lib/backend_api.js`):

- `GET  /health`
- `POST /api/analysis`
- `GET  /api/analysis/{job_id}`
- `GET  /api/analysis/{job_id}/results`

## Quick path — Colab provides the backend

1. Open **`BioInsight_360_Colab_Runbook.ipynb`** in Colab and run it top to bottom.
2. **STEP 11** prints a public URL like `https://xxxx.trycloudflare.com`
   (**STEP 14** reprints it).
3. **Connect the site — pick one:**
   - **No redeploy needed (recommended):** on the deployed site, click **Backend** in the
     navbar, paste the tunnel URL, press **Test & Save**. It is stored in that browser and
     used immediately — ideal because the Colab URL changes every session.
   - **Bake it in:** set `NEXT_PUBLIC_BACKEND_URL` in Vercel → Settings → Environment
     Variables, then **Redeploy** (build-time value).
4. Leave the worker cell running. Submit an analysis from the site; the worker computes it.

> `NEXT_PUBLIC_*` values are baked in at build time — changing the Vercel variable does not
> update a running deployment without a redeploy. The in-app **Backend** control avoids that.

### If STEP 1 says "Failed to fetch"

STEP 1 makes no network calls, so this is Colab's browser↔runtime link, not the notebook:

- Firefox: Enhanced Tracking Protection → **Standard**, allow
  `colab.research.google.com` and `*.googleusercontent.com`, disable content blockers.
- Chrome: allow third-party cookies for `colab.research.google.com`, disable extensions,
  retry in Incognito.
- Campus/corporate Wi-Fi commonly blocks the runtime WebSocket. Open Colab on a **phone
  hotspot**; the tunnel is created on Colab's VM, so the URL remains public after you
  switch the laptop back to Wi-Fi.
- Confirm with a brand-new notebook running `print("hi")`. If that fails too, the
  notebook is not the cause.

The runbook applies a backend hotfix automatically: DESeq2/edgeR/limma sometimes return
`NA`/`Inf` for all-zero genes, which used to crash `GET /results` with
`Out of range float values are not JSON compliant`. Those values are now sent as `null`.

## Production path — host the backend

The backend ships a Docker image (`backend/Dockerfile`: Python 3.10 + R + Bioconductor
`DESeq2/edgeR/limma`, non-root, healthcheck, port **7860**) and a `docker-compose.yml`.

**Docker Compose (easiest):**

```sh
cd backend
BIOINSIGHT_WORKER_TOKEN=<strong-secret> docker compose up --build
# -> http://localhost:7860/health
```

**Plain Docker:**

```sh
docker build -t bioinsight-backend ./backend
docker run -p 7860:7860 \
  -e BIOINSIGHT_WORKER_TOKEN=<strong-secret> \
  -e BIOINSIGHT_ENV=production \
  -v bioinsight-data:/data \
  bioinsight-backend
```

**Managed hosts:** the image runs as-is on **Hugging Face Spaces** (Docker SDK, port 7860),
**Render**, **Fly.io**, **Railway**, or any VM. Set `BIOINSIGHT_WORKER_TOKEN` (and
`BIOINSIGHT_ENV=production`) as secrets, and mount a volume at **`/data`** so the SQLite
job DB survives restarts.

By default jobs wait for a worker (`BIOINSIGHT_RUNTIME=colab`). To run the R engines
inside the container itself, set `BIOINSIGHT_RUNTIME=local` (the image already has R).

Then run the worker anywhere with `Rscript` available (e.g. the Colab notebook):

```sh
export BIOINSIGHT_BACKEND_URL=https://your-backend-host
export BIOINSIGHT_WORKER_TOKEN=<same-secret>
python backend/workers/colab_worker.py
```

## Pointing the deployed site at a backend

A Colab tunnel URL changes every session, so the deployed build cannot hardcode it. There
are two ways to connect, and the per-browser choice always wins over the build-time default:

1. **Shareable link (no redeploy).** Open
   `https://bioinsight-360.vercel.app/?backend=<backend-url>`. The app adopts that backend,
   stores it in the browser, and removes the parameter from the address bar. Cell **4b** of
   the Colab runbook prints this link ready to click, so it can be shared with an examiner
   while the notebook runs.
2. **Build-time default.** Set `NEXT_PUBLIC_BACKEND_URL` in Vercel → Settings →
   Environment Variables and redeploy (`NEXT_PUBLIC_*` is baked in at build time).

**Reset** in the navbar *Backend* popover clears the browser override and falls back to the
build-time default.

## Environment variables

| Variable | Used by | Default | Notes |
|----------|---------|---------|-------|
| `NEXT_PUBLIC_BACKEND_URL` | Frontend (build time) | `http://localhost:8000` | Public backend URL. |
| `BIOINSIGHT_BACKEND_URL` | Worker | `http://localhost:8000` | Backend the worker polls. |
| `BIOINSIGHT_WORKER_TOKEN` | Backend + worker | `dev-token-123` | **Change in production.** Shared bearer token. |
| `BIOINSIGHT_DB_PATH` | Backend | `backend/data/bioinsight_jobs.db` | SQLite job DB location. |
| `BIOINSIGHT_RUNTIME` | Backend | `colab` | `colab` = wait for a remote worker; `local` = run R engines on this machine (needs `Rscript`). |
| `BIOINSIGHT_ALLOWED_ORIGINS` | Backend | localhost | Comma-separated CORS origins. |
| `BIOINSIGHT_ENV` | Backend | `development` | `production` refuses to start with the default token. |

## Local development

```sh
# Backend (from backend/, with R installed for real analysis)
BIOINSIGHT_WORKER_TOKEN=dev-token-123 ./.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev   # http://localhost:3000
```

Run the backend test suite:

```sh
cd backend && ./.venv/bin/python -m unittest discover -s tests -t .
# 19 tests: job lifecycle, worker, validation, HTTP workflow, cross-process claim
```

## Health check

```sh
curl http://localhost:8000/health
# {"status":"healthy","service":"bioinsight-backend"}
```
