# BioInsight 360 Scientific Methodology & Statistical Specifications

## 1. Differential Expression Frameworks

BioInsight 360 integrates three gold-standard, peer-reviewed Bioconductor differential expression engines:

### 1. DESeq2 (Love et al., 2014)
- **Model:** Negative Binomial Generalized Linear Model (GLM).
- **Normalization:** Median-of-ratios method (`estimateSizeFactors`).
- **Dispersion:** Maximum a posteriori (MAP) dispersion shrinkage (`estimateDispersions`).
- **Hypothesis Testing:** Wald Test (`nbinomWaldTest`) for coefficient significance.

### 2. edgeR (Robinson et al., 2010)
- **Model:** Negative Binomial GLM with Quasi-Likelihood (QL) framework.
- **Normalization:** Trimmed Mean of M-values (`calcNormFactors(method="TMM")`).
- **Dispersion:** Empirical Bayes trended dispersion estimation (`estimateDisp`).
- **Hypothesis Testing:** QL F-Test (`glmQLFTest`) to account for gene-specific variance uncertainty.

### 3. limma-voom (Law et al., 2014)
- **Model:** Linear Modeling on log-counts per million (`log-CPM`).
- **Precision Weighting:** `voom` transformation estimates mean-variance relationship to compute observation-level precision weights.
- **Hypothesis Testing:** Empirical Bayes moderated t-statistics (`eBayes`).

---

## 2. Multiple Testing Correction

- **FDR Adjustment:** Benjamini-Hochberg (BH) procedure is applied to raw $p$-values to control the False Discovery Rate at $\alpha = 0.05$.
- **Metric Definitions:**
  - `log2FoldChange`: $\log_2(\text{Treatment} / \text{Control})$ ratio.
  - `baseMean` / `AveExpr`: Mean normalized expression across all samples.
  - `pvalue`: Raw statistical significance value.
  - `padj` / `FDR`: Adjusted $p$-value after Benjamini-Hochberg correction.

---

## 3. Multi-Tool Consensus Metrics

- **Jaccard Similarity Index:**
  $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
  Measures overall DEG list concordance between engine pairs ($A$ and $B$).

- **Consensus DEG Categorization:**
  - **High-Confidence DEGs:** Significant in $\ge 80\%$ of active engines with consistent fold-change direction.
  - **Moderate-Confidence DEGs:** Significant in $\ge 50\%$ of active engines.
  - **Method-Sensitive DEGs:** Significant in only 1 engine (method-specific artifact candidate).
