# BioInsight 360 — Full Audit & Roadmap

> Generated: 2026-09-23 | Deep analysis of 34 files across 33 commits

---

## Part 1: Complete Bug Registry

Every known issue in the codebase, categorized by severity.

### 🔴 CRITICAL (Breaks functionality or produces wrong scientific results)

| # | File | Bug | Impact |
|---|---|---|---|
| C1 | `components/AgreementHeatmap.js` | Uses sorted consensus index to look up `pipeline.results[gIdx]` — maps to **wrong gene** in raw pipeline data | Heatmap shows agreement data for completely wrong genes |
| C2 | `components/Navbar.js` | `Consensus`, `Pathways`, `Export` links use `href="#"` + `e.preventDefault()` | Users **cannot navigate** to 3/5 pages from the navbar |
| C3 | `components/DEGTable.js` | Consensus score bar divides by hardcoded `6` — shows 50% for a 3/3 downstream gene | Misleading visual in Downstream Mode |
| C4 | `components/UpSetPlot.js` | Hardcoded bins for 6 pipelines — shows empty bars 4/5/6 in Downstream Mode (3 pipelines) | Confusing chart in Downstream Mode |
| C5 | `components/PathwayChart.js` | `p.adjPValueMedian || 1` treats p-value of `0` as `1` → bar width = 0 for most significant pathway | Most significant pathway invisible |
| C6 | `app/export/page.js` | Hardcoded "6-Pipeline" text in executive summary — wrong for Downstream Mode | Report factually incorrect for downstream users |
| C7 | `app/export/page.js` | `Math.min(...[])` → `Infinity` when all p-values are NaN → CSV shows "Infinity" | Corrupted export data |
| C8 | `app/export/page.js` | Uses `window.location.href` instead of `router.push` → wipes in-memory Storage | Full data loss on back-navigation |
| C9 | `app/qc/page.js` | PCA variance fallback hardcodes `[50, 30]` — fabricates explained variance | Researcher sees fake PCA stats |
| C10 | `app/qc/page.js` | Hardcoded `includes('control')` for group count display | Shows "0 Control" for datasets with non-standard group names |

### 🟡 MODERATE (Incorrect behavior, degraded UX, or silent failures)

| # | File | Bug | Impact |
|---|---|---|---|
| M1 | `components/ConsensusVolcano.js` | Uses `type: 'scatter'` (SVG) — 15k+ points causes severe lag | Volcano plot unusable for large datasets |
| M2 | `components/PCAScatter.js` | Any group not containing "control" is auto-labeled "Treated" | Multi-group experiments render incorrectly |
| M3 | `components/JaccardMatrix.js` | `val.toFixed(2)` crashes on `null`/`NaN` cells | Unhandled TypeError crashes component |
| M4 | `components/DEGTable.js` | `URL.createObjectURL` never revoked → memory leak on CSV download | Repeated downloads consume memory |
| M5 | `components/DEGTable.js` | Sorting by log2FC uses `Math.abs()` — can't sort from most-down to most-up regulated | Scientific workflow blocked |
| M6 | `app/upload/page.js` | Main thread `Papa.parse` for 20k+ row matrices → 2-5s UI freeze | Upload feels broken on real datasets |
| M7 | `app/qc/page.js` | 5 unused imports from `lib/qc` and `lib/pca` bloat bundle | Dead code |
| M8 | `app/export/page.js` | Unused import `runAllPipelines` | Dead code |
| M9 | `app/globals.css` | CSS variable names mislabeled: `--glow-cyan` is blue, `--glow-purple` is teal | Confusing for maintainers |
| M10 | `app/globals.css` | `@import` for Google Fonts blocks FCP | Performance hit |
| M11 | `components/BioLogo.js` | Static SVG gradient IDs (`bioGrad1`) duplicate when rendered twice | Rendering anomalies |
| M12 | `package.json` | `axios`, `https-proxy-agent`, `node-fetch`, `motion` are installed but never imported | ~2MB wasted node_modules |
| M13 | `lib/quickgo_annotations.js` | Entire file is dead code — replaced by `gprofiler_api.js` | 130 lines of unused code |
| M14 | `app/consensus/page.js` | Volcano/Heatmap p-value inconsistency: volcano uses median, table uses minimum | Genes appear significant in one view but not the other |

### 🟢 LOW (Style issues, a11y, minor polish)

| # | File | Bug |
|---|---|---|
| L1 | `app/globals.css` | Link hover color `#22d3ee` fails WCAG AA contrast (1.83:1) |
| L2 | `app/globals.css` | Unused styles: `.shimmer`, `.tooltip`, `.progress-bar` |
| L3 | `app/layout.js` | `data-scroll-behavior` attribute does nothing |
| L4 | `app/page.js` | SVGs lack `aria-hidden="true"` |
| L5 | `components/Navbar.js` | Mobile toggle button has no `aria-label` |
| L6 | `components/BioLogo.js` | Infinite SMIL animations ignore `prefers-reduced-motion` |
| L7 | `app/upload/page.js` | Duplicate `@keyframes fadeIn` in JSX `<style>` tag |

---

## Part 2: Architecture Deep-Dive

### Data Flow

```
User Upload (CSV/GEO/DEG)
          │
          ▼
    ┌─────────────┐     sessionStorage + in-memory Map
    │ upload/page  │────────────────────────────────────┐
    └──────┬──────┘                                     │
           │                                            │
           ▼                                            │
    ┌─────────────┐     Web Worker                      │
    │   qc/page   │◄──── qcWorker.js                    │
    └──────┬──────┘     (CPM filter, PCA, corr, QC)     │
           │                                            │
           ▼                                            │
    ┌──────────────┐    3×2 pipeline matrix              │
    │consensus/page│◄──── consensus.js                   │
    │              │     statistics.js                   │
    │              │     normalize.js                    │
    └──────┬──────┘                                     │
           │                                            │
           ▼                                            │
    ┌─────────────┐     g:Profiler API (external)       │
    │pathways/page│◄──── gprofiler_api.js                │
    │             │     enrichment.js                    │
    └──────┬──────┘                                     │
           │                                            │
           ▼                                            │
    ┌─────────────┐                                     │
    │ export/page │◄────────────────────────────────────┘
    │             │     (re-reads all from Storage)
    └─────────────┘
```

### File Dependency Graph

```
mathUtils.js ◄─── statistics.js ◄─── consensus.js
     ▲                                    ▲
     │                                    │
     ├──── normalize.js                   │
     ├──── qc.js                          │
     ├──── pca.js                         │
     └──── cpm_filter.js                  │
                                          │
gprofiler_api.js ◄─── enrichment.js ◄─── pathways/page.js
                                          │
quickgo_api.js ◄────────────────────── pathways/page.js
                                          │
storage.js ◄───────── ALL pages           │
geo_api.js ◄───────── upload/page.js      │
```

### Dependency Audit

| Package | Status | Verdict |
|---|---|---|
| `next` 16.3.0 | ✅ Used | Core framework |
| `react` / `react-dom` 19.2.8 | ✅ Used | UI library |
| `framer-motion` 13.4.0 | ✅ Used | Page animations |
| `plotly.js` / `react-plotly.js` | ✅ Used | Charts |
| `papaparse` 5.5.4 | ✅ Used | CSV parsing (upload only) |
| `html2pdf.js` 0.14.0 | ✅ Used | PDF export |
| `jest` 30.5.2 | ✅ Used | Tests (devDep) |
| `axios` 1.19.0 | ❌ Never imported | **DELETE** |
| `https-proxy-agent` 9.1.0 | ❌ Never imported | **DELETE** |
| `node-fetch` 3.3.2 | ❌ Never imported (Next.js has native fetch) | **DELETE** |
| `motion` 13.4.0 | ❌ Duplicate of framer-motion | **DELETE** |

### Dead Files

| File | Reason |
|---|---|
| `lib/quickgo_annotations.js` | Replaced by `gprofiler_api.js` — no imports |
| `benchmark.js` | Development artifact |
| `generate_presentation.py` | One-off script |
| `parse_pptx.py` | One-off script |

---

## Part 3: Performance Analysis

### Current Bottlenecks (Measured)

| Page | Bottleneck | Impact | Fix |
|---|---|---|---|
| Consensus | Slider fires `recalculateConsensus` on every pixel drag | UI blocks for ~200ms per tick on 10k genes | ✅ FIXED — debounced to 300ms |
| Consensus | `Array.from(10k, () => Array(6).fill(0))` per tick | GC pressure, jank | ✅ FIXED — Uint8Array |
| Consensus | 5× `.filter()` in render body | Runs on every re-render | ✅ FIXED — useMemo |
| Consensus | Volcano plot uses SVG scatter (15k points) | DOM node explosion, paint thrash | 🔲 Switch to `scattergl` |
| Upload | `Papa.parse` on main thread for 20k rows | 2-5s freeze | 🔲 Move to Web Worker |
| Export | Synchronous CSV string construction for 120k lines | Brief freeze on click | 🔲 Use Blob streaming |
| QC | Full CSV re-posted to worker on every slider change | Redundant parsing | 🔲 Cache matrix in worker |
| All | `@import` Google Fonts in CSS | Blocks FCP | 🔲 Use `next/font` |

---

## Part 4: Roadmap

### Phase A: Immediate Fixes (Before Submission)

> Priority: Anything that makes the app crash, show wrong data, or block navigation.

- [ ] **C2** — Fix Navbar: change `href="#"` → actual routes (`/consensus`, `/pathways`, `/export`)
- [ ] **C5** — Fix PathwayChart: `p.adjPValueMedian ?? 1` instead of `|| 1`
- [ ] **C7** — Fix Export CSV: guard `Math.min(...)` on empty filtered array
- [ ] **C8** — Fix Export back-nav: `router.push` instead of `window.location.href`
- [ ] **C9** — Fix PCA fallback: show "N/A" instead of fabricated `[50, 30]`
- [ ] **M7/M8** — Remove unused imports from `qc/page.js` and `export/page.js`
- [ ] **M12** — `npm uninstall axios https-proxy-agent node-fetch motion`

### Phase B: Downstream Mode Parity

> Priority: Make all components work correctly in 3-pipeline Downstream Mode.

- [ ] **C3** — DEGTable: pass `totalPipelines` prop, divide by it instead of 6
- [ ] **C4** — UpSetPlot: dynamically generate bins from pipeline count
- [ ] **C6** — Export: use `pipelineData.pipelines.length` for labels

### Phase C: Scientific Correctness

> Priority: Ensure no published result is scientifically wrong.

- [ ] **C1** — AgreementHeatmap: use `gene_index` from pipeline results, not sorted position
- [ ] **C10** — QC: use stored `activeControlGroup` for group display
- [ ] **M14** — Standardize p-value metric (median vs min) across volcano + table
- [ ] **M5** — DEGTable: option for signed vs absolute log2FC sorting

### Phase D: Performance

- [ ] **M1** — Switch volcano to `scattergl` for WebGL rendering
- [ ] **M6** — Move upload CSV parsing to Web Worker
- [ ] **M10** — Replace `@import` with `next/font/google`

### Phase E: Post-Submission (Future)

- [ ] Python/R backend (FastAPI + DESeq2) for true statistical parity
- [ ] STRING protein interaction network
- [ ] IndexedDB for datasets > 5MB
- [ ] Batch effect correction (ComBat)
- [ ] Docker deployment image

---

## Part 5: What Works Well ✅

Despite the bugs, the core architecture is sound:

1. **Consensus voting framework** — mathematically clean, properly implements Fleiss' κ and Jaccard
2. **Normalization engines** — CPM, UQ, MedianOfRatios all implement standard algorithms correctly
3. **Benjamini-Hochberg FDR** — correctly implemented with monotone correction
4. **g:Profiler integration** — proper background universe, multi-source, FDR-corrected
5. **Storage abstraction** — elegant hybrid sessionStorage + in-memory Map
6. **Outlier detection** — MAD-based robust z-scores (industry standard)
7. **Downstream Mode concept** — scientifically defensible approach for publication
