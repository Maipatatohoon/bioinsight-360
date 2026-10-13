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
2. Section 4 prints a public URL like `https://xxxx.trycloudflare.com`.
3. **Connect the site — pick one:**
   - **No redeploy needed (recommended):** on the deployed site, click **Backend** in the
     navbar, paste the tunnel URL, press **Test & Save**. It is stored in that browser and
     used immediately — ideal because the Colab URL changes every session.
   - **Bake it in:** set `NEXT_PUBLIC_BACKEND_URL` in Vercel → Settings → Environment
     Variables, then **Redeploy** (build-time value).
4. Leave the worker cell running. Submit an analysis from the site; the worker computes it.

> `NEXT_PUBLIC_*` values are baked in at build time — changing the Vercel variable does not
> update a running deployment without a redeploy. The in-app **Backend** control avoids that.

## Production path — host the backend

The repo ships `backend/Dockerfile` (Python 3.10 + R + Bioconductor, exposes port 7860):

```sh
docker build -t bioinsight-backend ./backend
docker run -p 7860:7860 \
  -e BIOINSIGHT_WORKER_TOKEN=<strong-secret> \
  -e BIOINSIGHT_DB_PATH=/data/jobs.db -v bioinsight-data:/data \
  bioinsight-backend
```

Then run the worker anywhere with `Rscript` available:

```sh
export BIOINSIGHT_BACKEND_URL=https://your-backend-host
export BIOINSIGHT_WORKER_TOKEN=<same-secret>
python backend/workers/colab_worker.py
```

## Environment variables

| Variable | Used by | Default | Notes |
|----------|---------|---------|-------|
| `NEXT_PUBLIC_BACKEND_URL` | Frontend (build time) | `http://localhost:8000` | Public backend URL. |
| `BIOINSIGHT_BACKEND_URL` | Worker | `http://localhost:8000` | Backend the worker polls. |
| `BIOINSIGHT_WORKER_TOKEN` | Backend + worker | `dev-token-123` | **Change in production.** Shared bearer token. |
| `BIOINSIGHT_DB_PATH` | Backend | `backend/data/bioinsight_jobs.db` | SQLite job DB location. |

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
