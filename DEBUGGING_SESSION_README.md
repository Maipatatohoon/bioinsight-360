# BioInsight 360 - Debugging & Audit Session History

This document serves as a comprehensive record of the critical debugging, scientific auditing, and architectural decisions made to stabilize the BioInsight 360 application prior to submission.

## 1. The Core Issues Reported
The session began with a **Critical Emergency Failure** across two main areas:
1. **Differential Expression Discrepancy:** The application's Log2 Fold Change (Log2FC) and p-values were substantially different from authentic manual `DESeq2` outputs.
2. **Browser Freezing (GO Enrichment):** Navigating to the Pathways or Export page caused the browser to hang indefinitely, failing to generate Biological Process enrichment.

## 2. What We Audited & What Went Wrong

### Issue A: The Log2 Fold Change (Log2FC) Mathematical Flaw
* **What was happening:** The JavaScript statistical engine was calculating Log2FC by taking the mean of the log2-transformed counts (`mean(log2(treated + 1)) - mean(log2(control + 1))`). 
* **Why it was wrong:** For highly dispersed RNA-seq counts, this effectively computes the log of the geometric mean ratio, which severely compresses and suppresses the magnitude of fold changes.
* **The Fix:** Rewrote the calculation in `lib/statistics.js` to properly compute the log2 of the ratio of the arithmetic means: `Math.log2(m1 + 1) - Math.log2(m2 + 1)`. Unit tests were updated to enforce precision tolerances.

### Issue B: The QuickGO Enrichment Browser Freeze
* **What was happening:** To calculate hypergeometric p-values locally, the application attempted to download the GO annotations for the *entire* experiment universe (~15,000+ genes) directly into the browser.
* **Why it was wrong:** This triggered a pagination loop that fired 150+ sequential HTTP GET requests to the EBI QuickGO API. The browser's memory and network queue were exhausted, causing an infinite hang on the "Pathways" and "Export" pages.
* **The Fix:** We completely removed the local hypergeometric calculation and the naive QuickGO API integration. We replaced it with a single, highly optimized REST call to the **g:Profiler API** (`lib/gprofiler_api.js`). This shifted the heavy lifting to a dedicated bioinformatics server, resolving the enrichment in milliseconds with proper FDR correction.

### Issue C: Missing Proposal Promises
* **What was happening:** The original project proposal promised biological interpretation using KEGG, Reactome, and Disease databases, but only GO:BP was implemented.
* **The Fix:** We expanded the `g:Profiler` API payload to query `["GO:BP", "KEGG", "REAC", "HP"]` simultaneously. We updated the React UI and CSV Export logic to dynamically display the "Source DB" for every enriched pathway, instantly fulfilling the proposal's requirements.

## 3. The "True DESeq2" Architectural Decision
A major focus of the session was addressing the fundamental truth that **JavaScript's Welch's T-Test and Mann-Whitney U will never 1:1 match DESeq2.**

* **The Limitation:** DESeq2 uses empirical Bayes dispersion shrinkage and a Negative Binomial generalized linear model. JavaScript statistical libraries do not.
* **What We Considered:** We evaluated tearing out the JavaScript compute engine and building a Python (FastAPI) + R (DESeq2) backend.
* **The Decision:** Due to the extremely tight deadline and the immense deployment complexity of hosting an R/DESeq2 server (which requires heavy RAM, Docker, and paid cloud hosting), we decided against building a new backend.
* **The Solution:** We pivoted the project's scientific defense to **Downstream Mode**. By allowing users to upload their authentic, pre-computed DESeq2/edgeR/limma results, the application acts as a 100% accurate visualizer and consensus orchestrator. The "Compute Mode" remains as a rapid, in-browser exploratory tool using Welch's test, which is mathematically correct for what it is, but explicitly disclaimed as not being DESeq2.

## 4. Final Status
* **Build:** `npm run build` succeeds (10/10 static pages compiled).
* **Tests:** `npx jest` succeeds (6/6 tests passing).
* **Stability:** The application no longer crashes or hangs.
* **Features:** Upload, QC, Consensus, Pathways (GO, KEGG, Reactome, HP), and CSV/PDF Exports are fully functional.
