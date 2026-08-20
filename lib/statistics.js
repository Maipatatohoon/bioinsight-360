import { mean, variance, tDistCDF, rank, normalCDF } from './mathUtils.js';

/**
 * Perform Welch's t-test for two unequal variance samples.
 */
export function welchTTest(group1, group2) {
  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);
  const n1 = group1.length;
  const n2 = group2.length;
  
  if (n1 < 2 || n2 < 2 || (v1 === 0 && v2 === 0)) return { t: 0, df: 1, pvalue: 1 };
  
  const t = (m1 - m2) / Math.sqrt((v1 / n1) + (v2 / n2));
  const dfNum = Math.pow((v1 / n1) + (v2 / n2), 2);
  const dfDen = Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1);
  const df = dfNum / dfDen;
  
  const pvalue = 2 * (1 - tDistCDF(Math.abs(t), df));
  return { t, df, pvalue };
}

/**
 * Perform Mann-Whitney U test (Normal approximation).
 */
export function mannWhitneyU(group1, group2) {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 === 0 || n2 === 0) return { U: 0, z: 0, pvalue: 1 };
  
  const all = [...group1, ...group2];
  const ranks = rank(all);
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  
  const mU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigmaU === 0 ? 0 : (U - mU) / sigmaU;
  
  const pvalue = 2 * normalCDF(-Math.abs(z));
  return { U, z, pvalue };
}

/**
 * Calculate log2 Fold Change with pseudocounts.
 */
export function log2FoldChange(treated, control) {
  const m1 = mean(treated);
  const m2 = mean(control);
  return Math.log2((m1 + 1) / (m2 + 1));
}

/**
 * Calculate Cohen's d effect size.
 */
export function cohensD(group1, group2) {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 < 2 || n2 < 2) return 0;
  
  const v1 = variance(group1);
  const v2 = variance(group2);
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  if (pooledSd === 0) return 0;
  return (mean(group1) - mean(group2)) / pooledSd;
}

/**
 * Apply Benjamini-Hochberg FDR correction.
 */
export function benjaminiHochberg(pvalues) {
  const n = pvalues.length;
  const sorted = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const padj = new Array(n);
  let minPrev = 1;
  
  for (let i = n - 1; i >= 0; i--) {
    const q = (sorted[i].p * n) / (i + 1);
    minPrev = Math.min(minPrev, q);
    padj[sorted[i].i] = minPrev;
  }
  return padj;
}

/**
 * Run differential expression for all genes.
 */
export function runDifferentialExpression(matrix, groupIndices1, groupIndices2, test = 'welch') {
  if (!matrix || matrix.length === 0) return [];
  const results = [];
  const pvalues = [];
  
  for (let i = 0; i < matrix.length; i++) {
    const geneExpr = matrix[i];
    const g1 = groupIndices1.map(idx => geneExpr[idx]);
    const g2 = groupIndices2.map(idx => geneExpr[idx]);
    
    const l2fc = log2FoldChange(g1, g2);
    const d = cohensD(g1, g2);
    let pval = 1;
    
    if (test === 'welch') {
      pval = welchTTest(g1, g2).pvalue;
    } else {
      pval = mannWhitneyU(g1, g2).pvalue;
    }
    
    pvalues.push(pval);
    results.push({ gene_index: i, log2fc: l2fc, pvalue: pval, padj: 1, cohens_d: d });
  }
  
  const padjs = benjaminiHochberg(pvalues);
  for (let i = 0; i < results.length; i++) {
    results[i].padj = padjs[i];
  }
  
  return results;
}
