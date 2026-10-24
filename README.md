# BioInsight 360: Interactive Multi-Engine RNA-seq Consensus & Interpretation Framework

**BioInsight 360** is a production-grade, scientifically defensible platform for RNA-seq differential expression analysis and downstream interpretation. It bridges the gap between high-performance Bioconductor statistical packages (**DESeq2**, **edgeR**, **limma-voom**) and interactive, web-based transcriptomic visualization.

---

## 🚀 Run it free: Colab backend + Vercel frontend

No paid hosting is required. The R/Bioconductor backend runs on a **free Google
Colab CPU runtime** and is exposed with a Cloudflare quick tunnel; the Next.js
frontend stays on **Vercel**.

1. Open **[`BioInsight_360_Colab_Runbook.ipynb`](BioInsight_360_Colab_Runbook.ipynb)**
   ([Open in Colab](https://colab.research.google.com/github/Maipatatohoon/bioinsight-360/blob/main/BioInsight_360_Colab_Runbook.ipynb)) —
   or download it and use **File → Upload notebook**.
2. **Runtime → Change runtime type → CPU**. GPU is not needed.
3. Run **STEP 1 → STEP 14** in order. **Do not use Run all.**
   First run: 25–45 min (R/Bioconductor compilation). Later runs: ~2 min.
4. **STEP 11** prints a URL like `https://random-words.trycloudflare.com`.
   **STEP 14** reprints it at any time.
5. Open `https://bioinsight-360.vercel.app/?backend=<that URL>`, or paste the URL
   into the **Backend** control in the navbar. Keep the Colab tab open — closing
   it kills the tunnel.
6. **Upload → Load Demo Data → Continue → QC → Consensus → Pathways → Export.**

> Free Colab gives about 12 GB RAM and 2 vCPU, which is enough for the 42k-gene
> demo and for typical course datasets. The tunnel URL changes every session, so
> paste the new one after each restart. Colab disconnects after long idle periods;
> re-run **STEP 10 → STEP 12** and copy the new URL.

### "Failed to fetch" when running STEP 1

STEP 1 only imports `os`, `platform`, `sys` — it makes **no network calls**. The
error is Colab's browser↔runtime connection, not this notebook:

- **Firefox:** Settings → Privacy & Security → Enhanced Tracking Protection →
  **Standard**; Manage Exceptions → allow `https://colab.research.google.com` and
  `https://*.googleusercontent.com`; disable uBlock Origin / Privacy Badger for
  Colab; retry in a private window.
- **Chrome:** Settings → Privacy and security → Third-party cookies → **Allow
  third-party cookies**; add `colab.research.google.com` to the allowed list;
  disable extensions; retry in Incognito.
- **Campus/corporate Wi-Fi** often blocks the WebSocket Colab needs. Start Colab
  on a **phone hotspot**. The tunnel runs on Colab's VM, so once STEP 11 prints
  the URL you can switch the laptop back to Wi-Fi — the URL stays public.
- **Sanity check:** a brand-new notebook running `print("hi")` fails the same
  way → the problem is the network/browser, not BioInsight.

The notebook automatically applies a backend hotfix so real datasets containing
`NA`/`Inf` statistics return `null` instead of failing with a 500.

---

## 🌟 Key Features

1. **Authentic Bioconductor Engine (Zero JS Approximations):**
   - Directly executes native R scripts using standard Bioconductor libraries (`DESeq2`, `edgeR`, `limma-voom`).
   - Maintains statistical rigor: empirical Bayes dispersion shrinkage, TMM normalization, precision weighting, and Benjamini-Hochberg FDR correction.

2. **Job-Oriented Asynchronous Architecture:**
   - Decoupled Next.js React frontend (hosted on Vercel) and Python FastAPI computation worker (hosted on Docker / Cloud Provider).
   - Asynchronous job queue (`QUEUED`, `VALIDATING`, `ANALYZING`, `GENERATING_RESULTS`, `COMPLETED`, `FAILED`) prevents HTTP request timeouts.

3. **Multi-Tool Consensus & Robustness Auditing:**
   - Runs `DESeq2`, `edgeR`, and `limma-voom` side-by-side.
   - Computes pairwise Jaccard similarity indices, UpSet set intersections, and identifies robust consensus DEGs.

4. **Dual-Mode Data Workflow:**
   - **Mode A (Raw Count Execution):** Accepts raw un-normalized count matrices, runs `AnalysisUnit` dataset profiling, validates biological replicates ($n \ge 2$), and computes DE via R microservice.
   - **Mode B (Pre-Calculated DEG Interpretation):** Accepts user-uploaded DEG result tables (DESeq2/edgeR/limma CSVs) for instant client-side Volcano, Heatmap, and GO enrichment visualization.

5. **Scientific Result Dashboard:**
   - Interactive Volcano plots, MA plots, PCA scatter plots, Sample Correlation Heatmaps, and GO enrichment charts built with Plotly.js.
   - Downloadable publication-ready CSV result tables and high-resolution figures.

---

## 🏗️ Architecture Overview

```text
               ┌──────────────────────────────────────────┐
               │           React / Next.js UI             │
               │   (Vercel Edge Deployment - Port 3000)   │
               │                                          │
               │  - Interactive Volcano & MA Plots        │
               │  - DE Method Consensus Heatmaps          │
               │  - Downstream Integration Dashboard      │
               └────────────────────┬─────────────────────┘
                                    │
                         REST API (JSON Handoff)
                                    │
               ┌────────────────────▼─────────────────────┐
               │          FastAPI Python Backend          │
               │   (Job Store & Validation - Port 8000)   │
               │                                          │
               │  - POST /api/analysis (Job Submission)   │
               │  - GET /api/analysis/{job_id} (Status)   │
               │  - GET /api/analysis/{job_id}/results    │
               └────────────────────┬─────────────────────┘
                                    │
                       Rscript File Handoff (CSVs)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐          ┌───────▼────────┐          ┌───────▼────────┐
│  DESeq2 (R)    │          │   edgeR (R)    │          │ limma-voom (R) │
│ - DESeqDataSet │          │ - DGEList      │          │ - voom()       │
│ - nbinomWaldTest          │ - glmQLFTest   │          │ - lmFit()      │
└────────────────┘          └────────────────┘          └────────────────┘
```

---

## 📁 Repository Structure

```text
bioinsight-360-app/
├── frontend/                   # Next.js React Application
│   ├── app/                    # App Router Pages (/upload, /qc, /consensus, /pathways, /export)
│   ├── components/             # UI Components (Navbar, Volcano, Heatmap, JaccardMatrix)
│   ├── lib/                    # API Clients & Visualization Helpers (backend_api.js, consensus.js)
│   ├── package.json            # Node.js dependencies
│   └── next.config.mjs         # Next.js Configuration
├── backend/                    # Python FastAPI & R Computational Microservice
│   ├── app/
│   │   ├── main.py             # FastAPI Server & REST Endpoints
│   │   ├── jobs/               # JobStore & Async Execution Pipeline (job_manager.py)
│   │   ├── analysis/           # Validation & Profiler Engine (validator.py, profiler.py)
│   │   ├── deseq2/             # deseq2_script.R
│   │   ├── edger/              # edger_script.R
│   │   └── limma/              # limma_script.R
│   ├── tests/                  # Pytest / Unittest Suite (test_backend.py)
│   ├── Dockerfile              # Docker container setup (Python 3.10 + R + Bioconductor)
│   └── requirements.txt        # Python dependencies
└── README.md
```

---

## 🚀 Quick Start & Development Setup

### 1. Running the Frontend Locally
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Running the Backend Locally
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run FastAPI server
uvicorn app.main:app --reload --port 8000
```

### 3. Running Tests
```bash
cd backend
.venv/bin/python3 tests/test_backend.py
```

---

## 🧪 Scientific Validation & Safety Safeguards

- **Integer Count Enforcement:** Raw count matrices containing floating-point values or normalized TPM/FPKM values are flagged and rounded with a warning before DESeq2/edgeR execution.
- **Biological Replicate Safeguard:** At least 2 biological replicates per group are strictly required to estimate dispersion.
- **Independent Method Reporting:** DESeq2, edgeR, and limma-voom outputs are stored and displayed independently. Consensus metrics calculate intersection overlap without altering single-method values.

---

## 📜 License & Citation

Licensed under the MIT License. Developed for reproducible transcriptomics and interactive computational biology.
