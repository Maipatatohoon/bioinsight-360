# BioInsight 360 — Full Audit & Roadmap

> Generated: 2026-09-23 | Deep analysis of 34 files across 33 commits
> Audited by: 2 parallel subagents (Component Auditor + Lib/API Auditor) + manual review

---

## Part 1: Complete Bug Registry

Every known issue in the codebase, categorized by severity. Audited across **all 34 source files**.

### 🔴 CRITICAL (Breaks functionality, produces wrong scientific results, or security risk)

| # | File | Bug | Impact |
|---|---|---|---|
| C1 | `components/AgreementHeatmap.js` | Uses sorted consensus index to look up `pipeline.results[gIdx]` — maps to **wrong gene** in raw pipeline data | Heatmap shows agreement data for completely wrong genes |
| C2 | `components/Navbar.js` | `Consensus`, `Pathways`, `Export` links use `href="#"` + `e.preventDefault()` | Users **cannot navigate** to 3/5 pages from the navbar |
| C3 | `components/DEGTable.js` | Consensus score bar divides by hardcoded `6` — shows 50% for a 3/3 downstream gene | Misleading visual in Downstream Mode |
| C4 | `components/UpSetPlot.js` | Hardcoded bins for 6 pipelines — shows empty bars 4/5/6 in Downstream Mode (3 pipelines) | Confusing chart in Downstream Mode |
| C5 | `components/PathwayChart.js` | `p.adjPValueMedian \|\| 1` treats p-value of `0` as `1` → bar width = 0 for most significant pathway | Most significant pathway invisible |
| C6 | `app/export/page.js` | Hardcoded "6-Pipeline" text in executive summary — wrong for Downstream Mode | Report factually incorrect for downstream users |
| C7 | `app/export/page.js` | `Math.min(...[])` → `Infinity` when all p-values are NaN → CSV shows "Infinity" | Corrupted export data |
| C8 | `app/export/page.js` | Uses `window.location.href` instead of `router.push` → wipes in-memory Storage | Full data loss on back-navigation |
| C9 | `app/qc/page.js` | PCA variance fallback hardcodes `[50, 30]` — fabricates explained variance | Researcher sees fake PCA stats |
| C10 | `app/qc/page.js` | Hardcoded `includes('control')` for group count display | Shows "0 Control" for datasets with non-standard group names |
| C11 | `lib/gprofiler_api.js` | `intersections.map(i => degs[i])` — g:Profiler returns gene names, not indices → `overlappingGenes` is all `undefined` | Pathway gene overlaps broken everywhere |
| C12 | `lib/consensus.js` | Limma column names `P.Value` / `adj.P.Val` not matched in downstream parser | All limma results get padj=1, appear non-significant |
| C13 | `app/api/ncbi/route.js` | **SSRF vulnerability**: `.endsWith('ncbi.nlm.nih.gov')` allows `evil-ncbi.nlm.nih.gov` | Security: open proxy to attacker domains |
| C14 | `app/api/ncbi/route.js` | `execSync('env \| grep proxy')` runs on **every HTTP request** — blocks event loop | 50-100ms added latency per request; crashes on Windows |
| C15 | `lib/qc.js` | High detection rate triggers `"Low detection rate"` outlier — labels reversed | Good samples flagged as outliers with wrong reason |
| C16 | `lib/enrichment.js` | Pathway consensus thresholds hardcoded (5/3/1 for 6 pipelines) — 3/3 downstream = "moderate" not "high" | Downstream mode undercounts high-confidence pathways |
| C17 | `app/consensus/page.js` | Initial `recalculateConsensus` hardcodes FC=1.0 instead of reading stored threshold | Slider shows 1.5 but first calculation uses 1.0 |
| C18 | `app/consensus/page.js` | Pipeline Breakdown splits on `' + '` but names use `'_'` → shows `undefined` for test name | Broken text in Pipeline Breakdown tab |
| C19 | `lib/statistics.js` | BH FDR: 15k low-expression genes assigned p=1 inflate `n`, crushing power for real genes | Genuine DEGs lost to multiple testing overcorrection |

### 🟡 MODERATE (Incorrect behavior, degraded UX, silent failures, or performance)

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
| M15 | `lib/mathUtils.js` | `regularizedIncompleteBeta` missing symmetry relation — diverges near x→1 | t-distribution CDF inaccurate for small t values |
| M16 | `lib/qc.js` | Spearman correlation returns 1.0 for zero-variance (all-zero) samples | Broken samples show "perfect" correlation |
| M17 | `lib/pca.js` | Expects `samples×genes` matrix but codebase uses `genes×samples` — relies on caller transposing | Fragile; wrong orientation → 3.2GB Gram matrix crash |
| M18 | `lib/gprofiler_api.js` | No timeout/AbortController — request hangs forever if g:Profiler is down | Export page stuck on spinner |
| M19 | `lib/quickgo_api.js` | Comment says "route through proxy" but fetches directly from `ebi.ac.uk` | CORS failures in some browsers |
| M20 | `lib/statistics.js` | Mann-Whitney U can **never** reach p<0.05 with n=3 per group (min exact p=0.10) | MWU pipelines always produce 0 DEGs for small datasets |
| M21 | `app/consensus/page.js` | Gene Inspector scans 240k items linearly per render (`.find()` on 20k × 6) | Visible lag when clicking genes |
| M22 | `lib/statistics.js` | Welch t-statistic sign is g1−g2 but log2FC is g2−g1 — inverted | `t` value sign misleading if inspected |
| M23 | `lib/enrichment.js` | Pathway consensus median p-value only includes pipelines that found the term | 1/6 pipelines reporting p=0.01 → median=0.01 instead of being penalized |
| M24 | `app/api/ncbi/route.js` | `rejectUnauthorized: false` disables TLS certificate validation | MITM attack vector on proxy traffic |
| M25 | `app/pathways/page.js` | `colSpan="7"` but table has 8 columns — empty/no-match rows misaligned | Visual glitch |
| M26 | `app/pathways/page.js` | `runAllPipelines` imported but never called | Dead import |
| M27 | `app/pathways/page.js` | `parseCSVRow` function defined but never called | Dead code (25 lines) |
| M28 | `lib/qc.js` | `stddev` imported but never used | Dead import |
| M29 | `lib/consensus.js` | `computeOverlapCoefficient` exported but never called anywhere | Dead code |
| M30 | `lib/mathUtils.js` | `log2(x)` function exported but never imported anywhere | Dead code |
| M31 | `__tests__/statistics.test.js` | `log2FoldChange` test passes by numerical coincidence — test comment describes wrong formula | False confidence in test suite |
| M32 | `__tests__/enrichment.test.js` | "Large term" test uses 501 × same gene → deduplicated to K=1, tests wrong filter | Upper bound filter (>500) never actually tested |

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
| L8 | `package.json` | Missing `"test"` script — `npm test` fails |
| L9 | `app/layout.js` | `metadata` lacks viewport/favicon/theme-color |
| L10 | `app/globals.css` | `.btn-secondary:hover` uses purple but `--accent-secondary` is teal |

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

### Dependency Audit

| Package | Status | Verdict |
|---|---|---|
| `next` 16.3.0 | ✅ Used | Core framework |
| `react` / `react-dom` 19.2.8 | ✅ Used | UI library |
| `framer-motion` 13.4.0 | ✅ Used | Page animations |
| `plotly.js` / `react-plotly.js` | ✅ Used | Charts — consider `plotly.js-dist-min` (3.5MB → 1MB) |
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

### Dead Exports (Never Imported)

| File | Export |
|---|---|
| `lib/consensus.js` | `computeOverlapCoefficient` |
| `lib/mathUtils.js` | `log2(x)` |
| `lib/qc.js` | `stddev` (imported but unused) |

---

## Part 3: Scientific Correctness Deep-Dive

Issues that could produce **scientifically wrong results** in a published paper.

### 1. Mann-Whitney U is useless for n=3 per group
The minimum possible exact two-tailed MWU p-value with n₁=n₂=3 is $\binom{6}{3}^{-1} \times 2 = 0.10$. **MWU can never reach p<0.05 with 3 samples per group.** This means 3 of the 6 compute-mode pipelines (CPM+MWU, UQ+MWU, MoR+MWU) always produce **zero DEGs** for typical RNA-seq sample sizes.

### 2. BH FDR overcorrection from low-expression genes
Genes with `meanExpr < 1` are assigned p=1 but still count toward `n` in BH correction. With 15,000 unexpressed genes, `n` inflates from ~5,000 to ~20,000, causing real DEGs to lose significance. **Fix**: exclude sub-threshold genes from the p-value array entirely, or use independent filtering (à la DESeq2).

### 3. g:Profiler overlapping genes are broken
`intersections.map(i => degs[i])` assumes integer indices, but g:Profiler returns gene name strings. Every pathway's `overlappingGenes` is an array of `undefined`. This means:
- Pathway table gene lists are empty
- Export CSV gene column is empty
- Pathway Inspector can't show which genes drive enrichment

### 4. Limma results silently ignored
Standard limma output uses `P.Value` and `adj.P.Val` (with dots). The downstream parser only checks `pvalue`, `PValue`, `pval`, `padj`, `FDR`. All limma genes get `padj=1` and appear non-significant.

### 5. Fleiss' Kappa returns 1.0 when no DEGs exist
When all genes are non-significant (all zeros in the binary matrix), $P_e = 1$, and the function returns 1.0 ("Almost Perfect Agreement"). This is mathematically indeterminate ($0/0$), and reporting it as perfect agreement is misleading.

### 6. Directional conflict not penalized
A gene upregulated in 3 pipelines and downregulated in 2 gets consensus score 5/6 ("High Confidence"), even though the sign conflict suggests the result is unreliable.

---

## Part 4: Performance Analysis

### Current Bottlenecks

| Page | Bottleneck | Impact | Status |
|---|---|---|---|
| Consensus | Slider fired full `recalculateConsensus` per pixel | ~200ms block per tick | ✅ FIXED (debounced) |
| Consensus | `Array.from(10k, () => Array(6))` per tick | GC pressure | ✅ FIXED (Uint8Array) |
| Consensus | 5× `.filter()` in render body | Every re-render | ✅ FIXED (useMemo) |
| Consensus | Volcano SVG scatter (15k points) | DOM node explosion | 🔲 Switch to `scattergl` |
| Consensus | Gene Inspector `.find()` on 20k×6 items | 240k iterations per click | 🔲 Use direct index |
| Consensus | `runAllPipelines` on main thread | Multi-second block | 🔲 Move to Web Worker |
| Upload | `Papa.parse` on main thread for 20k rows | 2-5s freeze | 🔲 Move to Worker |
| QC | Spearman correlation re-ranks same samples S-1 times | O(S²·G·log G) → O(S·G·log G) | 🔲 Pre-rank once |
| Export | Synchronous CSV string (120k lines) | Brief freeze | 🔲 Blob streaming |
| API | `execSync` per request | 50-100ms block | 🔲 Remove or cache |
| All | `@import` Google Fonts in CSS | Blocks FCP | 🔲 `next/font` |
| All | Full `plotly.js` (3.5MB) | Bundle bloat | 🔲 `plotly.js-dist-min` |

---

## Part 5: Prioritized Roadmap

### Phase A: Immediate Fixes (Before Submission) — ~2 hours

> Navigation, crashes, wrong data shown to user.

- [ ] **C2** — Fix Navbar: `href="/consensus"` etc. instead of `"#"`
- [ ] **C5** — PathwayChart: `p.adjPValueMedian ?? 1` instead of `|| 1`
- [ ] **C7** — Export CSV: guard `Math.min(...)` on empty array
- [ ] **C8** — Export: `router.push` instead of `window.location.href`
- [ ] **C9** — QC PCA: show "N/A" instead of fabricated `[50, 30]`
- [ ] **C11** — gprofiler: fix `overlappingGenes` to use returned gene names
- [ ] **C17** — Consensus: use stored FC for initial calculation
- [ ] **C18** — Consensus: split pipeline names on `'_'` not `' + '`
- [ ] **M3** — JaccardMatrix: `(val ?? 0).toFixed(2)`
- [ ] **M7/M8/M26/M27/M28** — Remove all dead imports and dead code
- [ ] **M12** — `npm uninstall axios https-proxy-agent node-fetch motion`
- [ ] **L8** — Add `"test": "jest"` to package.json scripts

### Phase B: Downstream Mode Parity — ~1 hour

> Make all components work correctly for 3-pipeline mode.

- [ ] **C3** — DEGTable: pass `totalPipelines` prop, divide by it
- [ ] **C4** — UpSetPlot: dynamically generate bins from pipeline count
- [ ] **C6** — Export: dynamic pipeline count in labels
- [ ] **C16** — enrichment.js: scale pathway thresholds to pipeline count
- [ ] **M25** — Pathways table: fix colSpan to 8

### Phase C: Scientific Correctness — ~2 hours

> Ensure no published result is scientifically misleading.

- [ ] **C1** — AgreementHeatmap: use `gene_index` from pipeline results
- [ ] **C10** — QC: use stored `activeControlGroup`
- [ ] **C12** — consensus.js: add `P.Value`, `adj.P.Val`, `gene`, `symbol`, `gene_name` to column matchers
- [ ] **C15** — qc.js: only flag LOW detection rate as outlier (remove high-rate false positive)
- [ ] **C19** — statistics.js: exclude sub-threshold genes from BH n
- [ ] **M14** — Standardize p-value metric (median vs min) across all views
- [ ] **M20** — Add warning banner when n<4 per group: "MWU cannot reach significance"
- [ ] **M22** — Align Welch t-statistic sign with log2FC direction

### Phase D: Security & API — ~30 min

- [ ] **C13** — Fix SSRF: exact domain match instead of `.endsWith()`
- [ ] **C14** — Remove `execSync` — read proxy env at module load, not per request
- [ ] **M24** — Remove `rejectUnauthorized: false`

### Phase E: Performance — ~2 hours

- [ ] **M1** — Switch volcano to `scattergl`
- [ ] **M6** — Move upload CSV parsing to Web Worker
- [ ] **M21** — Gene Inspector: direct O(1) index access
- [ ] **M10** — Replace `@import` with `next/font/google`

### Phase F: Post-Submission (Future)

- [ ] Python/R backend (FastAPI + DESeq2) for true statistical parity
- [ ] STRING protein interaction network
- [ ] IndexedDB for datasets > 5MB
- [ ] Batch effect correction (ComBat)
- [ ] `plotly.js-dist-min` for 70% bundle reduction
- [ ] Docker deployment image

---

## Part 6: What Works Well ✅

Despite the bugs, the core architecture is sound:

1. **Consensus voting framework** — mathematically clean, properly implements Fleiss' κ and Jaccard
2. **Normalization engines** — CPM, UQ, MedianOfRatios all implement standard algorithms correctly
3. **Benjamini-Hochberg FDR** — correctly implemented with monotone step-up correction
4. **g:Profiler integration** — proper background universe, multi-source, FDR-corrected
5. **Storage abstraction** — elegant hybrid sessionStorage + in-memory Map with graceful quota handling
6. **Outlier detection** — MAD-based robust z-scores (industry standard method)
7. **Downstream Mode concept** — scientifically defensible approach for publication-grade results
8. **Web Worker for QC** — properly offloads heavy computation from main thread
9. **Dual PCA** — mathematically correct Gram matrix approach for n << p datasets
10. **CPM filtering** — proper library-size-aware gene filtering

---

## Appendix: Commit History Summary

| Commits | Phase | Key Changes |
|---|---|---|
| 1–10 | Initial Build | Core pipeline, PCA, Web Workers, Vercel deploy |
| 11–20 | Critical Fixes | 0 DEGs fix, browser freeze, PCA rewrite, annotation columns |
| 21–28 | Scientific Audit | Log2FC formula, g:Profiler migration, export fix, KEGG/Reactome |
| 29–33 | Performance | Slider debounce, Uint8Array, useMemo, documentation |

**Total: 33 commits, 34 source files, 4,312 lines of application code**
