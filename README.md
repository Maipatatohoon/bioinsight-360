# BioInsight 360

**A browser-based, multi-method RNA-seq differential expression and pathway enrichment analysis platform.**

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-blue)](https://react.dev)
[![License](https://img.shields.io/badge/License-Academic-green)]()
[![Deploy](https://img.shields.io/badge/Deployed-Vercel-000)](https://bioinsight-360.vercel.app)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Installation & Setup](#installation--setup)
- [Usage Guide](#usage-guide)
- [Scientific Methodology](#scientific-methodology)
- [Known Limitations & Transparency](#known-limitations--transparency)
- [Project Structure](#project-structure)
- [Development History & Debugging Log](#development-history--debugging-log)
- [Roadmap](#roadmap)
- [References](#references)

---

## Overview

BioInsight 360 is a client-side RNA-seq analysis platform built with Next.js and React. It provides two operational modes:

1. **Compute Mode** — Upload a raw count matrix and metadata CSV. The app runs 6 parallel analytical pipelines (3 normalizations × 2 statistical tests) entirely in the browser, computes multi-method consensus, and performs GO/KEGG/Reactome pathway enrichment.

2. **Downstream Mode** — Upload pre-computed results from DESeq2, edgeR, and/or limma (from R/Python). The app acts as a consensus orchestrator and visualizer, providing 100% faithful representation of your tool outputs with no re-calculation.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Client-side computation | Zero server cost, instant deployment on Vercel, no user data leaves the browser |
| Welch's t-test + Mann-Whitney U (not DESeq2) | DESeq2 requires R runtime; Welch's/MWU are mathematically valid parametric/non-parametric alternatives for exploratory analysis |
| g:Profiler API for enrichment | Server-side enrichment with proper FDR correction; eliminates the need to download entire GO databases into the browser |
| sessionStorage + in-memory Map for state | Avoids backend database; survives page navigation but not browser close (by design — ephemeral analysis sessions) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (React 19)                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  app/upload    → Data ingestion (CSV, GEO, DEG upload)  │
│  app/qc        → Quality control (PCA, outliers, filter)│
│  app/consensus → 6-pipeline DE + consensus scoring      │
│  app/pathways  → GO/KEGG/Reactome/HP enrichment         │
│  app/export    → CSV/PDF report generation              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                   Computational Engine (lib/)            │
├────────────┬────────────┬────────────┬──────────────────┤
│ statistics │ normalize  │ consensus  │ enrichment       │
│ .js        │ .js        │ .js        │ .js              │
│            │            │            │                  │
│ • Welch t  │ • CPM      │ • Vote     │ • Hypergeometric │
│ • MWU      │ • UQ       │ • Fleiss κ │ • BH correction  │
│ • Cohen's d│ • MoR      │ • Jaccard  │ • g:Profiler API │
│ • BH FDR   │            │ • Overlap  │                  │
├────────────┴────────────┴────────────┴──────────────────┤
│  mathUtils.js — Gamma, Beta, CDF, Hypergeometric, etc.  │
│  pca.js — Power-iteration SVD for browser PCA           │
│  qc.js — Library size, detection rate, outlier detection │
│  cpm_filter.js — Low-expression gene filtering          │
│  storage.js — Hybrid sessionStorage + in-memory Map     │
├─────────────────────────────────────────────────────────┤
│                   External APIs                         │
│  • g:Profiler (biit.cs.ut.ee) — GO/KEGG/REAC/HP enrich │
│  • EBI QuickGO — GO term detail lookup                  │
│  • NCBI GEO — Public dataset fetching                   │
└─────────────────────────────────────────────────────────┘
```

---

## Features

### Data Input
- **Local CSV Upload** — Drag-and-drop count matrix + metadata
- **NCBI GEO Integration** — Fetch public datasets by accession (e.g., GSE52778)
- **Downstream DEG Upload** — Import DESeq2/edgeR/limma result CSVs directly
- **Demo Dataset** — Pre-loaded Himes et al. 2014 airway dataset (200 genes × 8 samples)

### Quality Control
- Library size distribution bar chart
- Gene detection rate per sample
- **PCA** (power-iteration SVD, no external library)
- Sample-to-sample Spearman correlation heatmap
- Outlier detection using robust z-scores (MAD-based)
- Interactive CPM threshold slider with live gene filtering

### Differential Expression
- **6 parallel pipelines**: CPM/UQ/MedianRatios × Welch/Mann-Whitney
- Benjamini-Hochberg FDR correction per pipeline
- Log2 Fold Change with +1 pseudocount
- Cohen's d effect size
- Minimum expression filter (mean CPM < 1 → skip)

### Consensus Analysis
- Per-gene voting across all pipelines
- Classification: High Confidence (≥80%), Moderate (≥50%), Method-Sensitive (≥30%)
- **Fleiss' Kappa** inter-rater agreement
- **Pairwise Jaccard similarity** matrix
- Interactive volcano plot (Plotly.js)
- UpSet plot for pipeline intersection visualization
- **Debounced** threshold sliders (FC + p-value) for real-time re-evaluation

### Pathway Enrichment
- **g:Profiler API** integration for server-side enrichment
- **4 databases simultaneously**: GO:BP, KEGG, Reactome, Human Phenotype Ontology
- Custom background universe (experiment genes only — not whole genome)
- FDR-corrected p-values
- Pathway consensus scoring across pipelines
- GO term detail inspector (via QuickGO API)

### Export
- Consensus DEG table (CSV)
- Full multi-pipeline results (CSV)
- Pathway consensus table with Source DB column (CSV)
- PDF report generation (html2pdf.js)

---

## Installation & Setup

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Quick Start
```bash
git clone https://github.com/YOUR_USERNAME/bioinsight-360-app.git
cd bioinsight-360-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build
```bash
npm run build
npm start
```

### Run Tests
```bash
NODE_OPTIONS="--experimental-vm-modules" npx jest
```

### Deploy to Vercel
```bash
npx vercel --prod
```

---

## Usage Guide

### Mode 1: Compute Mode (Exploratory Analysis)
1. Navigate to **Upload** → select "Upload Count Matrix"
2. Upload your `counts.csv` (genes × samples) and `metadata.csv` (sample, group)
3. Click **Proceed to QC** → adjust CPM threshold → proceed
4. **Consensus** page runs 6 pipelines automatically → adjust FC/p-value sliders
5. **Pathways** page queries g:Profiler for enrichment
6. **Export** page downloads CSVs and PDF report

### Mode 2: Downstream Mode (Publication-Grade)
1. Navigate to **Upload** → select "Upload Pre-computed DEGs"
2. Upload CSV files from DESeq2, edgeR, and/or limma
3. Required columns: `Gene_ID` (or `Gene`/`id`), `log2FoldChange` (or `logFC`), `padj` (or `FDR`)
4. The app computes consensus across your uploaded tools — **no re-calculation of statistics**

### Mode 3: GEO Fetch
1. Navigate to **Upload** → select "Fetch from NCBI GEO"
2. Enter a GEO accession (e.g., `GSE52778`)
3. The app fetches metadata via the NCBI API

---

## Scientific Methodology

### Normalization Methods

| Method | Formula | Reference |
|---|---|---|
| CPM | count / (library_size) × 10⁶ | Robinson & Oshlack, 2010 |
| Upper Quartile | count / (75th percentile) × mean(UQ) | Bullard et al., 2010 |
| Median of Ratios | count / size_factor (DESeq2-style) | Anders & Huber, 2010 |

### Statistical Tests

| Test | Assumptions | Use Case |
|---|---|---|
| Welch's t-test | Unequal variances, approximate normality (log-transformed) | Primary parametric test |
| Mann-Whitney U | Non-parametric, rank-based | Robust alternative when normality is violated |

### Multiple Testing Correction
- **Benjamini-Hochberg** (BH) procedure applied per-pipeline
- Controls False Discovery Rate (FDR) at user-specified threshold (default 0.05)

### Consensus Scoring
- Each pipeline votes independently (1 if |log2FC| ≥ threshold AND padj ≤ threshold, else 0)
- Consensus score = sum of votes across pipelines
- Classification thresholds scale dynamically with pipeline count

### Enrichment
- **g:Profiler** API with custom background (experiment universe only)
- Sources: GO:BP, KEGG, Reactome, Human Phenotype Ontology (HP)
- FDR correction: g:SCS (Set Counts and Sizes) method
- Pathway consensus: enrichment repeated per-pipeline, then voted across

---

## Known Limitations & Transparency

> **IMPORTANT**: This section exists for scientific integrity. Read before citing results.

### 1. Compute Mode ≠ DESeq2
The browser-based Compute Mode uses **Welch's t-test** and **Mann-Whitney U** on normalized counts. These are valid statistical tests but they are **fundamentally different** from DESeq2's negative binomial generalized linear model with empirical Bayes dispersion shrinkage. Results will differ from manual DESeq2 runs. For publication-grade results, use **Downstream Mode** with authentic DESeq2 output.

### 2. PCA is Approximate
The PCA implementation uses power iteration (not full eigendecomposition) for browser performance. PC1/PC2 explain similar variance patterns but eigenvalues may differ slightly from R's `prcomp()`.

### 3. Small Sample Sizes
Welch's t-test and Mann-Whitney U lose statistical power with very small groups (n < 3 per group). With 2 vs 2 designs, p-values will be conservative.

### 4. sessionStorage Limits
Large datasets (>5MB count matrix) may exceed sessionStorage quota. The app falls back to in-memory storage, which is lost on page refresh.

### 5. g:Profiler Dependency
Pathway enrichment requires internet connectivity to reach the g:Profiler API (biit.cs.ut.ee). Offline mode is not supported for enrichment.

---

## Project Structure

```
bioinsight-360-app/
├── app/
│   ├── page.js                 # Landing page
│   ├── layout.js               # Root layout + Navbar
│   ├── globals.css             # Design system (CSS variables, glass cards)
│   ├── upload/page.js          # Data upload (local CSV, GEO, DEG)
│   ├── qc/page.js              # Quality control dashboard
│   ├── consensus/page.js       # Multi-pipeline DE + consensus
│   ├── pathways/page.js        # GO/KEGG/Reactome enrichment
│   ├── export/page.js          # Report generation & CSV download
│   └── api/ncbi/route.js       # Server-side proxy for NCBI GEO API
├── components/
│   ├── Navbar.js               # Navigation bar
│   ├── ConsensusVolcano.js     # Plotly volcano plot
│   ├── AgreementHeatmap.js     # Pipeline agreement heatmap
│   ├── DEGTable.js             # Sortable/searchable DEG table
│   ├── PCAScatter.js           # PCA scatter plot (Plotly)
│   ├── PathwayChart.js         # Pathway bar chart
│   ├── UpSetPlot.js            # UpSet intersection plot
│   ├── JaccardMatrix.js        # Jaccard similarity matrix
│   └── BioLogo.js              # Animated logo
├── lib/
│   ├── statistics.js           # Welch, MWU, Cohen's d, BH, log2FC
│   ├── mathUtils.js            # Gamma, Beta, CDF, hypergeometric
│   ├── normalize.js            # CPM, UQ, MedianOfRatios
│   ├── consensus.js            # Pipeline orchestrator + consensus
│   ├── enrichment.js           # Hypergeometric test + pathway consensus
│   ├── gprofiler_api.js        # g:Profiler REST API client
│   ├── quickgo_api.js          # QuickGO term detail API
│   ├── quickgo_annotations.js  # Legacy QuickGO annotation fetcher (unused)
│   ├── pca.js                  # Power-iteration PCA
│   ├── qc.js                   # Library size, detection, outliers
│   ├── cpm_filter.js           # CPM-based gene filtering
│   ├── geo_api.js              # NCBI GEO metadata fetcher
│   └── storage.js              # Hybrid sessionStorage + memory
├── public/
│   ├── data/
│   │   ├── demo_counts.csv     # Demo dataset (Himes et al. 2014)
│   │   └── demo_metadata.csv   # Demo metadata
│   └── workers/
│       └── qcWorker.js         # Web Worker for QC computation
├── __tests__/
│   ├── statistics.test.js      # Unit tests for statistical functions
│   └── enrichment.test.js      # Unit tests for enrichment logic
├── package.json
├── next.config.mjs
└── README.md                   # This file
```

---

## Development History & Debugging Log

This project went through 33 commits across multiple debugging sessions. Below is a comprehensive record of every major issue encountered and how it was resolved.

### Phase 1: Initial Build (Commits 1–10)
- Built core pipeline: Upload → QC → Consensus → Pathways → Export
- Implemented PCA via power iteration
- Added Web Workers for QC computation to prevent UI freeze
- Deployed to Vercel

### Phase 2: Critical Bug Fixes (Commits 11–20)

| Bug | Root Cause | Fix |
|---|---|---|
| **0 DEGs detected** | `padj` filtering was too strict for small datasets; unadjusted p-value was needed as fallback | Added fallback to raw p-value when padj produces 0 results |
| **Browser freeze on upload** | CSV parsing blocked the main thread | Moved parsing to Web Worker |
| **PCA eigenvalues wrong** | Power iteration wasn't converging; deflation step was incorrect | Rewrote PCA with proper Gram-Schmidt orthogonalization |
| **Annotation columns crashing QC** | featureCounts output includes Chr/Start/End/Strand/Length columns that aren't samples | Strip non-numeric columns during upload parsing |
| **Empty pathways** | GO annotations were loaded from a static 60-gene JSON file | Built dynamic QuickGO API integration |
| **Outlier detection too sensitive** | Used mean ± 2σ (assumes normal distribution) | Switched to MAD-based robust z-scores |

### Phase 3: Scientific Audit (Commits 21–28)

| Bug | Root Cause | Fix |
|---|---|---|
| **Log2FC magnitude too small** | Calculated `mean(log2(x))` instead of `log2(mean(x))` — geometric vs arithmetic mean | Rewrote to `Math.log2(mean + 1) - Math.log2(mean + 1)` |
| **GO enrichment browser hang** | Downloaded entire QuickGO annotation DB (150+ HTTP requests) into browser | Replaced with single g:Profiler API call |
| **Export page infinite loading** | Still used old QuickGO code path | Migrated export to g:Profiler API |
| **Custom dataset → 0 DEGs** | Group string matching failed for non-standard group names | Added intelligent fallback with case-insensitive matching |
| **Missing KEGG/Reactome** | Only queried GO:BP | Expanded g:Profiler sources to `["GO:BP", "KEGG", "REAC", "HP"]` |

### Phase 4: Performance Optimization (Commits 29–33)

| Bug | Root Cause | Fix |
|---|---|---|
| **App became laggy on consensus page** | Slider fired full `recalculateConsensus` on every pixel drag — no debounce | Added 300ms ref-based debounce via `useRef` + `setTimeout` |
| **Excessive GC pressure** | `Array.from({ length: 10000 }, () => new Array(6).fill(0))` on every slider tick | Replaced with flat `Uint8Array(numGenes * numPipelines)` |
| **5 redundant `.filter()` calls per render** | `highConfCount`, `modConfCount`, etc. ran full array scan on every React re-render | Consolidated into single `useMemo` with one-pass `for` loop |

---

## Roadmap

### ✅ Completed
- [x] Multi-format data upload (CSV, GEO, pre-computed DEGs)
- [x] Quality control with PCA, outlier detection, correlation
- [x] 6-pipeline consensus differential expression
- [x] Fleiss' Kappa + Jaccard agreement metrics
- [x] GO/KEGG/Reactome/HP pathway enrichment via g:Profiler
- [x] Interactive volcano plot, heatmaps, UpSet plot
- [x] CSV + PDF export
- [x] Debounced threshold controls
- [x] Performance optimization (typed arrays, memoization)

### 🔲 Future Improvements (Post-Submission)
- [ ] **Python/R Backend** — FastAPI server with true DESeq2/edgeR execution for 1:1 result parity
- [ ] **STRING API Integration** — Protein-protein interaction network visualization
- [ ] **Batch Effect Correction** — ComBat or RUV integration
- [ ] **TPM Normalization** — Requires gene length annotation file
- [ ] **Offline Enrichment** — Bundle a compressed GO/KEGG database for offline use
- [ ] **IndexedDB Storage** — Replace sessionStorage for datasets >5MB
- [ ] **Multi-contrast Support** — Compare more than 2 groups simultaneously
- [ ] **Docker Image** — One-command deployment with R + Python + Node.js

### 🐛 Known Issues (Non-Blocking)
- `quickgo_annotations.js` is still in the codebase but unused (dead code)
- `papaparse` is listed as a dependency but only used in upload page (could be replaced with native CSV parsing for bundle size)
- `axios` and `https-proxy-agent` are in package.json but never imported anywhere (dead dependencies)
- `motion` and `framer-motion` are both listed — only `framer-motion` is needed

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| next | 16.3.0 | React framework |
| react / react-dom | 19.2.8 | UI library |
| framer-motion | 13.4.0 | Page transitions and animations |
| plotly.js / react-plotly.js | 3.7.0 / 4.1.0 | Interactive scientific charts |
| papaparse | 5.5.4 | CSV parsing |
| html2pdf.js | 0.14.0 | Client-side PDF generation |
| jest | 30.5.2 | Unit testing (dev) |

### Unused Dependencies (Can Be Removed)
- `axios` — no imports found
- `https-proxy-agent` — no imports found
- `motion` — duplicate of `framer-motion`
- `node-fetch` — Next.js 16 has native fetch

---

## References

1. Anders, S. & Huber, W. (2010). Differential expression analysis for sequence count data. *Genome Biology*, 11(10), R106.
2. Robinson, M.D. & Oshlack, A. (2010). A scaling normalization method for differential expression analysis of RNA-seq data. *Genome Biology*, 11(3), R25.
3. Bullard, J.H. et al. (2010). Evaluation of statistical methods for normalization and differential expression in mRNA-Seq experiments. *BMC Bioinformatics*, 11, 94.
4. Benjamini, Y. & Hochberg, Y. (1995). Controlling the false discovery rate. *JRSS-B*, 57(1), 289–300.
5. Himes, B.E. et al. (2014). RNA-Seq transcriptome profiling identifies CRISPLD2 as a glucocorticoid responsive gene. *PLoS ONE*, 9(6), e99625.
6. Raudvere, U. et al. (2019). g:Profiler: a web server for functional enrichment analysis. *Nucleic Acids Research*, 47(W1), W191–W198.

---

## License

Academic use only. Not for clinical or diagnostic purposes.
