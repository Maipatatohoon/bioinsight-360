# BioInsight 360 — 2-Week Build Plan (then thesis)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In 2 weeks, reach a live, connected, scientifically-validated app **and** produce the evaluation artifacts the thesis needs (numbers, tables, figures) — so weeks 3–4 are pure writing.

**Architecture:** Next.js 16 (Vercel) ↔ FastAPI + SQLite (Docker/Colab-tunnel) ↔ headless worker running R/Bioconductor (DESeq2, edgeR, limma).

**Spec / sources of truth:** `ROADMAP.md` (61 bugs), `DEPLOYMENT.md`, `BioInsight_360_Colab_Runbook.ipynb`, `README.md`, `ARCHITECTURE.md`, `SCIENTIFIC_METHODS.md`, and the Project Proposal's evaluation strategy.

## Global Constraints
- Frontend repo must not track `backend` as a submodule; Vercel Root Directory is `frontend/`.
- Never commit `frontend/.next` or `backend/data`.
- Worker token must not be the default in any public deployment.
- TDD: failing test first; run the full suite before claiming done.

## Review Focus (thesis-critical correctness)
- **Numerical claims** must be verifiable: JS statistics vs scipy/statsmodels vs R, with recorded numbers.
- **Empty/one-group/non-integer uploads** → clear 4xx, never 500.
- **Non-standard group names** → counts/labels stay correct (C10).
- **`baseMean` is not comparable across engines** → labellers must not imply it is.
- **Cancelled jobs never upload results.**

## Time budget (10 working days)

| Day | Focus |
|---|---|
| **D1** | WS0 unblock (you) + WS1 deploy hardening (me) |
| **D2–D3** | WS2 backend security + correctness (me) |
| **D2–D4** | WS4 capture Phase 3 validation as soon as WS0 is green |
| **D4–D7** | WS3 frontend criticals (C1–C19) |
| **D7–D9** | WS4 evaluation artifacts (thesis tables/figures) |
| **D9–D10** | WS3 moderates (top subset), docs freeze, release tag |

---

## WS0 — Unblock (you; do on D1)
- [ ] **0.1** Vercel → Settings → Build and Deployment → **Root Directory = `frontend`** (exact) → Save → Redeploy.
- [ ] **0.2** If it won't hold: re-import project with Root Directory = `frontend`.
- [ ] **0.3** Colab → Run all → copy `PUBLIC_BACKEND_URL` (cell 4b).
- [ ] **0.4** Site → **Backend** → paste URL → **Test & Save**.
- [ ] **0.5** Submit demo dataset; confirm worker runs 3 engines and `/consensus` loads.
- [ ] **0.6** Revoke the leaked GitHub PAT.

**Acceptance:** site **Ready**; `/health` reachable via tunnel; demo job `COMPLETED`.

---

## WS1 — Deploy hardening (D1, me)
- [ ] **1.1** `vercel.json` pinning framework/install/build so re-import needs no manual settings.
- [ ] **1.2** `.github/workflows/ci.yml`: backend unittest job + frontend `npm test` + build job.
- [ ] **1.3** `.env.example` for frontend and backend (names only).
- [ ] **1.4** Verify CI green; commit.

## WS2 — Backend security + correctness (D2–D3, me, TDD)
- [ ] **2.1** CORS from `BIOINSIGHT_ALLOWED_ORIGINS`; constant-time token (`hmac.compare_digest`). Test.
- [ ] **2.2** Fail fast if default token in production (`BIOINSIGHT_ENV=production`). Test.
- [ ] **2.3** Optional bearer on `/api/analysis*` (env-gated). Test.
- [ ] **2.4** Fix C11 (g:Profiler overlapping genes) · C12 (limma padj) · C15 (QC reversed labels) · C19 (BH FDR overcorrection) — one failing test each.

## WS3 — Frontend critical bugs (D4–D7, me)
- [ ] **3.1** C1 heatmap index · C3 DEGTable `/6` · C4 UpSet bins · C5 `p=0`→1 · C6 hardcoded "6-pipeline".
- [ ] **3.2** C9 PCA fallback · C10 group labels · C13 SSRF in `/api/ncbi` · C14 `execSync` per request.
- [ ] **3.3** C16 enrichment thresholds · C17/C18 consensus FC split.
- [ ] **3.4** Top moderates only if time (M1 scattergl, M6 worker parsing, M18 timeouts).
- Each: failing test or documented check → fix → commit.

## WS4 — Thesis evaluation artifacts (D2–D9, you + me)
- [ ] **4.1** **Phase 3:** save `deseq2/edger/limma *_results.tsv` + MA/Volcano/PCA plots + log → `docs/validation/`.
- [ ] **4.2** **Numerical correctness table:** JS Welch/MWU/BH vs scipy/statsmodels (and R where available) — recorded deltas.
- [ ] **4.3** **Consensus stability + agreement table:** Fleiss κ / Jaccard / Overlap across thresholds.
- [ ] **4.4** **Runtime benchmark:** 20,000 genes × 8 samples (the proposal's evaluation spec).
- [ ] **4.5** **Docs freeze:** fix GSE52778 mislabel; align README/ARCHITECTURE; freeze numbers.

## WS5 — Only if time remains
- [ ] `next/font`, `plotly.js-dist-min`, a11y L-items. Cut without guilt.

---

## Definition of done (end of week 2)
1. Public site connects to a live backend; demo job returns real DESeq2/edgeR/limma results.
2. CI green; `vercel.json` + env examples committed.
3. Backend hardened (CORS, token, ownership) and correctness bugs C11/C12/C15/C19 fixed with tests.
4. C1–C19 frontend criticals fixed.
5. `docs/validation/` holds the four evaluation artifacts above with reproducible commands.
6. Docs consistent with the shipped system; a release tag on both repos.
