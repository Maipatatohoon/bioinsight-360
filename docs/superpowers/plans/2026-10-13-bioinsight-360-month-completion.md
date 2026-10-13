# BioInsight 360 — Month Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take BioInsight 360 from "builds locally but not deployed" to a live, connected, scientifically-validated application with CI and a hardened backend, within one month.

**Architecture:** Next.js 16 frontend on Vercel (client-side consensus engine) ↔ FastAPI + SQLite backend (job queue, validation, QC, results) hosted via Docker or a Colab-run process exposed by a cloudflared tunnel, with a headless worker running R/Bioconductor (DESeq2, edgeR, limma).

**Tech Stack:** Next.js 16.3 / React 19 / Plotly · FastAPI / Pydantic / SQLite · R 4.x + Bioconductor · Docker · GitHub Actions · Google Colab.

**Spec / sources of truth:**
- Audit: this repo's `ROADMAP.md` (61 bugs: C1–C19, M1–M32, L1–L10)
- Deployment & connection: `DEPLOYMENT.md`
- Runner: `BioInsight_360_Colab_Runbook.ipynb`
- Project handover (purpose, phases): `README.md`, `ARCHITECTURE.md`, `SCIENTIFIC_METHODS.md`

## Global Constraints
- Backend is a **separate repo** (`Maipatatohoon/bioinsight-backend`); the frontend repo must **not** track it as a submodule.
- Frontend app root for Vercel is **`frontend/`**; there is no root `package.json`.
- Backend base URL is resolved at runtime (localStorage override) before build-time `NEXT_PUBLIC_BACKEND_URL`.
- Never commit build output (`frontend/.next`) or local state (`backend/data`).
- Worker token must not be the default `dev-token-123` in any public deployment.
- All work is TDD: failing test first; run the whole suite before claiming done.

## Review Focus
- **Empty/invalid uploads** (no rows, one group only, non-integer counts) — must fail with a clear message, never a 500.
- **Backend unreachable / tunnel down** — the UI must degrade gracefully, not hang.
- **Non-standard group names** (not CONTROL/TREATED) — counts and labels must stay correct (ROADMAP C10).
- **Labelled axes/metrics**: `baseMean` differs across engines; labellers must not imply they are comparable.
- **Cancelling mid-run** — results must never be uploaded for a cancelled job.

---

## Workstreams & priority

| # | Workstream | Owner | Depends on | Ships |
|---|-----------|-------|-----------|-------|
| **WS0** | Unblock deploy + connect | **you + me** | — | live site + green dot |
| **WS1** | Deploy hardening (vercel.json, CI, env examples) | me | — | reproducible deploys |
| **WS2** | Backend security + correctness | me | — | safe, correct API |
| **WS3** | Frontend ROADMAP bug burn-down | me | — | correct UI results |
| **WS4** | Scientific validation (Phase 3) + docs | you + me | WS0 | validated numbers |
| **WS5** | Performance & polish | me | WS2/WS3 | snappy UX |

---

## WS0 — Unblock (do first; only you can do 0.1–0.3)

- [ ] **0.1 Fix the Vercel Root Directory** to exactly `frontend` (Settings → Build and Deployment), Save, Redeploy `main`. *(Last failure was `"frontend " does not exist`.)*
- [ ] **0.2 If the setting won't hold**, delete the project and re-import with **Root Directory = `frontend`** on the import screen.
- [ ] **0.3 Run the Colab notebook** (Runtime → Run all) and capture `PUBLIC_BACKEND_URL` from cell 4b.
- [ ] **0.4 On the live site:** Navbar → **Backend** → paste URL → **Test & Save** (green).
- [ ] **0.5 Submit the demo dataset** on `/upload`; confirm the worker runs the 3 engines and `/consensus` loads results.

**Acceptance:** site shows **Ready** on Vercel; `/health` reachable through the tunnel; a demo job reaches `COMPLETED` with DEG results.

---

## WS1 — Deploy hardening (start immediately; low risk)

### Task 1.1: Version the Vercel config
**Files:** Create `vercel.json`; Create `frontend/.env.example`; Create `backend/.env.example`
- [ ] Add `vercel.json` pinning framework/build/install so a clean re-import needs no manual build settings.
- [ ] Add env **examples** (names only, no secrets).
- [ ] Verify: `vercel build` locally **or** confirm the next deploy reads it; commit.

### Task 1.2: CI pipeline
**Files:** Create `.github/workflows/ci.yml`
- [ ] Job `backend`: setup Python, `pip install -r backend/requirements.txt`, run `python -m unittest discover -s backend/tests -t backend`.
- [ ] Job `frontend`: `npm ci` in `frontend/`, run `npm test`, run `npm run build`.
- [ ] Verify on the next push: both jobs green.

---

## WS2 — Backend security & correctness (TDD)

### Task 2.1: Configurable CORS + constant-time token
**Files:** Modify `backend/app/main.py`; Test `backend/tests/test_security.py`
- [ ] Test: CORS origin list comes from `BIOINSIGHT_ALLOWED_ORIGINS` (comma-separated); token compare uses `hmac.compare_digest`.
- [ ] Implement; run suite.

### Task 2.2: Fail fast on default token in production
**Files:** Modify `backend/app/main.py`
- [ ] Test: starting the app with `BIOINSIGHT_ENV=production` and no token set raises/logs loudly.
- [ ] Implement; run suite.

### Task 2.3: Correctness bugs C11 / C12 / C15 / C19
**Files:** Modify `frontend/lib/gprofiler_api.js` (C11), `frontend/lib/enrichment.js`/`consensus.js` (C12 limma padj), `frontend/lib/qc.js` (C15 reversed labels), `frontend/lib/statistics.js` (C19 BH overcorrection); Tests alongside.
- [ ] One failing test per bug reproducing the exact wrong output, then fix, one commit each.

---

## WS3 — Frontend bug burn-down

### Tasks 3.1–3.n: Critical registry (C1–C19)
- [ ] C1 AgreementHeatmap index mismatch · C3 DEGTable `/6` · C4 UpSet bins · C5 `p=0` → 1 · C6 hardcoded "6-pipeline" · C9/C10 PCA fallback + group labels · C13 SSRF in `/api/ncbi` · C14 `execSync` per request · C16 enrichment thresholds · C17/C18 consensus FC split.
- [ ] Each: failing test (where logic is pure) or a documented manual check, then fix, then commit.
- [ ] Then moderate items (M1–M32) as capacity allows.

---

## WS4 — Scientific validation & docs (after WS0)

- [ ] **4.1 Phase 3:** from the Colab run, save `*_results.tsv` + MA/Volcano/PCA plots; commit under `docs/validation/` with the log.
- [ ] **4.2 Reconcile docs:** fix the GSE52778 mislabel (thesis says "breast cancer"; it is dexamethasone airway smooth muscle, Himes 2014); align `README`/`ARCHITECTURE` with the shipped architecture.
- [ ] **4.3 Handover:** update status table with verified Phase 3 evidence.

---

## WS5 — Performance & polish (optional, if time)

- [ ] Volcano → `scattergl` (M1) · `Papa.parse` in a Worker (M6) · `next/font` (M10) · `plotly.js-dist-min` (dep) · a11y L-items.

---

## Milestones

| Week | Outcome |
|------|---------|
| **1** | WS0 done (live + connected), WS1 done (CI + vercel.json), WS2 started |
| **2** | WS2 done; WS3 criticals C1–C19 done |
| **3** | WS3 moderates; WS4 validation captured |
| **4** | WS5 polish, docs final, thesis numbers frozen |
