import { normalizeCPM, normalizeUpperQuartile, normalizeMedianOfRatios } from './normalize.js';
import { runDifferentialExpression } from './statistics.js';
import { median } from './mathUtils.js';

/**
 * Run all normalization and testing pipelines.
 */
export function runAllPipelines(rawMatrix, geneNames, groupIndices1, groupIndices2) {
  const normalizers = [
    { name: 'CPM', fn: normalizeCPM },
    { name: 'UQ', fn: normalizeUpperQuartile },
    { name: 'MedianRatios', fn: normalizeMedianOfRatios }
  ];
  const tests = ['welch', 'mannWhitney'];
  
  const pipelines = [];
  for (const norm of normalizers) {
    const normMatrix = norm.fn(rawMatrix);
    for (const test of tests) {
      const deRes = runDifferentialExpression(normMatrix, groupIndices1, groupIndices2, test);
      pipelines.push({ name: `${norm.name}_${test}`, results: deRes });
    }
  }
  return { pipelines, geneNames };
}

/**
 * Format pre-computed downstream DEGs (DESeq2, edgeR, limma) into pipeline structure.
 */
export function formatDownstreamPipelines(deseq2, edger, limma) {
  const geneSet = new Set();
  const extract = (data) => {
    if(!data) return;
    data.forEach(row => {
      const g = row.Gene_ID || row.Gene || row.id || row.ID;
      if (g) geneSet.add(g);
    });
  };
  
  extract(deseq2);
  extract(edger);
  extract(limma);

  const geneNames = Array.from(geneSet);
  const geneToIndex = new Map();
  geneNames.forEach((g, idx) => geneToIndex.set(g, idx));

  const createResults = (data) => {
    const results = new Array(geneNames.length).fill(null);
    if (!data) return results;
    
    data.forEach(row => {
      const g = row.Gene_ID || row.Gene || row.id || row.ID;
      const idx = geneToIndex.get(g);
      if (idx !== undefined) {
         results[idx] = {
             gene_index: idx,
             log2fc: parseFloat(row.logFC ?? row.log2FoldChange ?? 0),
             pvalue: parseFloat(row.pvalue ?? row.PValue ?? row.pval ?? row.padj ?? row.FDR ?? 1),
             padj: parseFloat(row.padj ?? row.FDR ?? row.pvalue ?? 1)
          };
      }
    });
    return results;
  };

  const pipelines = [];
  if (deseq2) pipelines.push({ name: 'DESeq2', results: createResults(deseq2) });
  if (edger) pipelines.push({ name: 'edgeR', results: createResults(edger) });
  if (limma) pipelines.push({ name: 'limma', results: createResults(limma) });

  return { pipelines, geneNames };
}

/**
 * Resolves which significance metric to use ('padj' vs 'pvalue').
 */
function resolvePMetric(pMetric, pipelines) {
  if (pMetric === 'padj' || pMetric === 'pvalue') {
    return pMetric;
  }
  // 'auto' mode:
  // If pipelines are from downstream tools (DESeq2, edgeR, limma), default to padj.
  // If pipelines are from browser compute tests (welch, mannWhitney), default to pvalue
  // because rank-based non-parametric tests on small sample sizes (N<=4) cannot mathematically
  // achieve padj <= 0.05 under Benjamini-Hochberg FDR correction.
  const hasDownstream = pipelines.some(p => p.name === 'DESeq2' || p.name === 'edgeR' || p.name === 'limma');
  return hasDownstream ? 'padj' : 'pvalue';
}

/**
 * Classify a gene based on its consensus score, dynamically scaled to total pipelines.
 */
export function classifyGene(consensusScore, totalPipelines = 6) {
  const ratio = consensusScore / totalPipelines;
  if (ratio >= 0.8) return 'high_confidence';      // 80%+ agreement
  if (ratio >= 0.5) return 'moderate_confidence';   // 50%+ agreement
  if (ratio >= 0.3) return 'method_sensitive';      // At least 2 pipelines
  return 'not_significant';
}

/**
 * Compute multi-pipeline consensus for each gene.
 * @param {Array} pipelines - Array of pipeline objects
 * @param {Array<string>} geneNames - Array of gene names
 * @param {number} fcThreshold - log2 fold change threshold
 * @param {number} pThreshold - p-value / padj cutoff
 * @param {string} [pMetric='auto'] - 'auto' | 'pvalue' | 'padj'
 */
export function computeConsensus(pipelines, geneNames, fcThreshold, pThreshold, pMetric = 'auto') {
  if (!pipelines || pipelines.length === 0 || !geneNames) return [];
  const numGenes = geneNames.length;
  const consensusResults = [];
  const activeMetric = resolvePMetric(pMetric, pipelines);

  for (let i = 0; i < numGenes; i++) {
    let sigCount = 0;
    const l2fcs = [];
    const pvals = [];
    const padjs = [];
    let posDirs = 0;
    let negDirs = 0;

    for (const pipe of pipelines) {
      const res = pipe.results[i];
      if (res) {
        if (!isNaN(res.log2fc)) l2fcs.push(res.log2fc);
        if (!isNaN(res.pvalue)) pvals.push(res.pvalue);
        if (!isNaN(res.padj)) padjs.push(res.padj);

        const metricVal = activeMetric === 'pvalue'
          ? (res.pvalue !== undefined ? res.pvalue : res.padj)
          : (res.padj !== undefined ? res.padj : res.pvalue);

        if (metricVal <= pThreshold && Math.abs(res.log2fc) >= fcThreshold) {
          sigCount++;
          if (res.log2fc > 0) posDirs++;
          else if (res.log2fc < 0) negDirs++;
        }
      }
    }

    consensusResults.push({
      geneName: geneNames[i],
      consensusScore: sigCount,
      category: classifyGene(sigCount, pipelines.length),
      log2fc_median: median(l2fcs),
      pvalues: pvals,
      padjs: padjs,
      pvalue_median: median(pvals),
      padj_median: median(padjs),
      activeMetric,
      directions: { positive: posDirs, negative: negDirs }
    });
  }

  return consensusResults;
}

/**
 * Compute Jaccard index between two sets.
 */
export function computeJaccard(setA, setB) {
  if (!setA || !setB) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

/**
 * Compute overlap coefficient between two sets.
 */
export function computeOverlapCoefficient(setA, setB) {
  if (!setA || !setB) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const minSize = Math.min(setA.size, setB.size);
  if (minSize === 0) return 1;
  return intersection.size / minSize;
}

/**
 * Compute Fleiss' Kappa for inter-rater agreement.
 * @param {Array<Array<number>>} matrix - Genes x Pipelines (0 or 1 values)
 */
export function computeFleissKappa(matrix) {
  if (!matrix || matrix.length === 0) return 0;
  const N = matrix.length;
  const n = matrix[0].length;
  if (n < 2) return n === 1 ? 1 : 0;
  
  const categoryCounts = [0, 0];
  const P = new Array(N).fill(0);
  
  for (let i = 0; i < N; i++) {
    let ones = 0;
    for (let j = 0; j < n; j++) {
      if (matrix[i][j]) {
        ones++;
        categoryCounts[1]++;
      } else {
        categoryCounts[0]++;
      }
    }
    P[i] = (ones * ones + (n - ones) * (n - ones) - n) / (n * (n - 1));
  }
  
  const P_bar = P.reduce((a, b) => a + b, 0) / N;
  const Pe = Math.pow(categoryCounts[0] / (N * n), 2) + Math.pow(categoryCounts[1] / (N * n), 2);
  
  if (Pe === 1) return 1;
  return (P_bar - Pe) / (1 - Pe);
}

/**
 * Compute pairwise Jaccard similarity between all pipelines.
 * @param {Array} pipelines - Array of pipeline objects
 * @param {number} fcThreshold - log2 fold change threshold
 * @param {number} pThreshold - p-value / padj cutoff
 * @param {string} [pMetric='auto'] - 'auto' | 'pvalue' | 'padj'
 */
export function computePairwiseJaccard(pipelines, fcThreshold, pThreshold, pMetric = 'auto') {
  if (!pipelines || pipelines.length === 0) return [];
  const activeMetric = resolvePMetric(pMetric, pipelines);

  const sigSets = pipelines.map(pipe => {
    const s = new Set();
    pipe.results.forEach(res => {
      if (res) {
        const metricVal = activeMetric === 'pvalue'
          ? (res.pvalue !== undefined ? res.pvalue : res.padj)
          : (res.padj !== undefined ? res.padj : res.pvalue);

        if (metricVal <= pThreshold && Math.abs(res.log2fc) >= fcThreshold) {
          s.add(res.gene_index);
        }
      }
    });
    return s;
  });

  const n = sigSets.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(1));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const jaccard = computeJaccard(sigSets[i], sigSets[j]);
      matrix[i][j] = jaccard;
      matrix[j][i] = jaccard;
    }
  }
  return matrix;
}
